const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const lockdown = require('../services/lockdown');

const commandData = new SlashCommandBuilder()
  .setName('unlockall')
  .setDescription('Undo the last /lockall — restores only the channels it locked')
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
  .addStringOption(o => o.setName('reason').setDescription('Reason for unlocking').setRequired(false));

async function execute(interaction) {
  await interaction.deferReply();
  const record = await lockdown.getLockdown();

  if (!record || record.lockedChannelIds.length === 0) {
    return interaction.editReply('There is no recorded lockdown to undo.');
  }

  const existingIds = interaction.guild.channels.cache.map(c => c.id);
  const toUnlock = lockdown.planUnlock(record.lockedChannelIds, existingIds);
  // Channels in the record that no longer exist can be dropped from it outright.
  const goneIds = record.lockedChannelIds.filter(id => !existingIds.includes(id));

  let failed = 0;
  const resolvedIds = [...goneIds];
  for (const id of toUnlock) {
    const channel = interaction.guild.channels.cache.get(id);
    try {
      await channel.permissionOverwrites.edit(interaction.guild.roles.everyone, { SendMessages: null });
      resolvedIds.push(id);
    } catch (err) {
      console.error(`unlockall: failed to unlock ${id}:`, err.message);
      failed++;
    }
  }

  // Only forget the channels we actually restored (plus ones already deleted). Anything
  // that failed stays in the record so a follow-up /unlockall can retry it — a total
  // failure must never leave the server stuck locked with no recovery path.
  if (failed === 0) {
    await lockdown.clearLockdown();
  } else {
    await lockdown.removeLockedChannels(resolvedIds);
  }

  const unlocked = resolvedIds.length - goneIds.length;
  const embed = new EmbedBuilder()
    .setTitle('🔓 Server Unlocked')
    .setColor(failed === 0 ? 0x00cc00 : 0xe67e22)
    .setDescription(`Restored **${unlocked}** channel(s). Channels locked before the lockdown were left locked.`)
    .addFields({ name: 'Failed', value: String(failed), inline: true })
    .setTimestamp();
  if (failed > 0) {
    embed.setFooter({ text: 'Some channels could not be unlocked and are kept on record — run /unlockall again to retry them.' });
  }
  await interaction.editReply({ embeds: [embed] });
}

module.exports = { data: commandData, execute };
