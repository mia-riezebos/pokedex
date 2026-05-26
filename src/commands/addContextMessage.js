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
  // Defer up front — every other path here makes at least one network call
  // (Firestore read/update, channel.messages.fetch, message.edit) and Discord
  // will time out the interaction without a deferred reply under normal latency.
  await interaction.deferReply({ ephemeral: true });

  try {
    const thread = interaction.channel;
    const issue = thread?.isThread?.() ? await firestore.getIssueByThreadId(thread.id) : null;
    if (!issue) {
      await interaction.editReply({ content: 'Run this on a message inside a Pokedex issue thread.' });
      return;
    }

    const target = interaction.targetMessage;
    const text = normalizeAdditionalContextText(target?.content);
    if (!text) {
      await interaction.editReply({ content: 'That message has no text to add.' });
      return;
    }

    const updated = await firestore.appendAdditionalContext(issue.id, {
      text,
      authorId: target.author?.id || null,
      authorName: target.author?.username || null,
      sourceMessageId: target.id,
    });

    if (!updated) {
      await interaction.editReply({ content: 'Could not find the issue to update.' });
      return;
    }

    const refreshed = await refreshTriageEmbedForIssue(interaction.guild, updated, updated.id);
    const tail = refreshed ? ' Triage embed updated.' : '';
    await interaction.editReply({ content: `Added that message to context.${tail}` });
  } catch (err) {
    console.error('Add to Pokedex context failed:', err);
    await interaction.editReply({ content: 'Failed to add context.' }).catch(() => {});
  }
}

module.exports = { data, execute };
