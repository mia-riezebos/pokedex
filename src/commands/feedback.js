const { SlashCommandBuilder, EmbedBuilder, ChannelType } = require('discord.js');
const { getConfig } = require('../config/config');

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

const commandData = new SlashCommandBuilder()
  .setName('feedback')
  .setDescription('Organize and summarize feedback forum posts')
  .addStringOption(opt =>
    opt.setName('channel')
      .setDescription('Feedback forum channel name (default: feedback)')
      .setRequired(false))
  .addIntegerOption(opt =>
    opt.setName('limit')
      .setDescription('Max number of threads to analyze (default: 20)')
      .setRequired(false))
  .addStringOption(opt =>
    opt.setName('visibility')
      .setDescription('Who can see the response')
      .setRequired(false)
      .addChoices(
        { name: 'Only me', value: 'ephemeral' },
        { name: 'Everyone', value: 'public' },
      ));

async function organizeFeedback(threads) {
  const model = getConfig('model');
  const feedbackTexts = threads.map((t, i) =>
    `[${i + 1}] "${t.name}" by ${t.authorName} (${t.messageCount} replies, ${t.tags.join(', ') || 'no tags'})\n${t.firstMessage || '(no content)'}`
  ).join('\n\n---\n\n');

  const systemPrompt = `You are Pokedex, an AI assistant for poke.com. Analyze these Discord forum feedback posts and organize them.

Return ONLY valid JSON with this structure:
{
  "themes": [
    {
      "name": "Theme name",
      "description": "Brief description of this theme",
      "priority": "high" | "medium" | "low",
      "posts": [1, 3, 7],
      "actionable": true | false,
      "suggested_action": "What engineers should do about this"
    }
  ],
  "summary": "2-3 sentence executive summary of all feedback",
  "top_requests": ["Most requested thing", "Second most", "Third most"],
  "sentiment": "positive" | "mixed" | "negative"
}

Group similar feedback into themes. Sort themes by priority (high first). Be specific about what users want.`;

  try {
    const response = await fetch(OPENROUTER_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://poke.com',
        'X-Title': 'Pokedex Feedback Organizer',
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: feedbackTexts },
        ],
        response_format: { type: 'json_object' },
      }),
    });

    if (!response.ok) return null;
    const data = await response.json();
    let content = data.choices?.[0]?.message?.content?.trim() ?? '';
    if (content.startsWith('```')) {
      content = content.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '');
    }
    return JSON.parse(content);
  } catch (err) {
    console.error('Feedback analysis failed:', err.message);
    return null;
  }
}

