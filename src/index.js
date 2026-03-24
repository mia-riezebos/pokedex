require('dotenv/config');
const { Client, GatewayIntentBits, Partials, REST, Routes, ActivityType, EmbedBuilder, ActionRowBuilder, ButtonBuilder } = require('discord.js');
const firestore = require('./services/firestore');
const config = require('./config/config');
const triage = require('./services/triage');
const { handleMention } = require('./triggers/mention');
const { handleReaction } = require('./triggers/reaction');
const { handleThreadMessage } = require('./triggers/thread');
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

// Handle @mentions and thread follow-ups
client.on('messageCreate', async (message) => {
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