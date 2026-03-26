const { SlashCommandBuilder, EmbedBuilder, ChannelType, PermissionFlagsBits } = require('discord.js');
const firestore = require('../services/firestore');
const { classifyRecipe } = require('../services/openrouter');

// URL regex — matches http/https links
const URL_REGEX = /https?:\/\/[^\s<>"')\]]+/gi;

const commandData = new SlashCommandBuilder()
  .setName('recipes')
  .setDescription('Community recipe collection from #show-and-tell')
  .addSubcommand(sub =>
    sub.setName('scrape')
      .setDescription('Scrape #show-and-tell for recipe links and add them to the community recipe page')
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
      .addChannelOption(opt =>
        opt.setName('channel')
          .setDescription('Channel to scrape (defaults to #show-and-tell)')
          .addChannelTypes(ChannelType.GuildForum, ChannelType.GuildText)
          .setRequired(false))
      .addIntegerOption(opt =>
        opt.setName('limit')
          .setDescription('Max messages/threads to scan (default: 100)')
          .setMinValue(1)
          .setMaxValue(500)
          .setRequired(false)))
  .addSubcommand(sub =>
    sub.setName('list')
      .setDescription('Show the latest community recipes'))
  .addSubcommand(sub =>
    sub.setName('add')
      .setDescription('Manually add a recipe link')
      .addStringOption(opt =>
        opt.setName('url')
          .setDescription('The recipe URL')
          .setRequired(true))
      .addStringOption(opt =>
        opt.setName('title')
          .setDescription('Name for this recipe')
          .setRequired(false))
      .addStringOption(opt =>
        opt.setName('tags')
          .setDescription('Comma-separated tags (e.g. "competitive, rain team, ou")')
          .setRequired(false)));

async function execute(interaction) {
  const sub = interaction.options.getSubcommand();
  if (sub === 'scrape') return executeScrape(interaction);
  if (sub === 'list') return executeList(interaction);
  if (sub === 'add') return executeAdd(interaction);
  return interaction.reply({ content: 'Unknown subcommand.', ephemeral: true });
}

// --- SCRAPE ---

async function executeScrape(interaction) {
  const channel = interaction.options.getChannel('channel')
    || interaction.guild.channels.cache.find(ch =>
      (ch.type === ChannelType.GuildForum || ch.type === ChannelType.GuildText) &&
      ch.name.toLowerCase().includes('show-and-tell'));

  if (!channel) {
    return interaction.reply({
      content: 'Could not find a #show-and-tell channel. Use the `channel` option to specify one.',
      ephemeral: true,
    });
  }

  await interaction.deferReply();

  const maxMessages = interaction.options.getInteger('limit') || 100;
  const stats = { found: 0, new: 0, updated: 0, noLinks: 0, errored: 0 };
  const recipes = [];

  if (channel.type === ChannelType.GuildForum) {
    // Forum channel — scrape each thread
    const threads = [];

    try {
      const active = await channel.threads.fetchActive();
      threads.push(...active.threads.values());
    } catch (err) {
      console.error('Failed to fetch active threads:', err.message);
    }

    try {
      const archived = await channel.threads.fetchArchived({ limit: 100 });
      threads.push(...archived.threads.values());
    } catch (err) {
      console.error('Failed to fetch archived threads:', err.message);
    }

    threads.sort((a, b) => b.createdTimestamp - a.createdTimestamp);
    const toScan = threads.slice(0, maxMessages);

    // Progress
    const progressEmbed = (processed) => new EmbedBuilder()
      .setTitle('Scraping Recipes...')
      .setColor(0xf0c840)
      .setDescription(`Processing **${channel.name}** — ${processed}/${toScan.length} posts\n${buildProgressBar(Math.round((processed / toScan.length) * 100))}`)
      .setTimestamp();

    await interaction.editReply({ embeds: [progressEmbed(0)] });

    for (let i = 0; i < toScan.length; i++) {
      const thread = toScan[i];
      try {
        const result = await scrapeThreadForRecipes(thread, channel);
        stats.found += result.links.length;
        for (const recipe of result.links) {
          const saved = await firestore.saveRecipe(recipe);
          if (saved.updated) stats.updated++;
          else stats.new++;
          recipes.push({ ...recipe, id: saved.id });
        }
        if (result.links.length === 0) stats.noLinks++;
      } catch (err) {
        console.error(`Recipe scrape error (${thread.name}):`, err.message);
        stats.errored++;
      }

      if ((i + 1) % 5 === 0 || i === toScan.length - 1) {
        try { await interaction.editReply({ embeds: [progressEmbed(i + 1)] }); } catch {}
      }
    }

  } else {
    // Text channel — scrape messages directly
    const allMessages = await fetchChannelMessages(channel, maxMessages);

    const progressEmbed = (processed) => new EmbedBuilder()
      .setTitle('Scraping Recipes...')
      .setColor(0xf0c840)
      .setDescription(`Processing **#${channel.name}** — ${processed}/${allMessages.length} messages\n${buildProgressBar(Math.round((processed / allMessages.length) * 100))}`)
      .setTimestamp();

    await interaction.editReply({ embeds: [progressEmbed(0)] });

    for (let i = 0; i < allMessages.length; i++) {
      const msg = allMessages[i];
      try {
        const links = extractLinks(msg.content);
        stats.found += links.length;

        for (const url of links) {
          const recipe = {
            url,
            title: extractTitleFromMessage(msg.content, url),
            description: cleanDescription(msg.content, url),
            referCode: getRecipeCode(url),
            sharedBy: [{ id: msg.author.id, name: msg.author.username, sharedAt: msg.createdAt.toISOString() }],
            channelId: channel.id,
            channelName: channel.name,
            guildId: interaction.guild.id,
            messageId: msg.id,
            source: inferSource(url),
            tags: extractTags(msg.content),
          };
          const saved = await firestore.saveRecipe(recipe);
          if (saved.updated) stats.updated++;
          else stats.new++;
          recipes.push({ ...recipe, id: saved.id });
        }

        if (links.length === 0) stats.noLinks++;
      } catch (err) {
        stats.errored++;
      }

      if ((i + 1) % 10 === 0 || i === allMessages.length - 1) {
        try { await interaction.editReply({ embeds: [progressEmbed(i + 1)] }); } catch {}
      }
    }
  }

  // Final summary
  const dashboardUrl = process.env.DASHBOARD_URL || 'http://localhost:3000';
  const embed = new EmbedBuilder()
    .setTitle('Recipe Scrape Complete')
    .setColor(stats.errored > 0 ? 0xffa500 : 0x2ecc71)
    .setDescription(`Scraped **#${channel.name}** for recipe links`)
    .addFields(
      { name: 'Links Found', value: `${stats.found}`, inline: true },
      { name: 'New Recipes', value: `${stats.new}`, inline: true },
      { name: 'Updated', value: `${stats.updated}`, inline: true },
      { name: 'No Links', value: `${stats.noLinks}`, inline: true },
      { name: 'Errors', value: `${stats.errored}`, inline: true },
      { name: 'Recipe Page', value: `[View all recipes](${dashboardUrl}/recipes)` },
    )
    .setTimestamp();

  // Show latest added (up to 10)
  const latest = recipes.slice(0, 10);
  if (latest.length > 0) {
    const lines = latest.map(r => {
      const src = r.source ? ` \`${r.source}\`` : '';
      return `• [${(r.title || 'Untitled').slice(0, 50)}](${r.url})${src} — by ${r.sharedBy?.[0]?.name || 'unknown'}`;
    });
    embed.addFields({ name: 'Latest Recipes', value: lines.join('\n').slice(0, 1024) });
  }

  return interaction.editReply({ embeds: [embed] });
}

// --- LIST ---

async function executeList(interaction) {
  await interaction.deferReply({ ephemeral: true });

  const recipes = await firestore.getAllRecipes(25);
  if (recipes.length === 0) {
    return interaction.editReply('No recipes found yet! Use `/recipes scrape` to import from #show-and-tell.');
  }

  const dashboardUrl = process.env.DASHBOARD_URL || 'http://localhost:3000';
  const lines = recipes.slice(0, 20).map((r, i) => {
    const shares = r.shareCount > 1 ? ` (${r.shareCount} shares)` : '';
    const src = r.source ? ` \`${r.source}\`` : '';
    return `**${i + 1}.** [${(r.title || 'Untitled').slice(0, 50)}](${r.url})${src}${shares}`;
  });

  const embed = new EmbedBuilder()
    .setTitle('Community Recipes')
    .setColor(0xf0c840)
    .setDescription(lines.join('\n'))
    .addFields({ name: 'Full Collection', value: `[View all recipes on the web](${dashboardUrl}/recipes)` })
    .setFooter({ text: `${recipes.length} total recipes` })
    .setTimestamp();

  return interaction.editReply({ embeds: [embed] });
}

// --- ADD ---

async function executeAdd(interaction) {
  const url = interaction.options.getString('url').trim();
  const title = interaction.options.getString('title') || null;
  const tagsRaw = interaction.options.getString('tags') || '';

  if (!URL_REGEX.test(url)) {
    return interaction.reply({ content: 'That doesn\'t look like a valid URL.', ephemeral: true });
  }

  await interaction.deferReply();

  const recipe = {
    url,
    title: title || extractTitleFromUrl(url),
    description: null,
    referCode: getRecipeCode(url),
    sharedBy: [{ id: interaction.user.id, name: interaction.user.username, sharedAt: new Date().toISOString() }],
    channelId: interaction.channel?.id || null,
    channelName: interaction.channel?.name || null,
    guildId: interaction.guild.id,
    messageId: null,
    source: inferSource(url),
    tags: tagsRaw ? tagsRaw.split(',').map(t => t.trim().toLowerCase()).filter(Boolean) : [],
  };

  const saved = await firestore.saveRecipe(recipe);

  const embed = new EmbedBuilder()
    .setTitle(saved.updated ? 'Recipe Updated' : 'Recipe Added')
    .setColor(saved.updated ? 0xffa500 : 0x2ecc71)
    .setDescription(`[${recipe.title || url}](${url})`)
    .addFields(
      { name: 'Source', value: recipe.source || 'Unknown', inline: true },
      { name: 'Added By', value: interaction.user.username, inline: true },
    )
    .setTimestamp();

  if (recipe.tags.length > 0) {
    embed.addFields({ name: 'Tags', value: recipe.tags.map(t => `\`${t}\``).join(' '), inline: true });
  }

  return interaction.editReply({ embeds: [embed] });
}

// --- Helpers ---

async function scrapeThreadForRecipes(thread, forumChannel) {
  const links = [];
  let allMessages = [];
  let lastId;

  while (true) {
    const batch = await thread.messages.fetch({ limit: 100, ...(lastId && { before: lastId }) });
    if (batch.size === 0) break;
    allMessages.push(...batch.values());
    lastId = batch.last().id;
    if (batch.size < 100) break;
  }

  allMessages.sort((a, b) => a.createdTimestamp - b.createdTimestamp);

  // Also check thread title + starter message
  let starterMessage = null;
  try { starterMessage = await thread.fetchStarterMessage(); } catch {}
  if (starterMessage) allMessages.unshift(starterMessage);

  // Deduplicate messages by ID
  const seen = new Set();
  allMessages = allMessages.filter(m => {
    if (seen.has(m.id)) return false;
    seen.add(m.id);
    return true;
  });

  // Resolve forum tags
  const availableTags = forumChannel.availableTags || [];
  const forumTags = (thread.appliedTags || []).map(tagId => {
    const tag = availableTags.find(t => t.id === tagId);
    return tag?.name?.toLowerCase() || null;
  }).filter(Boolean);

  for (const msg of allMessages) {
    if (msg.author.bot) continue;
    const urls = extractLinks(msg.content);
    for (const url of urls) {
      links.push({
        url,
        title: thread.name || extractTitleFromMessage(msg.content, url),
        description: cleanDescription(msg.content, url),
        referCode: getRecipeCode(url),
        sharedBy: [{ id: msg.author.id, name: msg.author.username, sharedAt: msg.createdAt.toISOString() }],
        channelId: forumChannel.id,
        channelName: forumChannel.name,
        guildId: thread.guild.id,
        threadId: thread.id,
        messageId: msg.id,
        source: inferSource(url),
        tags: [...new Set([...forumTags, ...extractTags(msg.content)])],
      });
    }
  }

  return { links };
}

function extractLinks(text) {
  if (!text) return [];
  const matches = text.match(URL_REGEX) || [];
  // Clean trailing punctuation
  return [...new Set(matches.map(u => u.replace(/[.,;:!?)]+$/, '')))];
}

