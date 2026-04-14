const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const { getConfig, setConfigOverride } = require('../config/config');

const commandData = new SlashCommandBuilder()
  .setName('autoscrape')
  .setDescription('Configure automatic recipe scraping')
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
  .addSubcommand(sub =>
    sub.setName('recipes')
      .setDescription('Toggle automatic recipe scraping from #show-and-tell')
      .addBooleanOption(opt =>
        opt.setName('enabled')
          .setDescription('Enable or disable auto-scraping')
          .setRequired(true))
      .addBooleanOption(opt =>
        opt.setName('auto_approve')
          .setDescription('Skip approval workflow — publish directly (default: false)')
          .setRequired(false)));

async function execute(interaction) {
  const sub = interaction.options.getSubcommand();
  if (sub === 'recipes') return executeRecipes(interaction);
  return interaction.reply({ content: 'Unknown subcommand.', ephemeral: true });
}

async function executeRecipes(interaction) {
  const enabled = interaction.options.getBoolean('enabled');
  const autoApprove = interaction.options.getBoolean('auto_approve');

  await setConfigOverride('autoscrape_recipes_enabled', enabled, interaction.user.id);

  if (autoApprove !== null) {
    await setConfigOverride('autoscrape_recipes_auto_approve', autoApprove, interaction.user.id);
  }

  const currentAutoApprove = autoApprove !== null
    ? autoApprove
    : (getConfig('autoscrape_recipes_auto_approve') || false);

  const embed = new EmbedBuilder()
    .setTitle('Auto-Scrape Recipes')
    .setColor(enabled ? 0x2ecc71 : 0xf43f5e)
    .setDescription(
      enabled
        ? 'Auto-scrape is now **enabled**. New #show-and-tell posts will be automatically checked for recipe links.'
        : 'Auto-scrape is now **disabled**.'
    )
    .addFields(
      { name: 'Enabled', value: enabled ? 'Yes' : 'No', inline: true },
      { name: 'Auto-Approve', value: currentAutoApprove ? 'Yes (skip approval)' : 'No (requires approval)', inline: true },
    )
    .setFooter({ text: `Updated by ${interaction.user.username}` })
    .setTimestamp();

  return interaction.reply({ embeds: [embed] });
}

module.exports = { data: commandData, execute };
