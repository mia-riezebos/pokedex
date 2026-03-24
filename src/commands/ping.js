const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

const BOT_VERSION = '2.0.1';

const commandData = new SlashCommandBuilder()
  .setName('ping')
  .setDescription('Check bot latency and uptime');

const startTime = Date.now();

async function execute(interaction) {
  const sent = await interaction.deferReply({ fetchReply: true });
  const roundtrip = sent.createdTimestamp - interaction.createdTimestamp;
  const ws = interaction.client.ws.ping;
  const uptime = formatUptime(Date.now() - startTime);
  const guilds = interaction.client.guilds.cache.size;

  const embed = new EmbedBuilder()
    .setTitle('🏓 Pong!')
    .setColor(roundtrip < 200 ? 0x00cc00 : roundtrip < 500 ? 0xffd700 : 0xff0000)
    .addFields(
      { name: '📡 Roundtrip', value: `${roundtrip}ms`, inline: true },
      { name: '💓 WebSocket', value: `${ws}ms`, inline: true },
      { name: '⏱️ Uptime', value: uptime, inline: true },
      { name: '🏠 Servers', value: `${guilds}`, inline: true },
      { name: '🔖 Version', value: `v${BOT_VERSION}`, inline: true },
    )
    .setTimestamp();

  await interaction.editReply({ embeds: [embed] });
}

function formatUptime(ms) {
  const seconds = Math.floor(ms / 1000);
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  const parts = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  parts.push(`${secs}s`);
  return parts.join(' ');
}

module.exports = { data: commandData, execute };
