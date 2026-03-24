const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const firestore = require('../services/firestore');
const { buildIssueEmbed } = require('../services/triage');
const { getConfig } = require('../config/config');

const PRIORITY_COLORS = {
  critical: 0xff0000,
  high: 0xff8c00,
  medium: 0xffd700,
  low: 0x00cc00,
  unclassified: 0x808080,
};

const commandData = new SlashCommandBuilder()
  .setName('issue')
  .setDescription('Manage triaged issues (admin)')
  .addSubcommand(sub =>
    sub.setName('close')
      .setDescription('Close/resolve an issue')
      .addStringOption(opt => opt.setName('id').setDescription('Issue ID').setRequired(true))
      .addStringOption(opt => opt.setName('reason').setDescription('Closure reason').setRequired(false)))
  .addSubcommand(sub =>
    sub.setName('reopen')
      .setDescription('Reopen a closed issue')
      .addStringOption(opt => opt.setName('id').setDescription('Issue ID').setRequired(true)))
  .addSubcommand(sub =>
    sub.setName('view')
      .setDescription('View details of an issue')
      .addStringOption(opt => opt.setName('id').setDescription('Issue ID').setRequired(true)))
  .addSubcommand(sub =>
    sub.setName('list')
      .setDescription('List open issues')
      .addStringOption(opt =>
        opt.setName('filter').setDescription('Filter by priority')
          .setRequired(false)
          .addChoices(
            { name: 'Critical', value: 'critical' },
            { name: 'High', value: 'high' },
            { name: 'Medium', value: 'medium' },
            { name: 'Low', value: 'low' },
          ))
      .addIntegerOption(opt => opt.setName('limit').setDescription('Max issues to show (default: 10)').setRequired(false)))
  .addSubcommand(sub =>
    sub.setName('status')
      .setDescription('Show issue counts and stats'));

async function execute(interaction) {
  const sub = interaction.options.getSubcommand();

  // Admin check for close/reopen
  if (['close', 'reopen'].includes(sub)) {
    if (!interaction.member.permissions.has(PermissionFlagsBits.ManageMessages)) {
      return interaction.reply({ content: 'You need **Manage Messages** permission to do that.', ephemeral: true });
    }
  }

  switch (sub) {
    case 'close': return handleClose(interaction);
    case 'reopen': return handleReopen(interaction);
    case 'view': return handleView(interaction);
    case 'list': return handleList(interaction);
    case 'status': return handleStatus(interaction);
  }
}

async function handleClose(interaction) {
  await interaction.deferReply({ ephemeral: true });
  const issueId = interaction.options.getString('id');
  const reason = interaction.options.getString('reason') || 'Resolved';

  const issue = await firestore.getIssueById(issueId);
  if (!issue) return interaction.editReply(`Issue \`${issueId}\` not found.`);
  if (issue.status === 'closed') return interaction.editReply(`Issue \`${issueId}\` is already closed.`);

  await firestore.updateIssueStatus(issueId, 'closed', interaction.user.id);

  // Update triage embed to show closed
  await updateTriageEmbed(interaction.guild, issue, issueId, 'closed', reason, interaction.user.username);

  // Archive the thread if it exists
  if (issue.threadId) {
    try {
      const thread = await interaction.guild.channels.fetch(issue.threadId);
      if (thread?.isThread()) {
        const closeEmbed = new EmbedBuilder()
          .setColor(0x808080)
          .setTitle('Issue Closed')
          .setDescription(`Closed by **${interaction.user.username}**`)
          .addFields({ name: 'Reason', value: reason })
          .setTimestamp();
        await thread.send({ embeds: [closeEmbed] });
        await thread.setArchived(true);
      }
    } catch {
      // Thread may already be archived or deleted
    }
  }

  await interaction.editReply(`Closed issue \`${issueId}\` — ${reason}`);
}

async function handleReopen(interaction) {
  await interaction.deferReply({ ephemeral: true });
  const issueId = interaction.options.getString('id');

  const issue = await firestore.getIssueById(issueId);
  if (!issue) return interaction.editReply(`Issue \`${issueId}\` not found.`);
  if (issue.status === 'open') return interaction.editReply(`Issue \`${issueId}\` is already open.`);

  await firestore.updateIssueStatus(issueId, 'open', null);

  // Update triage embed
  await updateTriageEmbed(interaction.guild, issue, issueId, 'reopened', null, interaction.user.username);

  // Unarchive the thread if it exists
  if (issue.threadId) {
    try {
      const thread = await interaction.guild.channels.fetch(issue.threadId);
      if (thread?.isThread()) {
        await thread.setArchived(false);
        const reopenEmbed = new EmbedBuilder()
          .setColor(0xff8c00)
          .setTitle('Issue Reopened')
          .setDescription(`Reopened by **${interaction.user.username}**`)
          .setTimestamp();
        await thread.send({ embeds: [reopenEmbed] });
      }
    } catch {
      // Thread may not exist
    }
  }

  await interaction.editReply(`Reopened issue \`${issueId}\``);
}

