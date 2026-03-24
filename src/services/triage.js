const { EmbedBuilder } = require('discord.js');
const cron = require('node-cron');
const { getConfig } = require('../config/config');
const firestore = require('./firestore');

const PRIORITY_COLORS = {
  critical: 0xff0000,
  high: 0xff8c00,
  medium: 0xffd700,
  low: 0x00cc00,
  unclassified: 0x808080,
};

function buildIssueEmbed(issue, issueId) {
  const color = PRIORITY_COLORS[issue.priority] ?? 0x808080;
  const messageLink = `https://discord.com/channels/${issue.guildId}/${issue.channelId}/${issue.messageId}`;

  return new EmbedBuilder()
    .setTitle(issue.summary)
    .setColor(color)
    .addFields(
      { name: 'Priority', value: issue.priority, inline: true },
      { name: 'Category', value: issue.category, inline: true },
      { name: 'Reporter', value: issue.reporterName, inline: true },
      { name: 'Original Message', value: `[Jump to message](${messageLink})` },
      { name: 'Reasoning', value: issue.reasoning },
    )
    .setFooter({ text: `Issue ID: ${issueId}` })
    .setTimestamp();
}

function findTriageChannel(guild) {
  const channelName = getConfig('triage_channel');
  return guild.channels.cache.find(ch => ch.name === channelName && ch.isTextBased());
}

async function postIssueEmbed(guild, issue, issueId) {
  const outputMode = getConfig('output_mode');
  if (outputMode === 'summary') return null;

  const channel = findTriageChannel(guild);
  if (!channel) {
    console.error(`Triage channel "${getConfig('triage_channel')}" not found`);
    return null;
  }

  const embed = buildIssueEmbed(issue, issueId);
  const msg = await channel.send({ embeds: [embed] });
  return msg.id;
}

function buildDigestEmbed(issues) {
  const grouped = {};
  for (const issue of issues) {
    const key = issue.priority;
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(issue);
  }

  const embed = new EmbedBuilder()
    .setTitle('Issue Digest')
    .setColor(0x5865f2)
    .setTimestamp();

  const priorityOrder = ['critical', 'high', 'medium', 'low', 'unclassified'];
  for (const priority of priorityOrder) {
    const items = grouped[priority];
    if (!items || items.length === 0) continue;

    const lines = items.map(i => {
      const link = `https://discord.com/channels/${i.guildId}/${i.channelId}/${i.messageId}`;
      return `• [${i.category}] ${i.summary} ([link](${link}))`;
    });
    embed.addFields({ name: `${priority.toUpperCase()} (${items.length})`, value: lines.join('\n').slice(0, 1024) });
  }

  if (issues.length === 0) {
    embed.setDescription('No new issues since last digest.');
  }

  return embed;
}

async function postDigest(guild) {
  const channel = findTriageChannel(guild);
  if (!channel) return;

  const interval = getConfig('summary_interval');
  const since = new Date();
  if (interval === 'weekly') {
    since.setDate(since.getDate() - 7);
  } else {
    since.setDate(since.getDate() - 1);
  }

  const issues = await firestore.getIssuesSince(since);
  const embed = buildDigestEmbed(issues);
  await channel.send({ embeds: [embed] });
}

function startDigestScheduler(guild) {
  const outputMode = getConfig('output_mode');
  if (outputMode !== 'summary' && outputMode !== 'both') return null;

  const interval = getConfig('summary_interval');
  const cronExpr = interval === 'weekly' ? '0 9 * * 1' : '0 9 * * *';

  return cron.schedule(cronExpr, () => {
    postDigest(guild).catch(err => console.error('Digest failed:', err));
  }, { timezone: 'UTC' });
}

module.exports = { postIssueEmbed, startDigestScheduler, findTriageChannel, buildIssueEmbed };