function extractTitleFromMessage(text, url) {
  if (!text) return extractTitleFromUrl(url);
  // Use the first line (or text before the URL) as a title
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  const firstLine = lines[0] || '';
  // Remove the URL from the title
  const cleaned = firstLine.replace(URL_REGEX, '').replace(/[<>[\]()]/g, '').trim();
  return cleaned.length > 5 ? cleaned.slice(0, 120) : extractTitleFromUrl(url);
}

function extractTitleFromUrl(url) {
  try {
    const u = new URL(url);
    const hostname = u.hostname.toLowerCase();
    const pathname = u.pathname;

    // Poke.com refer links — use the code as the title
    if (hostname.includes('poke.com') && pathname.startsWith('/refer/')) {
      const code = pathname.split('/refer/')[1];
      return code ? `Recipe ${code}` : 'Poke Recipe';
    }

    // Try to get a readable name from the path
    const parts = pathname.split('/').filter(Boolean);
    if (parts.length > 0) {
      const last = parts[parts.length - 1];
      return decodeURIComponent(last)
        .replace(/[-_]/g, ' ')
        .replace(/\.\w+$/, '')
        .slice(0, 80) || u.hostname;
    }
    return u.hostname;
  } catch {
    return 'Untitled Recipe';
  }
}

function cleanDescription(text, url) {
  if (!text) return null;
  // Remove the URL and keep the rest as description
  const cleaned = text.replace(URL_REGEX, '').replace(/[<>[\]()]/g, '').trim();
  return cleaned.length > 10 ? cleaned.slice(0, 300) : null;
}

