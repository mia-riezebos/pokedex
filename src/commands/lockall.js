const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits, ChannelType } = require('discord.js');
const lockdown = require('../services/lockdown');

const commandData = new SlashCommandBuilder()
  .setName('lockall')
  .setDescription('Lock every text channel at once (server lockdown)')
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
  .addSubcommand(sub =>
    sub.setName('now')
      .setDescription('Lock all text channels except excluded ones')
      .addStringOption(o => o.setName('reason').setDescription('Reason for the lockdown').setRequired(false)))
  .addSubcommandGroup(group =>
    group.setName('exclude')
      .setDescription('Manage channels skipped by /lockall')
      .addSubcommand(sub =>
        sub.setName('add').setDescription('Skip a channel during lockdown')
          .addChannelOption(o => o.setName('channel').setDescription('Channel to skip').addChannelTypes(ChannelType.GuildText).setRequired(true)))
      .addSubcommand(sub =>
        sub.setName('remove').setDescription('Stop skipping a channel')
          .addChannelOption(o => o.setName('channel').setDescription('Channel to stop skipping').addChannelTypes(ChannelType.GuildText).setRequired(true)))
      .addSubcommand(sub =>
        sub.setName('list').setDescription('Show channels currently skipped')));

// Channels members can post in and that /lockall therefore covers.
const LOCKABLE_TYPES = new Set([
  ChannelType.GuildText,
  ChannelType.GuildAnnouncement,
  ChannelType.GuildForum,
]);

function isLocked(channel, guild) {
  const overwrite = channel.permissionOverwrites.cache.get(guild.roles.everyone.id);
  if (!overwrite) return false;
  return overwrite.deny.has(lockdown.primaryLockFlag(channel.type));
}

// Capture the channel's pre-lock @everyone state so /unlockall can restore it exactly:
// 'allow' = explicit allow we must re-grant; 'neutral' = inherit (clear to null on unlock).
function priorState(channel, guild) {
  const overwrite = channel.permissionOverwrites.cache.get(guild.roles.everyone.id);
  if (overwrite && overwrite.allow.has(lockdown.primaryLockFlag(channel.type))) return 'allow';
  return 'neutral';
}

async function execute(interaction) {
  const group = interaction.options.getSubcommandGroup(false);
  const sub = interaction.options.getSubcommand();

  if (group === 'exclude') {
    const channel = sub === 'list' ? null : interaction.options.getChannel('channel');
    if (sub === 'add') {
      await lockdown.addExcludedChannel(channel.id);
      return interaction.reply({ content: `${channel} will be skipped during lockdowns.`, ephemeral: true });
    }
    if (sub === 'remove') {
      await lockdown.removeExcludedChannel(channel.id);
      return interaction.reply({ content: `${channel} will no longer be skipped.`, ephemeral: true });
    }
    const ids = await lockdown.getExcludedChannels();
    const list = ids.length ? ids.map(id => `<#${id}>`).join(', ') : '_none_';
    return interaction.reply({ content: `**Excluded channels:** ${list}`, ephemeral: true });
  }

  // sub === 'now'
  await interaction.deferReply();

  if (!(await lockdown.acquireLock())) {
    return interaction.editReply('Another lockdown operation is already in progress. Try again in a moment.');
  }

  try {
    const reason = interaction.options.getString('reason') || 'No reason provided';
    const excludeIds = await lockdown.getExcludedChannels();

    const textChannels = interaction.guild.channels.cache.filter(c => LOCKABLE_TYPES.has(c.type));
    const channelsState = textChannels.map(c => ({ id: c.id, locked: isLocked(c, interaction.guild) }));
    const plan = lockdown.planLockdown(channelsState, excludeIds);

    let failed = 0;
    const locked = []; // [{ id, prior }]
    for (const id of plan.toLock) {
      const channel = textChannels.get(id);
      try {
        const prior = priorState(channel, interaction.guild);
        await channel.permissionOverwrites.edit(
          interaction.guild.roles.everyone,
          lockdown.lockOverwrite(channel.type),
        );
        locked.push({ id, prior });
      } catch (err) {
        console.error(`lockall: failed to lock ${id}:`, err.message);
        failed++;
      }
    }

    await lockdown.recordLockdown({ channels: locked, lockedBy: interaction.user.id, reason });

    const embed = new EmbedBuilder()
      .setTitle('🔒 Server Locked Down')
      .setColor(0xff0000)
      .setDescription(`Locked **${locked.length}** channel(s).`)
      .addFields(
        { name: 'Already locked (left as-is)', value: String(plan.skipped.length), inline: true },
        { name: 'Excluded', value: String(plan.excluded.length), inline: true },
        { name: 'Failed', value: String(failed), inline: true },
        { name: 'Reason', value: reason },
      )
      .setFooter({ text: 'Use /unlockall to restore only the channels this lockdown changed.' })
      .setTimestamp();
    await interaction.editReply({ embeds: [embed] });
  } finally {
    await lockdown.releaseLock();
  }
}

module.exports = { data: commandData, execute };
