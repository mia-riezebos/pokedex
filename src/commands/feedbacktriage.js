const { SlashCommandBuilder, EmbedBuilder, ChannelType, PermissionFlagsBits } = require('discord.js');
const firestore = require('../services/firestore');
const { classifyIssue } = require('../services/openrouter');
const { findDuplicate } = require('../services/duplicates');
const { postIssueEmbed, buildIssueEmbed } = require('../services/triage');
const { getConfig } = require('../config/config');

const PRIORITY_COLORS = {
  critical: 0xff0000,
  high: 0xff8c00,
  medium: 0xffd700,
  low: 0x00cc00,
  unclassified: 0x808080,
};

const commandData = new SlashCommandBuilder()
  .setName('feedback-triage')
  .setDescription('Triage a feedback forum post into an issue — finds duplicates, tracks reporters, and adds context')
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages);

async function execute(interaction) {
  const channel = interaction.channel;

  // Must be used inside a forum thread
  if (!channel.isThread() || !channel.parent || channel.parent.type !== ChannelType.GuildForum) {
    return interaction.reply({
      content: 'This command must be used inside a **forum post** (e.g. #feedback).',
      ephemeral: true,
    });
  }

  await interaction.deferReply();

  // 1. Scrape all messages from the forum thread
  const { messages, starterMessage, reporters } = await scrapeThread(channel);

  if (!starterMessage) {
    return interaction.editReply('Could not fetch the starter message for this forum post.');
  }

  const threadTitle = channel.name;
  const fullText = buildFullText(threadTitle, starterMessage, messages);

  // Resolve forum tags
  const availableTags = channel.parent.availableTags || [];
  const forumTags = (channel.appliedTags || []).map(tagId => {
    const tag = availableTags.find(t => t.id === tagId);
    return tag?.name || 'unknown';
  });

  // 2. Check if this thread already has a linked issue
  const existingLinked = await firestore.getIssueByThreadId(channel.id);
  if (existingLinked) {
    // Already linked — update context and reporter count
    return handleExistingLinked(interaction, existingLinked, messages, reporters, fullText);
  }

  // 3. AI classify the feedback
  const classification = await classifyIssue(fullText);

  // 4. Check for similar existing issues
  let duplicateMatch = null;
  try {
    const openIssues = await firestore.getOpenIssues(100);
    duplicateMatch = findDuplicate(classification.summary, fullText, openIssues);
  } catch (err) {
    console.error('Duplicate detection failed during feedback-triage:', err.message);
  }

  if (duplicateMatch) {
    return handleDuplicate(interaction, channel, classification, duplicateMatch, reporters, messages, forumTags);
  }

  // 5. No duplicate — create new issue
  return handleNewIssue(interaction, channel, starterMessage, classification, reporters, messages, forumTags, fullText);
}

/**
 * Thread already linked to an issue — refresh context and reporter list.
 */
async function handleExistingLinked(interaction, issue, messages, reporters, fullText) {
  // Add any new reporters
  let reporterCount = (issue.reporterIds || []).length;
  for (const r of reporters) {
    const result = await firestore.addReporter(issue.id, r.id, r.name);
    if (result) reporterCount = (result.reporterIds || []).length;
  }

  // Append new context from messages not already tracked
  const existingContextCount = (issue.threadContext || []).length;
  const humanMessages = messages.filter(m => !m.author.bot && m.content?.trim());
  const newMessages = humanMessages.slice(existingContextCount);

  for (const msg of newMessages) {
    await firestore.appendThreadContext(issue.id, `${msg.author.username}: ${msg.content.trim()}`);
  }

  const updatedIssue = await firestore.getIssueById(issue.id);
  const totalContext = (updatedIssue.threadContext || []).length;

  // Update triage embed if possible
  await refreshTriageEmbed(interaction.guild, updatedIssue, issue.id, reporterCount);

  const embed = new EmbedBuilder()
    .setColor(PRIORITY_COLORS[issue.priority] ?? 0x5865f2)
    .setTitle('Issue Updated')
    .setDescription(
      `This post is already linked to issue \`${issue.id}\`.\n\n` +
      `I've refreshed the context and reporter list.`
    )
    .addFields(
      { name: 'Summary', value: issue.summary || 'N/A' },
      { name: 'Priority', value: issue.priority || 'unclassified', inline: true },
      { name: 'Status', value: (issue.status || 'open').toUpperCase(), inline: true },
      { name: 'Reporters', value: `**${reporterCount}** unique user${reporterCount !== 1 ? 's' : ''}`, inline: true },
      { name: 'Context Entries', value: `${totalContext}`, inline: true },
    )
    .setFooter({ text: `Issue ID: ${issue.id}` })
    .setTimestamp();

  return interaction.editReply({ embeds: [embed] });
}

