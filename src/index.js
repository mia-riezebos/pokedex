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
    { body: [configCommand.data.toJSON(), helpCommand.data.toJSON(), changelogCommand.data.toJSON(), feedbackCommand.data.toJSON(), issueCommand.data.toJSON()] },
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
  const commands = { config: configCommand, help: helpCommand, changelog: changelogCommand, feedback: feedbackCommand, issue: issueCommand };
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
        btn.setStyle(2); // Secondary style to show it was selected
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
}


// Startup
async function main() {
  firestore.init();
  config.setFirestoreService(firestore);
  await config.init();
  await registerCommands();
  await client.login(process.env.DISCORD_TOKEN);
}

main().catch(err => {
  console.error('Fatal startup error:', err);
  process.exit(1);
});