async function handleView(interaction) {
  await interaction.deferReply({ ephemeral: true });
  const issueId = interaction.options.getString('id');

  const issue = await firestore.getIssueById(issueId);
  if (!issue) return interaction.editReply(`Issue \`${issueId}\` not found.`);

  const color = PRIORITY_COLORS[issue.priority] ?? 0x808080;
  const hasMessageLink = issue.guildId && issue.channelId && issue.messageId
    && issue.channelId !== 'mcp'
    && !String(issue.messageId).startsWith('mcp-');
  const messageLink = hasMessageLink
    ? `https://discord.com/channels/${issue.guildId}/${issue.channelId}/${issue.messageId}`
    : null;

  const embed = new EmbedBuilder()
    .setTitle(issue.summary || 'Untitled Issue')
    .setColor(color)
    .addFields(
      { name: 'Status', value: issue.status?.toUpperCase() || 'OPEN', inline: true },
      { name: 'Priority', value: issue.priority || 'unclassified', inline: true },
      { name: 'Category', value: issue.category?.replace(/_/g, ' ') || 'other', inline: true },
      { name: 'Reporter', value: issue.reporterName || 'unknown', inline: true },
    );

  if (messageLink) {
    embed.addFields({ name: 'Original Message', value: `[Jump](${messageLink})` });
  } else if (issue.source === 'mcp') {
    embed.addFields({ name: 'Source', value: 'MCP Agent', inline: true });
  }

  if (issue.reasoning) {
    embed.addFields({ name: 'AI Reasoning', value: issue.reasoning });
  }

  if (issue.text) {
    embed.addFields({ name: 'Report', value: issue.text.slice(0, 1024) });
  }

  const threadContext = issue.threadContext || [];
  if (threadContext.length > 0) {
    const ctx = threadContext.map((c, i) => `${i + 1}. ${c.text.slice(0, 100)}`).join('\n');
    embed.addFields({ name: 'Thread Context', value: ctx.slice(0, 1024) });
  }

  if (issue.closedBy) {
    embed.addFields({ name: 'Closed By', value: `<@${issue.closedBy}>`, inline: true });
  }

  embed.setFooter({ text: `Issue ID: ${issueId}` }).setTimestamp();

  await interaction.editReply({ embeds: [embed] });
}

async function handleList(interaction) {
  await interaction.deferReply({ ephemeral: true });
  const filter = interaction.options.getString('filter');
  const limit = interaction.options.getInteger('limit') || 10;

  let issues = await firestore.getOpenIssues(limit);

  if (filter) {
    issues = issues.filter(i => i.priority === filter);
  }

  if (issues.length === 0) {
    return interaction.editReply(filter ? `No open **${filter}** issues.` : 'No open issues!');
  }

  const embed = new EmbedBuilder()
    .setTitle(`Open Issues${filter ? ` — ${filter.toUpperCase()}` : ''}`)
    .setColor(0x5865f2)
    .setDescription(`Showing ${issues.length} open issue${issues.length !== 1 ? 's' : ''}`);

  for (const issue of issues.slice(0, 10)) {
    const color = issue.priority === 'critical' ? '🔴' : issue.priority === 'high' ? '🟠' : issue.priority === 'medium' ? '🟡' : '🟢';
    const hasMessageLink = issue.guildId && issue.channelId && issue.messageId
      && issue.channelId !== 'mcp'
      && !String(issue.messageId).startsWith('mcp-');
    const link = hasMessageLink
      ? ` — [jump](https://discord.com/channels/${issue.guildId}/${issue.channelId}/${issue.messageId})`
      : '';
    embed.addFields({
      name: `${color} ${issue.summary?.slice(0, 80) || 'Untitled'}`,
      value: `\`${issue.id}\` • ${issue.priority} • ${issue.category?.replace(/_/g, ' ')}${link}`,
    });
  }

  embed.setFooter({ text: 'Use /issue view <id> for details • /issue close <id> to resolve' });
  await interaction.editReply({ embeds: [embed] });
}

async function handleStatus(interaction) {
  await interaction.deferReply({ ephemeral: true });

  const counts = await firestore.getIssueCounts();

  const priorityLines = Object.entries(counts.byPriority)
    .sort(([a], [b]) => {
      const order = ['critical', 'high', 'medium', 'low', 'unclassified'];
      return order.indexOf(a) - order.indexOf(b);
    })
    .map(([p, c]) => {
      const emoji = p === 'critical' ? '🔴' : p === 'high' ? '🟠' : p === 'medium' ? '🟡' : p === 'low' ? '🟢' : '⚪';
      return `${emoji} ${p}: **${c}**`;
    });

  const embed = new EmbedBuilder()
    .setTitle('Issue Dashboard')
    .setColor(0x5865f2)
    .addFields(
      { name: 'Open', value: `**${counts.open}**`, inline: true },
      { name: 'Closed', value: `**${counts.closed}**`, inline: true },
      { name: 'Total', value: `**${counts.total}**`, inline: true },
    );

  if (priorityLines.length > 0) {
    embed.addFields({ name: 'Open by Priority', value: priorityLines.join('\n') });
  }

  embed.setFooter({ text: 'Use /issue list to see details' }).setTimestamp();
  await interaction.editReply({ embeds: [embed] });
}

async function updateTriageEmbed(guild, issue, issueId, action, reason, username) {
  const triageChannelName = getConfig('triage_channel') || 'eng-triage';
  if (!issue.triageMessageId) return;

  const triageChannel = guild.channels.cache.find(
    ch => ch.name === triageChannelName && ch.isTextBased()
  );
  if (!triageChannel) return;

  try {
    const triageMsg = await triageChannel.messages.fetch(issue.triageMessageId);
    const embed = buildIssueEmbed(issue, issueId);

    if (action === 'closed') {
      embed.setColor(0x808080);
      embed.addFields({ name: '✅ Closed', value: `By **${username}** — ${reason}` });
    } else if (action === 'reopened') {
      embed.addFields({ name: '🔄 Reopened', value: `By **${username}**` });
    }

    embed.setTimestamp();
    await triageMsg.edit({ embeds: [embed] });
  } catch {
    // Triage message may have been deleted
  }
}

module.exports = { data: commandData, execute };
