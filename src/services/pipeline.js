const { EmbedBuilder } = require('discord.js');
const { classifyIssue } = require('./openrouter');
const firestore = require('./firestore');
const triage = require('./triage');
const { getConfig } = require('../config/config');

const PRIORITY_COLORS = {
  critical: 0xff0000,
  high: 0xff8c00,
  medium: 0xffd700,
  low: 0x00cc00,
  unclassified: 0x808080,
};

async function processIssue(message, text) {
  // Duplicate check
  const isDupe = await firestore.isDuplicate(message.id);
  if (isDupe) return;

  // Classify with AI
  const classification = await classifyIssue(text);

  // Build issue data
  const issueData = {
    messageId: message.id,
    guildId: message.guild.id,
    channelId: message.channel.id,
    reporterId: message.author.id,
    reporterName: message.author.username,
    text,
    priority: classification.priority,
    category: classification.category,
    summary: classification.summary,
    reasoning: classification.reasoning,
  };

  if (classification.raw) {
    issueData.rawAiResponse = classification.raw;
  }

  // Save to Firestore
  let issueId;
  try {
    issueId = await firestore.saveIssue(issueData);
  } catch (err) {
    console.error('Firestore write failed:', err.message);
    issueId = 'unknown';
  }

  // Post to triage channel
  const triageMessageId = await triage.postIssueEmbed(message.guild, { ...issueData, messageId: message.id }, issueId);

  // Update Firestore with triage message ID
  if (issueId !== 'unknown' && triageMessageId) {
    try {
      await firestore.updateIssueTriageMessageId(issueId, triageMessageId);
    } catch {
      // Best effort
    }
  }

  // Single acknowledge reply as embed (instead of plain text + separate embed)
  const ack = getConfig('acknowledge');
  if (ack === true || ack === 'true') {
    try {
      const color = PRIORITY_COLORS[classification.priority] ?? 0x808080;
      const ackEmbed = new EmbedBuilder()
        .setColor(color)
        .setTitle(`${classification.priority.toUpperCase()} — ${classification.category.replace(/_/g, ' ')}`)
        .setDescription(classification.summary)
        .setFooter({ text: `Issue ID: ${issueId}` });

      // Add follow-up question if the AI wants more info
      if (classification.follow_up) {
        ackEmbed.addFields({ name: 'Follow-up', value: classification.follow_up });
      }

      await message.reply({ embeds: [ackEmbed] });
    } catch {
      // Best effort — may not have permission to reply
    }
  }
}

module.exports = { processIssue };