/**
 * Found a similar existing issue — merge context and bump reporter count.
 */
async function handleDuplicate(interaction, thread, classification, match, reporters, messages, forumTags) {
  const existing = match.issue;
  const similarity = Math.round(match.score * 100);

  // Add all reporters from this thread to the existing issue
  let reporterCount = (existing.reporterIds || []).length;
  for (const r of reporters) {
    const result = await firestore.addReporter(existing.id, r.id, r.name);
    if (result) reporterCount = (result.reporterIds || []).length;
  }

  // Append this thread's conversation as context
  const humanMessages = messages.filter(m => !m.author.bot && m.content?.trim());
  const contextSummary = humanMessages.map(m => `${m.author.username}: ${m.content.trim()}`).join('\n');
  if (contextSummary) {
    await firestore.appendThreadContext(
      existing.id,
      `[Feedback post "${thread.name}" — ${reporters.length} reporter${reporters.length !== 1 ? 's' : ''}]: ${contextSummary.slice(0, 1500)}`
    );
  }

  // Link this thread to the existing issue so future messages auto-track
  await firestore.updateIssueThreadId(existing.id, thread.id);

  const updatedIssue = await firestore.getIssueById(existing.id);
  const totalContext = (updatedIssue.threadContext || []).length;

  // Update triage embed
  await refreshTriageEmbed(interaction.guild, updatedIssue, existing.id, reporterCount);

  const embed = new EmbedBuilder()
    .setColor(0xffa500)
    .setTitle('Duplicate Found — Merged')
    .setDescription(
      `This feedback matches an existing issue. I've merged the context and linked this thread.\n\n` +
      `Future messages here will automatically update the issue.`
    )
    .addFields(
      { name: 'This Post', value: classification.summary, inline: false },
      { name: 'Existing Issue', value: existing.summary || 'No summary', inline: false },
      { name: 'Match', value: `${similarity}%`, inline: true },
      { name: 'Priority', value: existing.priority || 'unclassified', inline: true },
      { name: 'Reporters', value: `**${reporterCount}** unique user${reporterCount !== 1 ? 's' : ''}`, inline: true },
      { name: 'Context Entries', value: `${totalContext}`, inline: true },
    )
    .setFooter({ text: `Existing Issue ID: ${existing.id}` })
    .setTimestamp();

  return interaction.editReply({ embeds: [embed] });
}

/**
 * No duplicate — create a brand new issue from this forum post.
 */
async function handleNewIssue(interaction, thread, starterMessage, classification, reporters, messages, forumTags, fullText) {
  // Collect attachments from all messages
  const attachments = [];
  for (const msg of [starterMessage, ...messages]) {
    for (const att of msg.attachments.values()) {
      attachments.push({
        url: att.url,
        name: att.name,
        contentType: att.contentType,
        size: att.size,
        isImage: att.contentType?.startsWith('image/') || false,
      });
    }
  }

  // Build reporter list
  const reporterList = reporters.map(r => ({
    id: r.id,
    name: r.name,
    addedAt: new Date().toISOString(),
  }));

  const issueData = {
    source: 'feedback-triage',
    threadId: thread.id,
    channelId: thread.parentId,
    guildId: interaction.guild.id,
    messageId: starterMessage.id,
    reporterId: thread.ownerId,
    reporterName: reporters[0]?.name || 'unknown',
    reporterIds: reporterList,
    text: fullText,
    forumTags,
    priority: classification.priority,
    category: classification.category,
    summary: classification.summary,
    reasoning: classification.reasoning,
    attachments: attachments.length > 0 ? attachments : null,
  };

  if (classification.raw) issueData.rawAiResponse = classification.raw;

  // Build thread context from follow-up messages
  const humanMessages = messages.filter(m => !m.author.bot && m.content?.trim());
  if (humanMessages.length > 0) {
    issueData.threadContext = humanMessages.map(m => ({
      text: `${m.author.username}: ${m.content.trim()}`,
      addedAt: m.createdAt.toISOString(),
    }));
  }

  const issueId = await firestore.saveIssue(issueData);

  // Post triage embed
  const savedIssue = await firestore.getIssueById(issueId);
  const triageMessageId = await postIssueEmbed(interaction.guild, savedIssue, issueId);
  if (triageMessageId) {
    await firestore.updateIssueTriageMessageId(issueId, triageMessageId);
  }

  const reporterCount = reporterList.length;
  const contextCount = (issueData.threadContext || []).length;

  const embed = new EmbedBuilder()
    .setColor(PRIORITY_COLORS[classification.priority] ?? 0x5865f2)
    .setTitle('Issue Created from Feedback')
    .setDescription(
      `I've triaged this forum post into a new issue.\n\n` +
      `Future messages in this thread will automatically update the issue.`
    )
    .addFields(
      { name: 'Summary', value: classification.summary },
      { name: 'Priority', value: classification.priority, inline: true },
      { name: 'Category', value: (classification.category || 'other').replace(/_/g, ' '), inline: true },
      { name: 'Reporters', value: `**${reporterCount}** unique user${reporterCount !== 1 ? 's' : ''}`, inline: true },
      { name: 'Context Entries', value: `${contextCount}`, inline: true },
    )
    .setFooter({ text: `Issue ID: ${issueId}` })
    .setTimestamp();

  if (classification.follow_up) {
    embed.addFields({ name: 'Follow-up', value: classification.follow_up });
  }

  await interaction.editReply({ embeds: [embed] });

  // Post follow-up question if AI generated one
  if (classification.follow_up) {
    await thread.send(classification.follow_up);
  }
}

