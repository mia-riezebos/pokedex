require('dotenv/config');
const { Client, GatewayIntentBits, Partials, REST, Routes, ActivityType, EmbedBuilder, ActionRowBuilder, ButtonBuilder } = require('discord.js');
const firestore = require('./services/firestore');
const config = require('./config/config');
const triage = require('./services/triage');
const { handleMention } = require('./triggers/mention');
const { handleReaction } = require('./triggers/reaction');
const { handleThreadMessage } = require('./triggers/thread');
// pending poller replaced by instant webhook message detection
const configCommand = require('./commands/config');
const helpCommand = require('./commands/help');
const changelogCommand = require('./commands/changelog');
const feedbackCommand = require('./commands/feedback');
const issueCommand = require('./commands/issue');
const pingCommand = require('./commands/ping');
const lockCommand = require('./commands/lock');
const unlockCommand = require('./commands/unlock');
const leaderboardCommand = require('./commands/leaderboard');
const pokedexCommand = require('./commands/pokedex');
const { startDashboard } = require('./dashboard/server');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMessageReactions,
  ],
  partials: [Partials.Message, Partials.Reaction],
});

// Register slash commands guild-scoped
async function registerCommands() {
  const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
  await rest.put(
    Routes.applicationGuildCommands(process.env.DISCORD_APP_ID, process.env.DISCORD_GUILD_ID),
    { body: [configCommand.data.toJSON(), helpCommand.data.toJSON(), changelogCommand.data.toJSON(), feedbackCommand.data.toJSON(), issueCommand.data.toJSON(), pingCommand.data.toJSON(), lockCommand.data.toJSON(), unlockCommand.data.toJSON(), leaderboardCommand.data.toJSON(), pokedexCommand.data.toJSON()] },
  );
  console.log('Slash commands registered.');
}

client.once('ready', async () => {
  console.log(`Logged in as ${client.user.tag}`);

  // Set rich presence
  client.user.setPresence({
    activities: [{ name: 'for bugs | /help + @pierre for support', type: ActivityType.Watching }],
    status: 'online',
  });

  // Check for triage channel
  const guild = client.guilds.cache.get(process.env.DISCORD_GUILD_ID);
  if (guild) {
    const triageChannel = triage.findTriageChannel(guild);
    if (!triageChannel) {
      const warning = `WARNING: Triage channel "${config.getConfig('triage_channel')}" not found. Please create it and restart the bot.`;
      console.warn(warning);
      guild.systemChannel?.send(warning).catch(() => {});
    }

    // Start digest scheduler
    triage.startDigestScheduler(guild);
  }
});

// Handle @mentions, thread follow-ups, and webhook pending messages
client.on('messageCreate', async (message) => {
  // Check if this is a webhook MCP pending message — reply with approval buttons
  if (message.webhookId && message.content?.includes('pending approval')) {
    try {
      await handleWebhookPending(message);
    } catch (err) {
      console.error('Error handling webhook pending:', err);
    }
    return;
  }

  if (message.author.bot) return;

  // Check if this is a message in an issue thread (no @mention needed)
  if (message.channel.isThread() && !message.mentions.has(client.user)) {
    try {
      await handleThreadMessage(message);
    } catch (err) {
      console.error('Error handling thread message:', err);
    }
    return;
  }

  if (!message.mentions.has(client.user)) return;

  try {
    await handleMention(message);
  } catch (err) {
    console.error('Error handling mention:', err);
  }
});

// When webhook posts a pending MCP message, bot replies with approve/delete buttons
async function handleWebhookPending(message) {
  const admin = require('firebase-admin');
  const db = admin.firestore();

  // Find the most recent pending MCP issue that doesn't have a pendingMessageId yet
  const snapshot = await db.collection('issues')
    .where('status', '==', 'pending')
    .where('source', '==', 'mcp')
    .orderBy('createdAt', 'desc')
    .limit(5)
    .get();

  if (snapshot.empty) return;

  // Find the one that matches (hasn't been posted yet)
  for (const doc of snapshot.docs) {
    const issue = doc.data();
    if (issue.pendingMessageId) continue;

    const issueId = doc.id;

    // Check if the webhook message content mentions this issue's reporter or summary
    if (!message.content.includes(issue.reporterName) && !message.content.includes(issue.summary?.slice(0, 30))) continue;

    const embed = new EmbedBuilder()
      .setTitle(`⏳ MCP Report — ${issue.summary || 'No summary'}`)
      .setColor(0x9b59b6)
      .setDescription('Submitted via MCP agent. **Approve** to add to triage or **Delete** to discard.')
      .addFields(
        { name: 'Priority', value: issue.priority || 'unknown', inline: true },
        { name: 'Category', value: issue.category || 'other', inline: true },
        { name: 'Reporter', value: issue.reporterName || 'unknown', inline: true },
        { name: 'Description', value: (issue.text || '(no description)').slice(0, 1024) },
      )
      .setFooter({ text: `Issue ID: ${issueId}` })
      .setTimestamp();

    const buttons = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`mcp_approve_${issueId}`)
        .setLabel('Approve')
        .setEmoji('✅')
        .setStyle(2), // Success = 3, but let's use Primary = 1 ... actually ButtonStyle.Success
      new ButtonBuilder()
        .setCustomId(`mcp_delete_${issueId}`)
        .setLabel('Delete')
        .setStyle(4), // Danger
    );

    // Reply to the webhook message with the button embed
    await message.reply({ embeds: [embed], components: [buttons] });

    // Mark as posted
    await db.collection('issues').doc(issueId).update({ pendingMessageId: message.id });

    console.log(`Posted approval buttons for MCP issue ${issueId}`);
    break;
  }
}

