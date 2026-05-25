const { ContextMenuCommandBuilder, ApplicationCommandType, PermissionFlagsBits } = require('discord.js');
const firestore = require('../services/firestore');

const data = new ContextMenuCommandBuilder()
  .setName('Exclude from Pokedex')
  .setType(ApplicationCommandType.Message);

async function execute(interaction) {
  const thread = interaction.channel;
  const issue = thread?.isThread?.() ? await firestore.getIssueByThreadId(thread.id) : null;
  if (!issue) {
    return interaction.reply({ content: 'Run this on a message inside a Pokedex issue thread.', ephemeral: true });
  }
  const target = interaction.targetMessage;
  const isMod = interaction.member?.permissions?.has(PermissionFlagsBits.ManageMessages);
  const isOwn = target.author?.id === interaction.user.id;
  if (!isMod && !isOwn) {
    return interaction.reply({ content: 'You can only exclude your own messages.', ephemeral: true });
  }
  await firestore.addExcludedMessageIds(issue.id, [target.id]);
  return interaction.reply({ content: 'Excluded that message from Pokedex context.', ephemeral: true });
}

module.exports = { data, execute };
