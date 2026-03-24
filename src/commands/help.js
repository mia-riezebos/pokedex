const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

const commandData = new SlashCommandBuilder()
  .setName('help')
  .setDescription('Show all Pokedex commands and how to report issues');

async function execute(interaction) {
  const embed = new EmbedBuilder()
    .setTitle('Pokedex — Issue Triage Bot')
    .setColor(0x5865f2)
    .setDescription('I help organize and prioritize issues for the engineering team. Here\'s how to use me:')
    .addFields(
      {
        name: '🐛 Report an Issue',
        value: [
          '**@mention me** — Tag me with a description of the problem',
          '**React with 🐛** — React on any message to flag it as an issue',
        ].join('\n'),
      },
      {
        name: '💡 Submit a Suggestion',
        value: 'React with 💡 on any message to submit it as a feature request or idea',
      },
      {
        name: '📋 What Happens Next',
        value: [
          '• I classify the issue by **priority** (critical/high/medium/low) and **category** (bug, feature request, etc.)',
          '• The issue gets posted to the triage channel for engineers',
          '• If I need more info, I\'ll ask a follow-up question',
        ].join('\n'),
      },
      {
        name: '⚙️ Commands',
        value: [
          '`/help` — Show this message',
          '`/config list` — View current bot settings',
          '`/config set <key> <value>` — Change a setting (admin only)',
          '`/config get <key>` — View a specific setting',
          '`/config reset <key>` — Reset a setting to default (admin only)',
          '`/feedback` — Organize and summarize feedback forum posts',
        ].join('\n'),
      },
      {
        name: '🔧 Configurable Settings',
        value: [
          '`model` — AI model used for classification',
          '`triage_channel` — Channel where issues are posted',
          '`emoji_trigger` — Emoji that triggers issue reporting',
          '`output_mode` — embed, summary, or both',
          '`acknowledge` — Whether I reply to the reporter',
          '`summary_interval` — Digest frequency (daily/weekly)',
        ].join('\n'),
      },
    )
    .setFooter({ text: 'Pokedex — Identifying bugs so engineers don\'t have to hunt for them' });

  await interaction.reply({ embeds: [embed], ephemeral: true });
}

module.exports = { data: commandData, execute };