// Handle emoji reactions
client.on('messageReactionAdd', async (reaction, user) => {
  try {
    await handleReaction(reaction, user);
  } catch (err) {
    console.error('Error handling reaction:', err);
  }
});

// Handle slash commands and button interactions
client.on('interactionCreate', async (interaction) => {
  // --- Button interactions ---
  if (interaction.isButton()) {
    try {
      await handleButtonInteraction(interaction);
    } catch (err) {
      console.error('Error handling button:', err);
      if (!interaction.replied && !interaction.deferred) {
        await interaction.reply({ content: 'Failed to process action.', ephemeral: true }).catch(() => {});
      }
    }
    return;
  }

  if (!interaction.isChatInputCommand()) return;
  const commands = { config: configCommand, help: helpCommand, changelog: changelogCommand, feedback: feedbackCommand, issue: issueCommand, ping: pingCommand, lock: lockCommand, unlock: unlockCommand, leaderboard: leaderboardCommand, pokedex: pokedexCommand };
  const command = commands[interaction.commandName];
  if (!command) return;

  try {
    await command.execute(interaction);
  } catch (err) {
    console.error(`Error handling /${interaction.commandName}:`, err);
    if (!interaction.replied) {
      await interaction.reply({ content: 'An error occurred.', ephemeral: true });
    }
  }
});

