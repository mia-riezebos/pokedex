require('dotenv/config');
const { Client, GatewayIntentBits, Partials, REST, Routes, ActivityType } = require('discord.js');
const firestore = require('./services/firestore');
const config = require('./config/config');
const triage = require('./services/triage');
const { handleMention } = require('./triggers/mention');
const { handleReaction } = require('./triggers/reaction');
const configCommand = require('./commands/config');
const helpCommand = require('./commands/help');
const changelogCommand = require('./commands/changelog');

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
    { body: [configCommand.data.toJSON(), helpCommand.data.toJSON(), changelogCommand.data.toJSON()] },
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

// Handle @mentions
client.on('messageCreate', async (message) => {
  if (message.author.bot) return;
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

// Handle slash commands
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  const commands = { config: configCommand, help: helpCommand, changelog: changelogCommand };
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