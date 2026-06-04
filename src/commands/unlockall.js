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

  let failed = 0;
  let unlocked = 0;
  for (const id of toUnlock) {
    const channel = interaction.guild.channels.cache.get(id);
    try {
      await channel.permissionOverwrites.edit(interaction.guild.roles.everyone, { SendMessages: null });
      unlocked++;
    } catch (err) {
      console.error(`unlockall: failed to unlock ${id}:`, err.message);
      failed++;
    }
  }

  await lockdown.clearLockdown();

  const embed = new EmbedBuilder()
    .setTitle('🔓 Server Unlocked')
    .setColor(0x00cc00)
    .setDescription(`Restored **${unlocked}** channel(s). Channels locked before the lockdown were left locked.`)
    .addFields({ name: 'Failed', value: String(failed), inline: true })
    .setTimestamp();
  await interaction.editReply({ embeds: [embed] });
}

module.exports = { data: commandData, execute };