function isRecipeLink(url) {
  try {
    const u = new URL(url);
    const hostname = u.hostname.toLowerCase();
    const pathname = u.pathname.toLowerCase();
    // Primary: poke.com/refer/ links
    if (hostname.includes('poke.com') && pathname.startsWith('/refer/')) return true;
    // Other known recipe/team sources
    if (hostname.includes('pokepast')) return true;
    if (hostname.includes('smogon')) return true;
    if (hostname.includes('pikalytics')) return true;
    if (hostname.includes('limitlessv')) return true;
    if (hostname.includes('victoryroad')) return true;
    if (hostname.includes('paste.pokemon-online')) return true;
    // Generic paste/share sites are likely recipes in #show-and-tell context
    if (hostname.includes('pastebin')) return true;
    if (hostname.includes('pokemonshowdown')) return true;
    // YouTube (guides/showcases)
    if (hostname.includes('youtube') || hostname.includes('youtu.be')) return true;
    // Any link shared in #show-and-tell is probably a recipe
    return true;
  } catch {
    return false;
  }
}

function getRecipeCode(url) {
  // Extract the recipe/refer code from poke.com links
  try {
    const u = new URL(url);
    if (u.hostname.toLowerCase().includes('poke.com') && u.pathname.startsWith('/refer/')) {
      return u.pathname.split('/refer/')[1] || null;
    }
  } catch {}
  return null;
}

