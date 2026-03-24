const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

const CHANGELOG = [
  {
    version: '1.2.0',
    date: '2026-03-23',
    changes: [
      'Added thread follow-ups — Pokedex now opens a thread when it needs more info',
      'Added `/changelog` command',
    ],
  },
  {
    version: '1.1.0',
    date: '2026-03-23',
    changes: [
      'Added suggestion support — react with 💡 to submit feature requests',
      'Added `/help` command with full usage guide',
      'Bot now shows usage embed when @mentioned without a message',
    ],
  },
  {
    version: '1.0.0',
    date: '2026-03-23',
    changes: [
      'Initial release',
      'AI-powered issue classification via OpenRouter',
      '@mention and 🐛 emoji triggers',
      'Color-coded triage embeds in dedicated channel',
      'Follow-up questions for vague reports',
      'Two-layer config system (file + Firestore)',
      '/config slash command (set/get/reset/list)',
      'Scheduled daily/weekly digest summaries',
      'Rate-limited processing queue',
    ],
  },
];

const commandData = new SlashCommandBuilder()
  .setName('changelog')
  .setDescription('See what\'s new in Pokedex');

async function execute(interaction) {
  const embed = new EmbedBuilder()
    .setTitle('Pokedex Changelog')
    .setColor(0x5865f2);

  for (const entry of CHANGELOG) {
    const lines = entry.changes.map(c => `• ${c}`).join('\n');
    embed.addFields({
      name: `v${entry.version} — ${entry.date}`,
      value: lines,
    });
  }

  embed.setFooter({ text: 'Pokedex — Identifying bugs so engineers don\'t have to hunt for them' });

  await interaction.reply({ embeds: [embed], ephemeral: true });
}

module.exports = { data: commandData, execute };
