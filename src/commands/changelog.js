const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

const CHANGELOG = [
  {
    version: '1.9.0',
    date: '2026-03-24',
    changes: [
      'Added `/serverinfo` — server stats, member counts, channels, boosts, roles, and creation date',
      'Added `/afk <reason>` — set yourself as AFK; anyone who pings you gets notified, and you\'re welcomed back when you return',
      'Added `/level check` and `/level top` — XP leveling system with ranks, progress bars, and a leaderboard',
      'XP is earned per message (15-25 XP, 1-minute cooldown) with level-up announcements',
    ],
  },
  {
    version: '1.8.1',
    date: '2026-03-24',
    changes: [
      'Fixed duplicate issue creation when multiple users react to the same message — only the first reaction triggers an issue now',
    ],
  },
  {
    version: '1.8.0',
    date: '2026-03-24',
    changes: [
      '`/ping` now shows the bot version number',
      '`/changelog` is now paginated — browse with Previous/Next buttons instead of one giant embed',
    ],
  },
  {
    version: '1.7.0',
    date: '2026-03-24',
    changes: [
      'Added `/issue context <id> <text>` — anyone can add follow-up context to an open issue without filing a new one',
      'Added `pokedex_add_context` MCP tool — AI agents can append context via stdio and Cloudflare Workers MCP servers',
      'MCP context additions edit the existing triage/pending embed directly in Discord',
      'Works for both pending (pre-approval) and approved issues',
    ],
  },
  {
    version: '1.6.0',
    date: '2026-03-23',
    changes: [
      'Added `/issue mine` — review your own recent issues',
      'Added `/issue search <query>` — search issues by keyword',
      'Added `/issue assign` and `/issue note` — track ownership and internal notes',
      'Added `/typechart <type>` — Pokemon type matchup lookup',
      '**Duplicate detection** — matches new reports against existing issues with confidence %',
      '**Web dashboard** — live issue dashboard with filters, search, and stats',
    ],
  },
  {
    version: '1.5.0',
    date: '2026-03-23',
    changes: [
      'Added `/ping`, `/lock`, `/unlock`, `/leaderboard`, `/pokedex <pokemon>`',
      'Triage embeds now have action buttons: **Acknowledged**, **Fixed**, **Won\'t Fix**, **Escalate**, **Delete**',
      'Buttons update the embed and disable after an action is taken',
    ],
  },
  {
    version: '1.4.0',
    date: '2026-03-23',
    changes: [
      'Added `/feedback` — AI-powered analysis of forum feedback, grouped by theme and priority',
      'Detailed triage output with priority reasoning, user quotes, affected areas, and suggested owners',
      'Feedback posts organized themes directly to #eng-triage',
    ],
  },
  {
    version: '1.3.0',
    date: '2026-03-23',
    changes: [
      'Added `/issue` admin commands — close, reopen, view, list, and status dashboard',
      'Closing an issue grays out the triage embed and archives the thread',
      'Issue dashboard shows open/closed counts by priority',
    ],
  },
  {
    version: '1.2.0',
    date: '2026-03-23',
    changes: [
      'Thread context tracking — Pokedex listens to replies in issue threads and reclassifies with full context',
      'Triage embeds update live when users add context in threads',
      'Added thread follow-ups — opens a thread when more info is needed',
      'Added `/changelog` command with public/private option',
    ],
  },
  {
    version: '1.1.0',
    date: '2026-03-23',
    changes: [
      'Added suggestion support — react with 💡 to submit feature requests',
      'Added `/help` command with full usage guide',
      'Bot shows usage embed when @mentioned without a message',
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
      'Two-layer config system (file + Firestore) with `/config` command',
      'Scheduled daily/weekly digest summaries',
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
