const { evaluateIssueContext } = require('./openrouter');
const { classifyIssue } = require('./openrouter');
const firestore = require('./firestore');
const { buildIssueEmbed, findTriageChannel, postIssueEmbed } = require('./triage');
const { resolveAuthorRole } = require('./authorRole');
const { buildReceipt } = require('./receipt');

async function evaluateContext(issue, conversationHistory, extraHint) {
  return evaluateIssueContext(issue, conversationHistory, extraHint);
}

async function processEvaluation(guild, issue, issueId, evaluation) {
  // Update triage embed if there's new context to show
  if (evaluation.triageUpdate && issue.triageMessageId) {
    const triageChannel = findTriageChannel(guild, issue.target);
    if (triageChannel) {
      try {
        const triageMsg = await triageChannel.messages.fetch(issue.triageMessageId);
        const embed = buildIssueEmbed(issue, issueId);
        embed.addFields({ name: '💬 Context Update', value: evaluation.triageUpdate.slice(0, 1024) });
        embed.setTimestamp();
        await triageMsg.edit({ embeds: [embed] });
      } catch {
        // Triage message may have been deleted
      }
    }
  }

  // Reclassify if needed
  if (evaluation.reclassify) {
    const threadContext = issue.threadContext || [];
    const additionalInfo = threadContext.map(c => c.text).join('\n');
    const fullContext = `Original report: ${issue.text}\n\nAdditional information:\n${additionalInfo}`;
    const newClassification = await classifyIssue(fullContext);
    await firestore.updateIssueClassification(issueId, newClassification);
    // Move triage embed to new channel if target flipped (I4)
    await maybeMoveTriageEmbedAcrossChannels(guild, issue, newClassification, issueId);
  }

  // Mark context complete
  if (evaluation.complete && !issue.contextComplete) {
    await firestore.updateIssueFields(issueId, {
      contextComplete: true,
      contextCompletedAt: new Date().toISOString(),
    });
    await updateContextBadge(guild, { ...issue, contextComplete: true }, issueId);
  }
}

async function updateContextBadge(guild, issue, issueId) {
  if (!issue.triageMessageId) return;
  const triageChannel = findTriageChannel(guild, issue.target);
  if (!triageChannel) return;

  try {
    const triageMsg = await triageChannel.messages.fetch(issue.triageMessageId);
    const embed = buildIssueEmbed(issue, issueId);
    embed.setTimestamp();
    await triageMsg.edit({ embeds: [embed] });
  } catch {
    // Triage message may have been deleted
  }
}

function buildConversationHistory(messages, issue = {}) {
  const excludedIds = new Set(issue.excludedMessageIds || []);
  const excludedUsers = new Set(issue.excludeModeUserIds || []);
  return messages
    .filter(m => !excludedIds.has(m.id) && !excludedUsers.has(m.author?.id))
    .map(m => ({
      id: m.id,
      role: resolveAuthorRole(m, issue),
      author: m.author?.username || 'unknown',
      isBot: m.author?.bot || false,
      content: m.content || '',
      attachments: [...(m.attachments?.values() || [])].map(a => ({ url: a.url, name: a.name })),
      createdAt: m.createdAt?.toISOString() || new Date().toISOString(),
    }));
}

function buildTranscript(history) {
  return history.map(h => `[${h.role || (h.isBot ? 'BOT' : 'OTHER')}] ${h.content}`).join('\n');
}

function collectNewImageUrls(messages, sinceIso) {
  const cutoff = sinceIso ? Date.parse(sinceIso) : 0;
  const urls = [];
  for (const m of messages) {
    const createdAt = m.createdAt?.getTime?.() || Date.parse(m.createdAt) || 0;
    if (createdAt <= cutoff) continue;
    const atts = m.attachments ? (m.attachments.values ? Array.from(m.attachments.values()) : m.attachments) : [];
    for (const a of atts) {
      if ((a.contentType || '').startsWith('image/') && a.url) urls.push(a.url);
    }
  }
  return urls;
}

