const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

const CHANGELOG = [
  {
    version: '1.8.0',
    date: '2026-03-23',
    changes: [
      'Added `/ping` — check bot latency, WebSocket ping, and uptime',
      'Added `/lock` and `/unlock` — lock/unlock channels during incidents (admin only)',
      'Added `/leaderboard` — see top bug reporters, critical finds, and issue stats',
      'Added `/pokedex <pokemon>` — look up any Pokemon with stats, abilities, and type info',
      'Updated `/help` with all new commands',
    ],
  },
  {
    version: '1.7.0',
    date: '2026-03-23',
    changes: [
      'Triage embeds now have action buttons: **Acknowledged**, **Fixed**, **Won\'t Fix**, **Escalate**',
      'Clicking a button updates the embed with who took action and when',
      'Buttons disable after an action is taken to prevent duplicate clicks',
      'Works on both individual issue embeds and feedback theme embeds',
    ],
  },
  {
    version: '1.6.0',
    date: '2026-03-23',
    changes: [
      '`/feedback` triage output is now highly detailed — includes priority reasoning, user quotes, affected areas, reproducibility, suggested owners, dependencies, workarounds, and specific engineering actions',
      'AI prompt upgraded for poke.com-specific analysis with critical/high/medium/low priority levels',
      'Added priority breakdown summary at end of triage report',
      'Quick wins and risk assessment sections added to triage output',
      'Fetches up to 10 messages per thread for better context',
    ],
  },
  {
    version: '1.5.1',
    date: '2026-03-23',
    changes: [
      '`/feedback` now posts organized themes directly to #eng-triage',
      'Fixed channel detection for forum channels with special characters',
      'Shows available channels when feedback channel not found',
    ],
  },
  {
    version: '1.5.0',
    date: '2026-03-23',
    changes: [
      'Added `/issue` admin commands — close, reopen, view, list, and status dashboard',
      'Closing an issue grays out the triage embed and archives the thread',
      'Reopening restores the embed and unarchives the thread',
      'Issue dashboard shows open/closed counts by priority',
    ],
  },
  {
    version: '1.4.1',
    date: '2026-03-23',
    changes: [
      'Triage embeds now update live when users add context in threads',
      'Additional context from threads is shown in the triage embed',
    ],
  },
  {
    version: '1.4.0',
    date: '2026-03-23',
    changes: [
      'Added `/feedback` command — AI-powered analysis of forum feedback, grouped by theme and priority',
      'Feedback supports public/ephemeral visibility toggle',
    ],
  },
  {
    version: '1.3.0',
    date: '2026-03-23',
    changes: [
      'Thread context tracking — Pokedex now listens to replies in issue threads and reclassifies with full context',
      '`/changelog` now supports `public` option — share it with the channel or keep it private',
    ],
  },
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
  .setDescription('See what\'s new in Pokedex')
  .addBooleanOption(option =>
    option.setName('public')
      .setDescription('Show the changelog to everyone in the channel (default: only you)')
      .setRequired(false)
  );

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

  const isPublic = interaction.options.getBoolean('public') ?? false;
  await interaction.reply({ embeds: [embed], ephemeral: !isPublic });
}

module.exports = { data: commandData, execute };