function inferSource(url) {
  try {
    const u = new URL(url);
    const hostname = u.hostname.toLowerCase();
    const pathname = u.pathname.toLowerCase();
    // Primary recipe source
    if (hostname.includes('poke.com') && pathname.startsWith('/refer/')) return 'Poke';
    if (hostname.includes('poke.com')) return 'Poke';
    if (hostname.includes('pokepast')) return 'Pokepaste';
    if (hostname.includes('pokemonshowdown')) return 'Showdown';
    if (hostname.includes('pastebin')) return 'Pastebin';
    if (hostname.includes('paste.pokemon-online')) return 'PO Paste';
    if (hostname.includes('github')) return 'GitHub';
    if (hostname.includes('docs.google')) return 'Google Docs';
    if (hostname.includes('youtube') || hostname.includes('youtu.be')) return 'YouTube';
    if (hostname.includes('reddit')) return 'Reddit';
    if (hostname.includes('smogon')) return 'Smogon';
    if (hostname.includes('marriland')) return 'Marriland';
    if (hostname.includes('serebii')) return 'Serebii';
    if (hostname.includes('bulbapedia')) return 'Bulbapedia';
    if (hostname.includes('pikalytics')) return 'Pikalytics';
    if (hostname.includes('limitlessv')) return 'Limitless';
    if (hostname.includes('victoryroad')) return 'Victory Road';
    return hostname.replace('www.', '').split('.')[0];
  } catch {
    return 'Unknown';
  }
}