async function execute(interaction) {
  const channelName = interaction.options.getString('channel') || 'feedback';
  const limit = interaction.options.getInteger('limit') || 20;
  const visibility = interaction.options.getString('visibility') || 'ephemeral';
  const ephemeral = visibility === 'ephemeral';

  await interaction.deferReply({ ephemeral });

  // Find the forum channel
  const guild = interaction.guild;
  const forumChannel = guild.channels.cache.find(
    ch => (ch.type === ChannelType.GuildForum || ch.type === ChannelType.GuildText) &&
      ch.name.toLowerCase().includes(channelName.toLowerCase())
  );

  if (!forumChannel) {
    return interaction.editReply(`Could not find a forum/channel matching "${channelName}". Make sure the channel exists and I have access.`);
  }

  // Fetch active threads
  let threads = [];
  try {
    if (forumChannel.type === ChannelType.GuildForum) {
      const fetched = await forumChannel.threads.fetchActive();
      const archived = await forumChannel.threads.fetchArchived({ limit });
      threads = [...fetched.threads.values(), ...archived.threads.values()];
    } else {
      // Regular text channel — fetch recent messages instead
      const messages = await forumChannel.messages.fetch({ limit });
      threads = messages.map(m => ({
        name: m.content.slice(0, 50) || 'Untitled',
        authorName: m.author.username,
        messageCount: 0,
        tags: [],
        firstMessage: m.content,
      }));

      if (threads.length === 0) {
        return interaction.editReply(`No messages found in #${forumChannel.name}.`);
      }

      const analysis = await organizeFeedback(threads);
      if (!analysis) {
        return interaction.editReply('Failed to analyze feedback. Try again later.');
      }

      return sendAnalysisEmbeds(interaction, analysis, forumChannel, threads.length);
    }
  } catch (err) {
    console.error('Failed to fetch threads:', err);
    return interaction.editReply('Failed to fetch threads. Make sure I have access to the channel.');
  }

  if (threads.length === 0) {
    return interaction.editReply(`No threads found in #${forumChannel.name}.`);
  }

  // Collect thread data
  const threadData = [];
  for (const thread of threads.slice(0, limit)) {
    try {
      const messages = await thread.messages.fetch({ limit: 1 });
      const first = messages.last();
      const availableTags = forumChannel.availableTags || [];
      const tagNames = (thread.appliedTags || []).map(tagId => {
        const tag = availableTags.find(t => t.id === tagId);
        return tag?.name || 'unknown';
      });

      threadData.push({
        name: thread.name,
        authorName: thread.ownerId ? (await thread.guild.members.fetch(thread.ownerId).catch(() => null))?.user?.username || 'unknown' : 'unknown',
        messageCount: thread.messageCount || 0,
        tags: tagNames,
        firstMessage: first?.content?.slice(0, 500) || '(no content)',
      });
    } catch {
      // Skip threads we can't read
    }
  }

  if (threadData.length === 0) {
    return interaction.editReply('Could not read any threads. Check bot permissions.');
  }

  const analysis = await organizeFeedback(threadData);
  if (!analysis) {
    return interaction.editReply('Failed to analyze feedback. Try again later.');
  }

  await sendAnalysisEmbeds(interaction, analysis, forumChannel, threadData.length);
}

async function sendAnalysisEmbeds(interaction, analysis, channel, threadCount) {
  const PRIORITY_COLORS = { high: 0xff8c00, medium: 0xffd700, low: 0x00cc00 };
  const SENTIMENT_EMOJI = { positive: '😊', mixed: '😐', negative: '😟' };

  // Summary embed
  const summaryEmbed = new EmbedBuilder()
    .setTitle(`📊 Feedback Analysis — #${channel.name}`)
    .setColor(0x5865f2)
    .setDescription(analysis.summary || 'No summary available.')
    .addFields(
      { name: 'Threads Analyzed', value: `${threadCount}`, inline: true },
      { name: 'Themes Found', value: `${analysis.themes?.length || 0}`, inline: true },
      { name: 'Sentiment', value: `${SENTIMENT_EMOJI[analysis.sentiment] || '😐'} ${analysis.sentiment || 'mixed'}`, inline: true },
    );

  if (analysis.top_requests?.length > 0) {
    summaryEmbed.addFields({
      name: '🔥 Top Requests',
      value: analysis.top_requests.map((r, i) => `${i + 1}. ${r}`).join('\n'),
    });
  }

  // Theme embeds
  const themeEmbeds = (analysis.themes || []).slice(0, 5).map((theme, i) => {
    const color = PRIORITY_COLORS[theme.priority] || 0x808080;
    const embed = new EmbedBuilder()
      .setTitle(`${theme.actionable ? '🎯' : '💬'} ${theme.name}`)
      .setColor(color)
      .setDescription(theme.description || 'No description')
      .addFields(
        { name: 'Priority', value: theme.priority?.toUpperCase() || 'UNKNOWN', inline: true },
        { name: 'Related Posts', value: `${theme.posts?.length || 0}`, inline: true },
        { name: 'Actionable', value: theme.actionable ? 'Yes' : 'No', inline: true },
      );

    if (theme.suggested_action) {
      embed.addFields({ name: 'Suggested Action', value: theme.suggested_action });
    }

    return embed;
  });

  await interaction.editReply({ embeds: [summaryEmbed, ...themeEmbeds] });
}

module.exports = { data: commandData, execute };