// Button interaction handler for triage embeds
async function handleButtonInteraction(interaction) {
  const { customId } = interaction;
  const user = interaction.user;

  // Parse button ID: triage_<action>_<issueId> or fb_<action>_<themeIndex>
  const ACTION_LABELS = {
    ack: { label: '👀 Acknowledged', color: 0x3498db, status: 'acknowledged' },
    fix: { label: '✅ Fixed', color: 0x2ecc71, status: 'fixed' },
    wontfix: { label: "🚫 Won't Fix", color: 0x95a5a6, status: 'wontfix' },
    escalate: { label: '🔺 Escalated', color: 0xe74c3c, status: 'escalated' },
  };

  // --- Issue triage buttons ---
  if (customId.startsWith('triage_')) {
    const parts = customId.split('_');
    const action = parts[1];
    const issueId = parts.slice(2).join('_');

    // Handle delete separately
    if (action === 'delete') {
      try {
        // Delete from Firestore
        const admin = require('firebase-admin');
        const db = admin.firestore();
        await db.collection('issues').doc(issueId).delete();
        // Delete the triage message
        await interaction.message.delete();
      } catch (err) {
        console.error('Failed to delete issue:', err);
        await interaction.reply({ content: 'Failed to delete issue.', ephemeral: true });
      }
      return;
    }

    const actionInfo = ACTION_LABELS[action];
    if (!actionInfo) return;

    // Update Firestore
    try {
      await firestore.updateIssueStatus(issueId, actionInfo.status, user.id);
    } catch (err) {
      console.error('Failed to update issue status:', err);
    }

    // Update the embed
    const message = interaction.message;
    const embed = EmbedBuilder.from(message.embeds[0]);
    embed.setColor(actionInfo.color);
    embed.addFields({ name: actionInfo.label, value: `by ${user.username} — <t:${Math.floor(Date.now() / 1000)}:R>` });

    // Disable buttons after action and highlight the one clicked
    // ActionRowBuilder, ButtonBuilder already imported at top
    const updatedRow = new ActionRowBuilder();
    for (const component of message.components[0].components) {
      const btn = ButtonBuilder.from(component);
      if (component.customId === customId) {
        btn.setDisabled(false);
        btn.setStyle(2);
      } else {
        btn.setDisabled(true);
      }
      updatedRow.addComponents(btn);
    }

    await interaction.update({ embeds: [embed], components: [updatedRow] });
    return;
  }

  // --- Feedback theme buttons ---
  if (customId.startsWith('fb_')) {
    const parts = customId.split('_');
    const action = parts[1];
    const themeIndex = parts[2];

    // Handle delete — just remove the message
    if (action === 'delete') {
      try {
        await interaction.message.delete();
      } catch (err) {
        console.error('Failed to delete feedback embed:', err);
        await interaction.reply({ content: 'Failed to delete.', ephemeral: true });
      }
      return;
    }

    const actionInfo = ACTION_LABELS[action];
    if (!actionInfo) return;

    // Update the embed
    const message = interaction.message;
    const embed = EmbedBuilder.from(message.embeds[0]);
    embed.setColor(actionInfo.color);
    embed.addFields({ name: actionInfo.label, value: `by ${user.username} — <t:${Math.floor(Date.now() / 1000)}:R>` });

    // Disable buttons after action
    // ActionRowBuilder, ButtonBuilder already imported at top
    const updatedRow = new ActionRowBuilder();
    for (const component of message.components[0].components) {
      const btn = ButtonBuilder.from(component);
      if (component.customId === customId) {
        btn.setDisabled(false);
      } else {
        btn.setDisabled(true);
      }
      updatedRow.addComponents(btn);
    }

    await interaction.update({ embeds: [embed], components: [updatedRow] });
    return;
  }

  // --- Duplicate detection buttons ---
  if (customId.startsWith('dupe_confirm_')) {
    // User confirms it's the same issue — just dismiss the embed
    const embed = EmbedBuilder.from(interaction.message.embeds[0]);
    embed.setColor(0x2ecc71);
    embed.setTitle('✅ Duplicate Confirmed');
    embed.setDescription('Thanks! Your report has been added as additional context to the existing issue.');
    await interaction.update({ embeds: [embed], components: [] });
    return;
  }

  if (customId.startsWith('dupe_new_')) {
    // User says it's NOT a duplicate — process as new issue
    const messageId = customId.replace('dupe_new_', '');
    const embed = EmbedBuilder.from(interaction.message.embeds[0]);
    embed.setColor(0x3498db);
    embed.setTitle('🆕 Creating New Issue');
    embed.setDescription('Got it — creating this as a separate issue.');
    await interaction.update({ embeds: [embed], components: [] });

    // Re-process the original message through the pipeline (skip dupe check)
    try {
      const channel = interaction.message.channel;
      const originalMsg = await channel.messages.fetch(interaction.message.reference?.messageId || messageId).catch(() => null);
      if (originalMsg) {
        const text = originalMsg.content.replace(/<@!?\d+>/g, '').trim();
        const { processIssueForced } = require('./services/pipeline');
        if (processIssueForced) {
          await processIssueForced(originalMsg, text);
        }
      }
    } catch (err) {
      console.error('Failed to re-process as new issue:', err);
    }
    return;
  }

  // --- MCP pending approval buttons ---
  if (customId.startsWith('mcp_approve_')) {
    const issueId = customId.replace('mcp_approve_', '');
    try {
      const admin = require('firebase-admin');
      const db = admin.firestore();

      // Update status to open
      await db.collection('issues').doc(issueId).update({ status: 'open', approvedBy: user.id, approvedAt: admin.firestore.FieldValue.serverTimestamp() });

      // Rebuild as a proper triage embed with full buttons
      const doc = await db.collection('issues').doc(issueId).get();
      const issue = doc.data();

      const { buildIssueEmbed, buildTriageButtons } = require('./services/triage');
      const embed = buildIssueEmbed({ ...issue, messageId: issue.messageId }, issueId);
      embed.addFields({ name: '✅ Approved', value: `by ${user.username} — <t:${Math.floor(Date.now() / 1000)}:R>` });

      const buttons = buildTriageButtons(issueId);
      await interaction.update({ embeds: [embed], components: [buttons] });
    } catch (err) {
      console.error('Failed to approve MCP issue:', err);
      await interaction.reply({ content: 'Failed to approve issue.', ephemeral: true }).catch(() => {});
    }
    return;
  }

  if (customId.startsWith('mcp_delete_')) {
    const issueId = customId.replace('mcp_delete_', '');
    try {
      const admin = require('firebase-admin');
      const db = admin.firestore();
      await db.collection('issues').doc(issueId).delete();
      await interaction.message.delete();
    } catch (err) {
      console.error('Failed to delete MCP issue:', err);
      await interaction.reply({ content: 'Failed to delete.', ephemeral: true }).catch(() => {});
    }
    return;
  }
}


// Startup
async function main() {
  firestore.init();
  config.setFirestoreService(firestore);
  await config.init();
  await registerCommands();
  startDashboard();
  await client.login(process.env.DISCORD_TOKEN);
}

main().catch(err => {
  console.error('Fatal startup error:', err);
  process.exit(1);
});