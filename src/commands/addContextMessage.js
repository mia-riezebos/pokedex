const { ContextMenuCommandBuilder, ApplicationCommandType } = require('discord.js');
const firestore = require('../services/firestore');
const {
  normalizeAdditionalContextText,
  refreshTriageEmbedForIssue,
} = require('../services/addContext');

const data = new ContextMenuCommandBuilder()
  .setName('Add to Pokedex context')
  .setType(ApplicationCommandType.Message);

async function execute(interaction) {
  const thread = interaction.channel;
  const issue = thread?.isThread?.() ? await firestore.getIssueByThreadId(thread.id) : null;
  if (!issue) {
    return interaction.reply({ content: 'Run this on a message inside a Pokedex issue thread.', ephemeral: true });
  }

  const target = interaction.targetMessage;
  const text = normalizeAdditionalContextText(target?.content);
  if (!text) {
    return interaction.reply({ content: 'That message has no text to add.', ephemeral: true });
  }

  try {
    const updated = await firestore.appendAdditionalContext(issue.id, {
      text,
      authorId: target.author?.id || null,
      authorName: target.author?.username || null,
      sourceMessageId: target.id,
    });

    if (!updated) {
      return interaction.reply({ content: 'Could not find the issue to update.', ephemeral: true });
    }

    const refreshed = await refreshTriageEmbedForIssue(interaction.guild, updated, updated.id);
    const tail = refreshed ? ' Triage embed updated.' : '';
    return interaction.reply({ content: `Added that message to context.${tail}`, ephemeral: true });
  } catch (err) {
    console.error('Add to Pokedex context failed:', err);
    return interaction.reply({ content: 'Failed to add context.', ephemeral: true }).catch(() => {});
  }
}

module.exports = { data, execute };
