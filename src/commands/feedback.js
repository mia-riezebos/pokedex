const { SlashCommandBuilder, EmbedBuilder, ChannelType } = require('discord.js');
const { getConfig } = require('../config/config');
const { findTriageChannel } = require('../services/triage');

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

const commandData = new SlashCommandBuilder()
  .setName('feedback')
  .setDescription('Organize and summarize feedback forum posts into eng-triage')
  .addStringOption(opt =>
    opt.setName('channel')
      .setDescription('Feedback channel name (default: feedback)')
      .setRequired(false))
  .addIntegerOption(opt =>
    opt.setName('limit')
      .setDescription('Max number of threads/messages to analyze (default: 20)')
      .setRequired(false))
  .addStringOption(opt =>
    opt.setName('visibility')
      .setDescription('Who can see the summary response')
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

  const systemPrompt = `You are Pokedex, an AI assistant for poke.com. Analyze these Discord feedback posts and organize them.

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

function findFeedbackChannel(guild, channelName) {
  // Normalize: strip invisible chars, lowercase, trim
  const normalize = (s) => s.replace(/[^\x20-\x7E]/g, '').toLowerCase().trim();
  const target = normalize(channelName);

  return guild.channels.cache.find(ch => {
    // Match forums, text channels, and announcement channels
    const validTypes = [ChannelType.GuildForum, ChannelType.GuildText, ChannelType.GuildAnnouncement];
    if (!validTypes.includes(ch.type)) return false;
    const name = normalize(ch.name);
    return name === target || name.includes(target);
  });
}

async function execute(interaction) {
  const channelName = interaction.options.getString('channel') || 'feedback';
  const limit = interaction.options.getInteger('limit') || 20;
  const visibility = interaction.options.getString('visibility') || 'ephemeral';
  const ephemeral = visibility === 'ephemeral';

  await interaction.deferReply({ ephemeral });

  const guild = interaction.guild;

  // Find the feedback channel
  const feedbackChannel = findFeedbackChannel(guild, channelName);

  if (!feedbackChannel) {
    // List available channels to help debug
    const channels = guild.channels.cache
      .filter(ch => [ChannelType.GuildForum, ChannelType.GuildText].includes(ch.type))
      .map(ch => `\`${ch.name}\` (${ch.type === ChannelType.GuildForum ? 'forum' : 'text'})`)
      .slice(0, 15)
      .join('\n');
    return interaction.editReply(`Could not find a channel matching "${channelName}".\n\nAvailable channels:\n${channels}`);
  }

  // Collect feedback data
  let feedbackData = [];
  try {
    if (feedbackChannel.type === ChannelType.GuildForum) {
      // Forum channel — fetch threads
      const fetched = await feedbackChannel.threads.fetchActive();
      const archived = await feedbackChannel.threads.fetchArchived({ limit }).catch(() => ({ threads: new Map() }));
      const threads = [...fetched.threads.values(), ...archived.threads.values()];

      for (const thread of threads.slice(0, limit)) {
        try {
          const messages = await thread.messages.fetch({ limit: 1 });
          const first = messages.last();
          const availableTags = feedbackChannel.availableTags || [];
          const tagNames = (thread.appliedTags || []).map(tagId => {
            const tag = availableTags.find(t => t.id === tagId);
            return tag?.name || 'unknown';
          });

          feedbackData.push({
            name: thread.name,
            authorName: thread.ownerId ? (await guild.members.fetch(thread.ownerId).catch(() => null))?.user?.username || 'unknown' : 'unknown',
            messageCount: thread.messageCount || 0,
            tags: tagNames,
            firstMessage: first?.content?.slice(0, 500) || '(no content)',
          });
        } catch {
          // Skip unreadable threads
        }
      }
    } else {
      // Text channel — fetch recent messages
      const messages = await feedbackChannel.messages.fetch({ limit });
      feedbackData = [...messages.values()]
        .filter(m => !m.author.bot)
        .map(m => ({
          name: m.content.slice(0, 50) || 'Untitled',
          authorName: m.author.username,
          messageCount: 0,
          tags: [],
          firstMessage: m.content,
        }));
    }
  } catch (err) {
    console.error('Failed to fetch feedback:', err);
    return interaction.editReply('Failed to fetch feedback. Make sure I have access to the channel.');
  }

  if (feedbackData.length === 0) {
    return interaction.editReply(`No feedback found in #${feedbackChannel.name}.`);
  }

  // Analyze with AI
  const analysis = await organizeFeedback(feedbackData);
  if (!analysis) {
    return interaction.editReply('Failed to analyze feedback. Try again later.');
  }

  // Post organized feedback to eng-triage
  const triageChannel = findTriageChannel(guild);
  if (triageChannel) {
    await postToTriage(triageChannel, analysis, feedbackChannel, feedbackData.length, interaction.user.username);
  }

  // Reply to the user with summary
  await sendAnalysisReply(interaction, analysis, feedbackChannel, feedbackData.length, !!triageChannel);
}

async function postToTriage(triageChannel, analysis, sourceChannel, threadCount, requestedBy) {
  const PRIORITY_COLORS = { high: 0xff8c00, medium: 0xffd700, low: 0x00cc00 };

  // Header embed
  const headerEmbed = new EmbedBuilder()
    .setTitle(`📊 Feedback Report — #${sourceChannel.name}`)
    .setColor(0x5865f2)
    .setDescription(analysis.summary || 'No summary available.')
    .addFields(
      { name: 'Posts Analyzed', value: `${threadCount}`, inline: true },
      { name: 'Themes', value: `${analysis.themes?.length || 0}`, inline: true },
      { name: 'Requested By', value: requestedBy, inline: true },
    )
    .setTimestamp();

  if (analysis.top_requests?.length > 0) {
    headerEmbed.addFields({
      name: '🔥 Top Requests',
      value: analysis.top_requests.map((r, i) => `${i + 1}. ${r}`).join('\n'),
    });
  }

  await triageChannel.send({ embeds: [headerEmbed] });

  // Post each theme as a separate embed for easy tracking
  for (const theme of (analysis.themes || []).slice(0, 8)) {
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

    await triageChannel.send({ embeds: [embed] });
  }
}

async function sendAnalysisReply(interaction, analysis, channel, threadCount, postedToTriage) {
  const SENTIMENT_EMOJI = { positive: '😊', mixed: '😐', negative: '😟' };

  const embed = new EmbedBuilder()
    .setTitle(`📊 Feedback Analysis — #${channel.name}`)
    .setColor(0x5865f2)
    .setDescription(analysis.summary || 'No summary available.')
    .addFields(
      { name: 'Posts Analyzed', value: `${threadCount}`, inline: true },
      { name: 'Themes Found', value: `${analysis.themes?.length || 0}`, inline: true },
      { name: 'Sentiment', value: `${SENTIMENT_EMOJI[analysis.sentiment] || '😐'} ${analysis.sentiment || 'mixed'}`, inline: true },
    );

  if (analysis.top_requests?.length > 0) {
    embed.addFields({
      name: '🔥 Top Requests',
      value: analysis.top_requests.map((r, i) => `${i + 1}. ${r}`).join('\n'),
    });
  }

  if (postedToTriage) {
    embed.setFooter({ text: 'Full report posted to #eng-triage' });
  } else {
    embed.setFooter({ text: 'Warning: eng-triage channel not found — report not posted' });
  }

  await interaction.editReply({ embeds: [embed] });
}

module.exports = { data: commandData, execute };