function extractTags(text) {
  if (!text) return [];
  const tags = [];
  const lower = text.toLowerCase();

  // Common competitive Pokemon tags
  const tagKeywords = {
    'ou': 'ou', 'uu': 'uu', 'uber': 'ubers', 'ubers': 'ubers', 'ru': 'ru', 'nu': 'nu', 'pu': 'pu',
    'vgc': 'vgc', 'doubles': 'doubles', 'singles': 'singles', 'monotype': 'monotype',
    'rain': 'rain team', 'sun': 'sun team', 'sand': 'sand team', 'hail': 'hail team', 'snow': 'snow team',
    'trick room': 'trick room', 'hyper offense': 'hyper offense', 'stall': 'stall', 'balance': 'balance',
    'competitive': 'competitive', 'casual': 'casual', 'showdown': 'showdown',
    'gen 9': 'gen 9', 'gen 8': 'gen 8', 'gen 7': 'gen 7', 'scarlet': 'gen 9', 'violet': 'gen 9',
    'regulation': 'regulation', 'reg g': 'reg g', 'reg h': 'reg h', 'reg f': 'reg f',
  };

  for (const [keyword, tag] of Object.entries(tagKeywords)) {
    if (lower.includes(keyword)) tags.push(tag);
  }

  return [...new Set(tags)];
}

async function fetchChannelMessages(channel, limit) {
  const allMessages = [];
  let lastId;
  let remaining = limit;

  while (remaining > 0) {
    const batch = await channel.messages.fetch({ limit: Math.min(100, remaining), ...(lastId && { before: lastId }) });
    if (batch.size === 0) break;
    allMessages.push(...batch.values());
    lastId = batch.last().id;
    remaining -= batch.size;
    if (batch.size < 100) break;
  }

  return allMessages.sort((a, b) => a.createdTimestamp - b.createdTimestamp);
}

function buildProgressBar(pct) {
  const filled = Math.round(pct / 5);
  const empty = 20 - filled;
  return '`' + '\u2588'.repeat(filled) + '\u2591'.repeat(empty) + '`';
}

module.exports = { data: commandData, execute };
