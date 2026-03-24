const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

const CHANGELOG = [
  {
    version: '2.2.1',
    date: '2026-03-24',
    changes: [
      'MCP context additions now edit the existing triage/pending embed directly in Discord instead of posting new messages',
      'Works for both pending (pre-approval) and approved issues — no more silent Firestore-only updates',
      'Channel IDs are now stored alongside message IDs for reliable cross-service Discord notifications',
    ],
  },
  {
    version: '2.2.0',
    date: '2026-03-24',
    changes: [
      'Added `/issue context <id> <text>` — anyone can add follow-up context, reproduction steps, or details to an open issue without filing a new one',
      'Added `pokedex_add_context` MCP tool — AI agents can append context to existing issues via both stdio and Cloudflare Workers MCP servers',
      'Context additions update the triage embed in #eng-triage and post to the issue thread if one exists',
      'Closed issues block context additions — reopen first with `/issue reopen`',
    ],
  },
  {
    version: '2.1.0',
    date: '2026-03-23',
    changes: [
      'Added `/issue mine` — reporters can review their own recent open or closed issues',
      'Added `/issue search <query>` — search saved issues by keyword without leaving Discord',
      'Added `/issue assign` and `/issue note` — moderators can track ownership and internal notes directly on issues',
      'Added `/typechart <type>` — Pokemon type matchup lookup with strengths, weaknesses, immunities, and sample Pokemon',
      'Triage embeds now show assignees when an issue owner is set',
    ],
  },
  {
    version: '2.0.0',
    date: '2026-03-23',
    changes: [
      '**Duplicate detection** — when a new issue matches an existing open one, the bot shows the match with confidence % and lets you confirm or override',
      '**Web dashboard** — live issue dashboard at the bot\'s URL with filters, search, stats, and detail view (auto-refreshes every 30s)',
    ],
  },
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

const ITEMS_PER_PAGE = 3;
const TOTAL_PAGES = Math.ceil(CHANGELOG.length / ITEMS_PER_PAGE);

const commandData = new SlashCommandBuilder()
  .setName('changelog')
  .setDescription('See what\'s new in Pokedex')
  .addBooleanOption(option =>
    option.setName('public')
      .setDescription('Show the changelog to everyone in the channel (default: only you)')
      .setRequired(false)
  );

function buildChangelogPage(page) {
  const start = page * ITEMS_PER_PAGE;
  const entries = CHANGELOG.slice(start, start + ITEMS_PER_PAGE);

  const embed = new EmbedBuilder()
    .setTitle('Pokedex Changelog')
    .setColor(0x5865f2);

  for (const entry of entries) {
    const lines = entry.changes.map(c => `• ${c}`).join('\n');
    embed.addFields({
      name: `v${entry.version} — ${entry.date}`,
      value: lines,
    });
  }

  embed.setFooter({ text: `Page ${page + 1} of ${TOTAL_PAGES} • Pokedex v${CHANGELOG[0].version}` });
  return embed;
}

function buildPageButtons(page) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`changelog_prev_${page}`)
      .setLabel('◀ Previous')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page === 0),
    new ButtonBuilder()
      .setCustomId(`changelog_page_${page}`)
      .setLabel(`${page + 1} / ${TOTAL_PAGES}`)
      .setStyle(ButtonStyle.Primary)
      .setDisabled(true),
    new ButtonBuilder()
      .setCustomId(`changelog_next_${page}`)
      .setLabel('Next ▶')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page >= TOTAL_PAGES - 1),
  );
}

async function execute(interaction) {
  const isPublic = interaction.options.getBoolean('public') ?? false;
  const page = 0;
  const embed = buildChangelogPage(page);
  const buttons = buildPageButtons(page);
  await interaction.reply({ embeds: [embed], components: [buttons], ephemeral: !isPublic });
}

async function handleChangelogButton(interaction) {
  const customId = interaction.customId;
  const parts = customId.split('_');
  const action = parts[1]; // prev or next
  const currentPage = parseInt(parts[2], 10);

  let newPage = currentPage;
  if (action === 'prev') newPage = Math.max(0, currentPage - 1);
  if (action === 'next') newPage = Math.min(TOTAL_PAGES - 1, currentPage + 1);

  const embed = buildChangelogPage(newPage);
  const buttons = buildPageButtons(newPage);
  await interaction.update({ embeds: [embed], components: [buttons] });
}

module.exports = { data: commandData, execute, handleChangelogButton };
