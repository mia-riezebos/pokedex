const { SlashCommandBuilder } = require('discord.js');
const firestore = require('../services/firestore');
const {
  normalizeAdditionalContextText,
  refreshTriageEmbedForIssue,
} = require('../services/addContext');

const data = new SlashCommandBuilder()
  .setName('addcontext')
  .setDescription('Add extra context to a filed Pokedex issue (run inside the issue thread)')
  .addStringOption(opt =>
    opt.setName('text')
      .setDescription('What you want the triage team to know')
      .setRequired(true)
      .setMaxLength(1024));

async function execute(interaction) {
  await interaction.deferReply({ ephemeral: true });
  try {
    const thread = interaction.channel;
    const issue = thread?.isThread?.() ? await firestore.getIssueByThreadId(thread.id) : null;
    if (!issue) {
      await interaction.editReply({ content: 'Run this inside a Pokedex issue thread.' });
      return;
    }

    const text = normalizeAdditionalContextText(interaction.options.getString('text'));
    if (!text) {
      await interaction.editReply({ content: 'Nothing to add — give me some text.' });
      return;
    }

    const updated = await firestore.appendAdditionalContext(issue.id, {
      text,
      authorId: interaction.user.id,
      authorName: interaction.user.username,
    });

    if (!updated) {
      await interaction.editReply({ content: 'Could not find the issue to update.' });
      return;
    }

    const refreshed = await refreshTriageEmbedForIssue(interaction.guild, updated, updated.id);
    const tail = refreshed
      ? ' Triage embed updated.'
      : ' (Triage embed could not be edited — the team will still see this on next refresh.)';
    await interaction.editReply({ content: `Added to context.${tail}` });
  } catch (err) {
    console.error('addcontext failed:', err);
    if (interaction.deferred || interaction.replied) {
      await interaction.editReply({ content: 'Failed to add context.' }).catch(() => {});
    }
  }
}

module.exports = { data, execute };
