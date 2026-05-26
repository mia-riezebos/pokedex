const firestore = require('../services/firestore');
const { classifyIssue } = require('../services/openrouter');
const triage = require('../services/triage');
const { getConfig } = require('../config/config');
const { evaluateContext, processEvaluation, buildConversationHistory, processConversationResponse } = require('../services/contextEvaluator');
const { decideThreadAction } = require('../services/threadDecision');
const { detectFrustration } = require('../services/frustration');
const { resolveAuthorRole } = require('../services/authorRole');
const { buildTurnCapNotice } = require('../services/receipt');

// Debounce map — wait a bit in case the user sends multiple messages quickly
const pendingUpdates = new Map();
const DEBOUNCE_MS = 5000;

const IDENTITY_DISCLOSURE = "I'm pokedex, an automated bot that collects bug details for the engineering team. I'm not support — I'll ask 1–3 quick questions, then file your report. A human follows up from there.";

// Rate-limit state: per-thread reply timestamps
const replyHistory = new Map(); // threadId -> [timestamps]

function canBotReplyInThread(threadId, nowMs = Date.now()) {
  const maxReplies = Number(require('../config/config').getConfig('agent_max_replies_per_thread_per_10m')) || 3;
  const windowMs = 10 * 60 * 1000;
  const history = (replyHistory.get(threadId) || []).filter(t => nowMs - t < windowMs);
  if (history.length >= maxReplies) {
    replyHistory.set(threadId, history);
    return false;
  }
  history.push(nowMs);
  replyHistory.set(threadId, history);
  return true;
}

function _reset() { replyHistory.clear(); }

function shouldAutoResolve(evaluation, messageAuthorId, reporterId) {
  if (!evaluation?.resolved) return false;
  if (messageAuthorId !== reporterId) return false;
  return true;
}

async function runThreadDecision({ role, issue, issueId, frustration, evaluation, deps }) {
  const decision = decideThreadAction({ role, issue, frustration, evaluation });
  switch (decision.action) {
    case 'file': {
      const fileSender = deps.fileSend || deps.send;
      if (!issue.identityDisclosed) {
        await deps.firestore.setIdentityDisclosed(issueId);
        if (fileSender) await fileSender(IDENTITY_DISCLOSURE);
      }
      // Tell the reporter the question loop is over and where to add more later.
      // Only fires when the loop stopped because we hit the question cap — other
      // file reasons (sufficient info, frustration, model decision) get the
      // structured receipt by itself.
      if (decision.reason === 'turn-cap' && fileSender) {
        await fileSender(buildTurnCapNotice());
      }
      await deps.fileIssue(deps.guild, issue, issueId, evaluation, { thread: { send: fileSender }, firestore: deps.firestore });
      return decision;
    }
    case 'ask':
      // Bookkeeping only: the visible identity line is produced by the LLM prompt
      // (it discloses when no [BOT] line exists yet). This flag is for audit/dashboards.
      if (!issue.identityDisclosed) { await deps.firestore.setIdentityDisclosed(issueId); }
      if (decision.incrementTurn) await deps.firestore.incrementQuestionTurns(issueId);
      if (evaluation.reply) await deps.send(evaluation.reply);
      return decision;
    case 'reply':
      if (evaluation.reply) await deps.send(evaluation.reply);
      return decision;
    case 'react':
      await deps.react('✅');
      return decision;
    default:
      return decision; // 'silent'
  }
}