/**
 * Handle the conversational side-effects of an evaluator response:
 * - Auto-resolve when reporter indicates resolution
 * - responseMode: ignore | react | reply (rate-limited via canReply)
 *
 * @param {Message} message - the Discord message that triggered evaluation
 * @param {Object} issue - the current issue document
 * @param {string} issueId - the issue id
 * @param {Object} evaluation - the evaluator return shape (responseMode, resolved, etc.)
 * @param {Object} options
 * @param {Function} options.canReply - () => boolean, rate-limit check
 */
async function processConversationResponse(message, issue, issueId, evaluation, options = {}) {
  const canReply = typeof options.canReply === 'function' ? options.canReply : () => true;

  const isReporter = message.author.id === issue.reporterId;
  const isResolving = evaluation?.resolved && isReporter;

  // Auto-resolve takes precedence over normal responseMode handling.
  if (isResolving) {
    try {
      await firestore.updateIssueResolution(issueId, {
        resolvedBy: 'reporter',
        resolvedReason: evaluation.resolvedReason,
      });
    } catch (err) {
      console.error('processConversationResponse: updateIssueResolution failed', err.message);
    }
    try {
      await message.channel.send({ content: 'Marked as resolved — reply if it comes back.' });
    } catch {}
    try {
      await updateContextBadge(message.guild, { ...issue, status: 'resolved' }, issueId);
    } catch {}
    return;
  }

  // responseMode handling
  if (evaluation?.responseMode === 'reply' && evaluation.reply && canReply()) {
    try { await message.channel.send({ content: evaluation.reply }); } catch {}
  } else if (evaluation?.responseMode === 'react') {
    try { await message.react('✅'); } catch {}
  }
  // ignore: do nothing
}

/**
 * Detect when a re-classification has flipped the issue's target and move the
 * triage embed across channels. Used after processEvaluation when reclassify
 * was true and the new classification has a different target than the stored one.
 *
 * @param {Object} guild
 * @param {Object} oldIssue - previous issue state with old target/triageMessageId
 * @param {Object} newClassification - { target, priority, category, summary, ... }
 * @param {string} issueId
 */
async function maybeMoveTriageEmbedAcrossChannels(guild, oldIssue, newClassification, issueId) {
  const oldTarget = oldIssue.target || 'poke_product';
  const newTarget = newClassification.target || 'poke_product';
  if (oldTarget === newTarget) return; // No move needed.

  const oldChannel = findTriageChannel(guild, oldTarget);
  const newChannel = findTriageChannel(guild, newTarget);
  if (!oldChannel || !newChannel || oldChannel.id === newChannel.id) return;

  // 1. Edit old embed to a "moved" stub.
  if (oldIssue.triageMessageId) {
    try {
      const oldMsg = await oldChannel.messages.fetch(oldIssue.triageMessageId);
      const stubEmbed = buildIssueEmbed(
        { ...oldIssue, ...newClassification, summary: `[Moved to #${newChannel.name}]: ${newClassification.summary || oldIssue.summary}` },
        issueId
      );
      await oldMsg.edit({ embeds: [stubEmbed] });
    } catch (err) {
      console.error('maybeMoveTriageEmbedAcrossChannels: edit old failed', err.message);
    }
  }

  // 2. Post fresh embed in new channel and update issue with new triageMessageId/triageChannelId.
  try {
    const updatedIssueShape = { ...oldIssue, ...newClassification, target: newTarget };
    const newMessageId = await postIssueEmbed(guild, updatedIssueShape, issueId);
    if (newMessageId) {
      await firestore.updateIssueFields(issueId, {
        target: newTarget,
        triageMessageId: newMessageId,
        triageChannelId: newChannel.id,
      });
    }
  } catch (err) {
    console.error('maybeMoveTriageEmbedAcrossChannels: post new failed', err.message);
  }
}