// --- Helpers ---

async function scrapeThread(thread) {
  let allMessages = [];
  let lastId;
  while (true) {
    const batch = await thread.messages.fetch({ limit: 100, ...(lastId && { before: lastId }) });
    if (batch.size === 0) break;
    allMessages.push(...batch.values());
    lastId = batch.last().id;
    if (batch.size < 100) break;
  }

  allMessages.sort((a, b) => a.createdTimestamp - b.createdTimestamp);

  let starterMessage = null;
  try {
    starterMessage = await thread.fetchStarterMessage();
  } catch {
    // Fall back to first message
    starterMessage = allMessages[0] || null;
  }

  // Collect unique reporters (non-bot users who posted)
  const reporterMap = new Map();
  for (const msg of allMessages) {
    if (msg.author.bot) continue;
    if (!reporterMap.has(msg.author.id)) {
      reporterMap.set(msg.author.id, { id: msg.author.id, name: msg.author.username });
    }
  }
  if (starterMessage && !starterMessage.author.bot && !reporterMap.has(starterMessage.author.id)) {
    reporterMap.set(starterMessage.author.id, { id: starterMessage.author.id, name: starterMessage.author.username });
  }

  // Exclude the starter from follow-up messages
  const followUpMessages = starterMessage
    ? allMessages.filter(m => m.id !== starterMessage.id)
    : allMessages;

  return {
    messages: followUpMessages,
    starterMessage,
    reporters: [...reporterMap.values()],
  };
}

function buildFullText(threadTitle, starterMessage, followUpMessages) {
  let text = `${threadTitle}\n\n${starterMessage.content || ''}`;

  const humanFollowUps = followUpMessages.filter(m => !m.author.bot && m.content?.trim());
  if (humanFollowUps.length > 0) {
    text += '\n\n--- Additional context from thread ---\n';
    text += humanFollowUps.map(m => `${m.author.username}: ${m.content.trim()}`).join('\n');
  }

  return text.trim();
}

async function refreshTriageEmbed(guild, issue, issueId, reporterCount) {
  const triageChannelName = getConfig('triage_channel') || 'eng-triage';
  if (!issue?.triageMessageId) return;

  const triageChannel = guild.channels.cache.find(
    ch => ch.name === triageChannelName && ch.isTextBased()
  );
  if (!triageChannel) return;

  try {
    const triageMsg = await triageChannel.messages.fetch(issue.triageMessageId);
    const embed = buildIssueEmbed(issue, issueId);
    embed.addFields({
      name: 'Affected Users',
      value: `**${reporterCount}** unique reporter${reporterCount !== 1 ? 's' : ''}`,
      inline: true,
    });
    embed.setTimestamp();
    await triageMsg.edit({ embeds: [embed] });
  } catch {
    // Triage message may have been deleted
  }
}

module.exports = { data: commandData, execute };
