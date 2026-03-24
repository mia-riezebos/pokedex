const admin = require('firebase-admin');
const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  PermissionFlagsBits,
} = require('discord.js');
const { buildIssueEmbed, buildTriageButtons } = require('./triage');

const APPROVE_EMOJI = '✅';
const DECLINE_EMOJI = '❌';
const ISSUE_ID_PATTERN = /Issue ID:\s*([A-Za-z0-9_-]+)/i;

function getDb() {
  return admin.firestore();
}

function extractIssueId(text) {
  if (!text) return null;
  return text.match(ISSUE_ID_PATTERN)?.[1] || null;
}

function extractIssueIdFromMessage(message) {
  for (const embed of message.embeds || []) {
    const embedIssueId = extractIssueId(embed.footer?.text)
      || extractIssueId(embed.description)
      || extractIssueId(embed.title);
    if (embedIssueId) return embedIssueId;
  }

  return extractIssueId(message.content);
}

function canModerate(member) {
  return Boolean(member?.permissions?.has(PermissionFlagsBits.ManageMessages));
}

async function fetchIssueById(issueId) {
  if (!issueId) return null;

  const doc = await getDb().collection('issues').doc(issueId).get();
  if (!doc.exists) return null;
  return { issueId: doc.id, issue: doc.data() };
}

async function fetchIssueByField(field, value) {
  const snapshot = await getDb().collection('issues')
    .where(field, '==', value)
    .limit(1)
    .get();

  if (snapshot.empty) return null;

  const doc = snapshot.docs[0];
  return { issueId: doc.id, issue: doc.data() };
}

async function resolvePendingIssueFromMessage(message) {
  const issueId = extractIssueIdFromMessage(message);
  const directMatch = await fetchIssueById(issueId);
  if (directMatch) return directMatch;

  const byReplyId = await fetchIssueByField('pendingReplyMessageId', message.id);
  if (byReplyId) return byReplyId;

  const byWebhookId = await fetchIssueByField('pendingMessageId', message.id);
  if (byWebhookId) return byWebhookId;

  return null;
}

function buildPendingApprovalButtons(issueId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`mcp_approve_${issueId}`)
      .setLabel('Approve')
      .setEmoji(APPROVE_EMOJI)
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`mcp_decline_${issueId}`)
      .setLabel('Decline')
      .setEmoji(DECLINE_EMOJI)
      .setStyle(ButtonStyle.Danger),
  );
}

function buildPendingApprovalEmbed(issue, issueId) {
  return new EmbedBuilder()
    .setTitle(`Pending MCP Issue: ${issue.summary || 'Untitled report'}`)
    .setColor(0x9b59b6)
    .setDescription('Approve to move this into triage, or decline to reject it. Reactions on the webhook message also work.')
    .addFields(
      { name: 'Priority', value: issue.priority || 'unknown', inline: true },
      { name: 'Category', value: issue.category || 'other', inline: true },
      { name: 'Reporter', value: issue.reporterName || 'unknown', inline: true },
      { name: 'Source', value: 'MCP Agent', inline: true },
      { name: 'Description', value: (issue.text || '(no description)').slice(0, 1024) },
    )
    .setFooter({ text: `Issue ID: ${issueId} | Pending approval` })
    .setTimestamp();
}

function buildDeclinedEmbed(issue, issueId, username) {
  return buildPendingApprovalEmbed(issue, issueId)
    .setTitle(`Declined MCP Issue: ${issue.summary || 'Untitled report'}`)
    .setColor(0xe74c3c)
    .addFields({ name: '❌ Declined', value: `by ${username} — <t:${Math.floor(Date.now() / 1000)}:R>` });
}

function buildDecisionPayload(decision, issue, issueId, username) {
  if (decision === 'approve') {
    const embed = buildIssueEmbed(issue, issueId);
    embed.addFields({ name: '✅ Approved', value: `by ${username} — <t:${Math.floor(Date.now() / 1000)}:R>` });
    return { embeds: [embed], components: [buildTriageButtons(issueId)] };
  }

  return { embeds: [buildDeclinedEmbed(issue, issueId, username)], components: [] };
}