/**
 * Pure planning function: given an issue and an evaluation, compute what child
 * issues need to be created and what receipt text to show.  The caller
 * (`fileIssue`) is responsible for allocating real issue numbers for children;
 * this function uses sequential placeholder arithmetic (primary+1, primary+2, …)
 * so the receipt can be unit-tested without I/O.
 *
 * @param {Object} opts
 * @param {Object} opts.issue       - issue document (must have .number, .summary)
 * @param {Object} opts.evaluation  - evaluator output (contextFields, distinctBugs)
 * @returns {{ children: Object[], numbers: number[], receipt: string, fields: Object }}
 */
function buildFilePlan({ issue, evaluation }) {
  const bugs = Array.isArray(evaluation.distinctBugs) ? evaluation.distinctBugs : [];
  const primaryNumber = issue.number;

  // All bugs beyond the first become child issues (split from the primary).
  const children = bugs.slice(1).map(b => ({
    summary: b.summary,
    text: `${b.summary}`,
    reporterId: issue.reporterId,
    reporterName: issue.reporterName,
    target: issue.target,
    splitFromIssueId: issue.id,
    contextComplete: true,
    contextFields: {
      expected: b.expected || null,
      actual: b.actual || null,
      feature: b.feature || null,
      frequency: b.frequency || null,
    },
  }));

  // Placeholder numbers for receipt rendering (real numbers allocated in fileIssue).
  const numbers = [primaryNumber, ...children.map((_c, i) => primaryNumber + 1 + i)]
    .filter(n => typeof n === 'number');

  const cf = evaluation.contextFields || {};
  const fields = {
    summary: issue.summary || (bugs[0] && bugs[0].summary),
    expected: cf.expected,
    actual: cf.actual,
    scope: [cf.frequency, cf.feature].filter(Boolean).join(' / '),
  };

  return {
    children,
    numbers,
    receipt: buildReceipt(numbers.length ? numbers : [primaryNumber], fields),
    fields,
  };
}

/**
 * Side-effectful: file an issue (idempotent), create child issues for any
 * extra distinct bugs, post a receipt in the thread, and refresh the triage embed.
 *
 * @param {Object} guild
 * @param {Object} issue       - full issue document
 * @param {string} issueId
 * @param {Object} evaluation  - evaluator output
 * @param {Object} deps        - injectable dependencies for testing
 * @param {Object} [deps.firestore]   - firestore service override
 * @param {Object} [deps.thread]      - Discord thread channel (with .send())
 */
async function fileIssue(guild, issue, issueId, evaluation, deps = {}) {
  const fs = deps.firestore || firestore;

  // Idempotency guard.
  if (issue.filedAt) return { ok: true, skipped: true };

  const plan = buildFilePlan({ issue, evaluation });

  // Allocate real issue numbers for child issues.
  const realNumbers = [issue.number];
  for (const child of plan.children) {
    const childId = await fs.saveIssue(child);
    const childDoc = await fs.getIssueById(childId);
    if (childDoc && typeof childDoc.number === 'number') {
      realNumbers.push(childDoc.number);
    }
  }

  // Re-render receipt with actual numbers.
  const receipt = buildReceipt(realNumbers.filter(n => typeof n === 'number'), plan.fields);

  // Post receipt in the Discord thread.
  if (deps.thread && typeof deps.thread.send === 'function') {
    await deps.thread.send({ content: receipt }).catch(() => {});
  }

  // Mark the primary issue as filed.
  await fs.updateIssueFields(issueId, {
    contextComplete: true,
    contextFields: evaluation.contextFields,
    filedAt: new Date().toISOString(),
  });

  // Refresh the triage embed with the context-complete badge.
  try {
    await updateContextBadge(guild, { ...issue, contextComplete: true }, issueId);
  } catch {
    // Non-fatal — embed may have been deleted.
  }

  return { ok: true, receipt };
}

module.exports = { evaluateContext, processEvaluation, updateContextBadge, buildConversationHistory, buildTranscript, collectNewImageUrls, processConversationResponse, maybeMoveTriageEmbedAcrossChannels, buildFilePlan, fileIssue };