async function handleThreadMessage(message) {
  // Only handle messages in threads
  if (!message.channel.isThread()) return false;

  const threadId = message.channel.id;

  // Look up if this thread is linked to an issue
  const issue = await firestore.getIssueByThreadId(threadId);
  if (!issue) return false; // Not one of our issue threads — let caller handle it

  // Guard: forum.js is still processing this thread — don't interfere
  if (issue.initialProcessing) return true;

  const newText = message.content?.trim();
  if (!newText) return true; // Is an issue thread but empty message — still claim it

  // Append the new context to Firestore (include who sent it)
  const prefix = message.author.id === issue.reporterId ? '' : `[${message.author.username}]: `;
  await firestore.appendThreadContext(issue.id, `${prefix}${newText}`);

  // Debounce — if user is typing multiple messages, wait before reclassifying
  if (pendingUpdates.has(issue.id)) {
    clearTimeout(pendingUpdates.get(issue.id));
  }

  pendingUpdates.set(issue.id, setTimeout(async () => {
    pendingUpdates.delete(issue.id);
    try {
      const updatedIssue = await firestore.getIssueByThreadId(threadId);
      if (!updatedIssue) return;

      // Triage signals (turn cap, frustration, sufficiency, reclassify, triageUpdate)
      // are driven by OP messages only. Non-OP chatter is still recorded in the
      // thread context (already appended above) but doesn't trigger an LLM call.
      const triggerRole = resolveAuthorRole(message, updatedIssue);
      if (triggerRole !== 'OP') return;

      // Gather recent thread messages (cap 500).
      const allMessages = [];
      let lastId;
      const MAX = 500;
      while (allMessages.length < MAX) {
        const batch = await message.channel.messages.fetch({ limit: 100, ...(lastId && { before: lastId }) });
        if (batch.size === 0) break;
        allMessages.push(...batch.values());
        if (batch.size < 100) break;
        lastId = batch.last().id;
      }
      allMessages.sort((a, b) => a.createdTimestamp - b.createdTimestamp);

      const { buildConversationHistory, collectNewImageUrls } = require('../services/contextEvaluator');
      const history = buildConversationHistory(allMessages, updatedIssue);
      const newImages = collectNewImageUrls(allMessages, updatedIssue.lastEvaluatedAt);

      // Vision pre-pass: if there are new screenshots since last evaluation,
      // run agent triage on them to extract text, then pass that text as a hint
      // to the context evaluator.
      let visionSummary = null;
      if (newImages.length > 0) {
        const agentTriage = require('../services/agentTriage');
        const { getConfig } = require('../config/config');
        if (getConfig('agent_enabled') !== false) {
          try {
            const result = await agentTriage.triageIssue({
              text: `(vision-only follow-up for issue ${updatedIssue.id}) describe each screenshot briefly and extract visible error text`,
              images: newImages,
              ctx: { firestore, guild: message.guild, channelId: message.channel.id, reporterId: updatedIssue.reporterId },
            });
            visionSummary = result?.evidence?.screenshot_text || null;
          } catch (err) {
            console.error('thread vision pass failed:', err.message);
          }
        }
      }

      const evaluation = await require('../services/contextEvaluator').evaluateContext(
        updatedIssue,
        history,
        visionSummary ? `[Extracted from new screenshots]:\n${visionSummary}` : undefined
      );

      const role = resolveAuthorRole(message, updatedIssue);
      const frustration = role === 'OP' ? detectFrustration(message.content) : { frustrated: false };
      const isResolving = shouldAutoResolve(evaluation, message.author.id, updatedIssue.reporterId);

      if (!isResolving) {
        // Only run the regular evaluation flow when NOT resolving.
        await require('../services/contextEvaluator').processEvaluation(message.guild, updatedIssue, updatedIssue.id, evaluation);
      }

      if (isResolving) {
        // Auto-resolve path: processConversationResponse owns this flow.
        await processConversationResponse(message, updatedIssue, updatedIssue.id, evaluation, {
          canReply: () => canBotReplyInThread(threadId),
        });
      } else {
        // Author-aware decision-driven path.
        await runThreadDecision({
          role,
          issue: updatedIssue,
          issueId: updatedIssue.id,
          frustration,
          evaluation,
          deps: {
            guild: message.guild,
            firestore,
            fileIssue: require('../services/contextEvaluator').fileIssue,
            send: async (c) => {
              // Rate-limit bot replies/questions to the thread.
              if (!canBotReplyInThread(threadId)) return;
              await message.channel.send(typeof c === 'string' ? { content: c } : c);
            },
            fileSend: async (c) => {
              await message.channel.send(typeof c === 'string' ? { content: c } : c);
            },
            react: async (e) => { try { await message.react(e); } catch {} },
          },
        });
      }

      // Bump lastEvaluatedAt so next invocation only fetches newer images.
      try { await firestore.setIssueLastEvaluatedAt(updatedIssue.id, new Date().toISOString()); } catch {}
    } catch (err) {
      console.error('Error processing thread context update:', err);
    }
  }, DEBOUNCE_MS));

  return true; // Signal that this was an issue thread — don't create a new issue
}

module.exports = { handleThreadMessage, canBotReplyInThread, _reset, shouldAutoResolve, runThreadDecision, IDENTITY_DISCLOSURE };