async function addDecisionReactions(message) {
  for (const emoji of [APPROVE_EMOJI, DECLINE_EMOJI]) {
    try {
      await message.react(emoji);
    } catch {
      return;
    }
  }
}

async function syncPendingWebhookMessage(message) {
  const resolved = await resolvePendingIssueFromMessage(message);
  if (!resolved) return false;

  const { issueId, issue } = resolved;
  if (issue.source !== 'mcp' || issue.status !== 'pending') return false;
  if (issue.pendingReplyMessageId) return true;

  const reply = await message.reply({
    embeds: [buildPendingApprovalEmbed(issue, issueId)],
    components: [buildPendingApprovalButtons(issueId)],
  });

  await getDb().collection('issues').doc(issueId).update({
    pendingMessageId: message.id,
    pendingReplyMessageId: reply.id,
  });

  await addDecisionReactions(message);
  return true;
}

async function decidePendingIssue(issueId, decision, user) {
  const docRef = getDb().collection('issues').doc(issueId);
  const existing = await docRef.get();
  if (!existing.exists) {
    return { ok: false, error: 'Issue not found.' };
  }

  const issue = existing.data();
  if (issue.source !== 'mcp') {
    return { ok: false, error: 'This approval flow only supports MCP issues.' };
  }

  if (issue.status !== 'pending') {
    return { ok: false, error: `Issue is already ${issue.status || 'processed'}.` };
  }

  const timestamp = admin.firestore.FieldValue.serverTimestamp();
  const update = decision === 'approve'
    ? {
        status: 'open',
        approvedBy: user.id,
        approvedAt: timestamp,
        pendingDecision: 'approved',
        pendingResolvedAt: timestamp,
      }
    : {
        status: 'declined',
        declinedBy: user.id,
        declinedAt: timestamp,
        pendingDecision: 'declined',
        pendingResolvedAt: timestamp,
      };

  await docRef.update(update);

  const updated = await docRef.get();
  return { ok: true, issue: updated.data() };
}

async function fetchPendingReplyMessage(channel, issue) {
  if (!channel?.messages?.fetch || !issue.pendingReplyMessageId) return null;
  try {
    return await channel.messages.fetch(issue.pendingReplyMessageId);
  } catch {
    return null;
  }
}

async function handlePendingReaction(reaction, user) {
  if (user.bot) return false;

  if (reaction.partial) {
    try {
      await reaction.fetch();
    } catch {
      return false;
    }
  }

  const message = reaction.message;
  if (message.partial) {
    try {
      await message.fetch();
    } catch {
      return false;
    }
  }

  const decision = reaction.emoji.name === APPROVE_EMOJI
    ? 'approve'
    : reaction.emoji.name === DECLINE_EMOJI
      ? 'decline'
      : null;

  if (!decision) return false;

  const resolved = await resolvePendingIssueFromMessage(message);
  if (!resolved || resolved.issue.source !== 'mcp' || resolved.issue.status !== 'pending') {
    return false;
  }

  const member = await message.guild?.members.fetch(user.id).catch(() => null);
  if (!canModerate(member)) {
    await reaction.users.remove(user.id).catch(() => {});
    return true;
  }

  const result = await decidePendingIssue(resolved.issueId, decision, user);
  if (!result.ok) {
    await reaction.users.remove(user.id).catch(() => {});
    return true;
  }

  const payload = buildDecisionPayload(decision, result.issue, resolved.issueId, user.username);
  const replyMessage = await fetchPendingReplyMessage(message.channel, result.issue);
  if (replyMessage) {
    await replyMessage.edit(payload);
  } else if (typeof message.reply === 'function') {
    await message.reply(payload).catch(() => {});
  }

  return true;
}

module.exports = {
  APPROVE_EMOJI,
  DECLINE_EMOJI,
  canModerate,
  buildDecisionPayload,
  decidePendingIssue,
  syncPendingWebhookMessage,
  handlePendingReaction,
};
