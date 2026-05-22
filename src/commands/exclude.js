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
  const lastN = messages.slice(-n);
  const eligible = isMod ? lastN : lastN.filter(m => m.authorId === runnerId);
  return eligible.map(m => m.id);
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
  await interaction.deferReply({ ephemeral: true });
  try {
    const thread = interaction.channel;
    const issue = thread?.isThread?.() ? await firestore.getIssueByThreadId(thread.id) : null;

    if (!issue) {
      await interaction.editReply({ content: 'Run this inside a Pokedex issue thread.' });
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
        await interaction.editReply({ content: 'No eligible messages found to exclude.' });
        return;
      }

      await firestore.addExcludedMessageIds(issue.id, ids);
      await interaction.editReply({ content: `Excluded ${ids.length} message${ids.length === 1 ? '' : 's'} from Pokedex context.` });
      return;
    }

    if (sub === 'on') {
      await firestore.setExcludeMode(issue.id, interaction.user.id, true);
      await interaction.editReply({ content: 'Your messages will now be excluded from Pokedex context in this thread. Run `/exclude off` to stop.' });
      return;
    }

    if (sub === 'off') {
      await firestore.setExcludeMode(issue.id, interaction.user.id, false);
      await interaction.editReply({ content: 'Your messages are no longer being excluded from Pokedex context.' });
      return;
    }

    if (sub === 'status') {
      const fresh = await firestore.getIssueById(issue.id);
      const excludedCount = Array.isArray(fresh?.excludedMessageIds) ? fresh.excludedMessageIds.length : 0;
      const excludedUsers = Array.isArray(fresh?.excludeModeUserIds) && fresh.excludeModeUserIds.length > 0
        ? fresh.excludeModeUserIds.map(id => `<@${id}>`).join(', ')
        : 'none';
      await interaction.editReply({
        content: `**Excluded messages:** ${excludedCount}\n**Exclude-mode users:** ${excludedUsers}`,
      });
      return;
    }

    if (sub === 'clear') {
      if (!isMod) {
        await interaction.editReply({ content: 'Only mods can clear exclusions.' });
        return;
      }
      await firestore.clearExclusions(issue.id);
      await interaction.editReply({ content: 'All exclusions cleared for this thread.' });
      return;
    }
  } catch (err) {
    console.error('exclude command failed:', err);
    if (interaction.deferred || interaction.replied) {
      await interaction.editReply({ content: 'Failed to update exclusions.' }).catch(() => {});
    } else {
      await interaction.reply({ content: 'Failed to update exclusions.', ephemeral: true }).catch(() => {});
    }
  }
}

module.exports = { data, execute, computeLastExclusions };
