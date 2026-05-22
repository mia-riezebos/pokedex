const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const firestore = require('../services/firestore');

/**
 * Returns the IDs of messages to exclude.
 * Mods get the last N messages across all authors.
 * Non-mods (OP) get only their own messages among the last N.
 *
 * @param {{ id: string, authorId: string }[]} messages - Sorted oldest→newest
 * @param {number} n
 * @param {{ isMod: boolean, runnerId: string }} opts
 * @returns {string[]}
 */
function computeLastExclusions(messages, n, { isMod, runnerId }) {
  if (isMod) {
    return messages.slice(-n).map(m => m.id);
  }
  // Non-mods: take the last N of their own messages only
  const own = messages.filter(m => m.authorId === runnerId);
  return own.slice(-n).map(m => m.id);
}

const data = new SlashCommandBuilder()
  .setName('exclude')
  .setDescription("Keep messages out of Pokedex's context")
  .addSubcommand(sub =>
    sub.setName('last')
      .setDescription('Exclude the last N messages')
      .addIntegerOption(opt =>
        opt.setName('count')
          .setDescription('Number of recent messages to exclude')
          .setRequired(true)
          .setMinValue(1)
          .setMaxValue(50)))
  .addSubcommand(sub =>
    sub.setName('on')
      .setDescription('Exclude all your messages until you run /exclude off'))
  .addSubcommand(sub =>
    sub.setName('off')
      .setDescription('Stop excluding your messages'))
  .addSubcommand(sub =>
    sub.setName('status')
      .setDescription('Show what\'s currently excluded in this thread'))
  .addSubcommand(sub =>
    sub.setName('clear')
      .setDescription('Clear all exclusions in this thread (mods only)'));

async function execute(interaction) {
  try {
    const thread = interaction.channel;
    const issue = thread?.isThread?.() ? await firestore.getIssueByThreadId(thread.id) : null;

    if (!issue) {
      await interaction.reply({ content: 'Run this inside a Pokedex issue thread.', ephemeral: true });
      return;
    }

    const isMod = interaction.member?.permissions?.has(PermissionFlagsBits.ManageMessages) ?? false;
    const sub = interaction.options.getSubcommand();

    if (sub === 'last') {
      const count = interaction.options.getInteger('count');
      const fetched = await thread.messages.fetch({ limit: 100 });
      const mapped = [...fetched.values()]
        .sort((a, b) => a.createdTimestamp - b.createdTimestamp)
        .map(m => ({ id: m.id, authorId: m.author.id }));

      const ids = computeLastExclusions(mapped, count, { isMod, runnerId: interaction.user.id });

      if (ids.length === 0) {
        await interaction.reply({ content: 'No eligible messages found to exclude.', ephemeral: true });
        return;
      }

      await firestore.addExcludedMessageIds(issue.id, ids);
      await interaction.reply({ content: `Excluded ${ids.length} message${ids.length === 1 ? '' : 's'} from Pokedex context.`, ephemeral: true });
      return;
    }

    if (sub === 'on') {
      await firestore.setExcludeMode(issue.id, interaction.user.id, true);
      await interaction.reply({ content: 'Your messages will now be excluded from Pokedex context in this thread. Run `/exclude off` to stop.', ephemeral: true });
      return;
    }

    if (sub === 'off') {
      await firestore.setExcludeMode(issue.id, interaction.user.id, false);
      await interaction.reply({ content: 'Your messages are no longer being excluded from Pokedex context.', ephemeral: true });
      return;
    }

    if (sub === 'status') {
      const fresh = await firestore.getIssueById(issue.id);
      const excludedCount = Array.isArray(fresh?.excludedMessageIds) ? fresh.excludedMessageIds.length : 0;
      const excludedUsers = Array.isArray(fresh?.excludeModeUserIds) && fresh.excludeModeUserIds.length > 0
        ? fresh.excludeModeUserIds.map(id => `<@${id}>`).join(', ')
        : 'none';
      await interaction.reply({
        content: `**Excluded messages:** ${excludedCount}\n**Exclude-mode users:** ${excludedUsers}`,
        ephemeral: true,
      });
      return;
    }

    if (sub === 'clear') {
      if (!isMod) {
        await interaction.reply({ content: 'Only mods can clear exclusions.', ephemeral: true });
        return;
      }
      await firestore.clearExclusions(issue.id);
      await interaction.reply({ content: 'All exclusions cleared for this thread.', ephemeral: true });
      return;
    }
  } catch (err) {
    console.error('[exclude] Error:', err);
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({ content: 'Something went wrong. Please try again.', ephemeral: true });
    }
  }
}

module.exports = { data, execute, computeLastExclusions };
