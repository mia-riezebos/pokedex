const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const firestore = require('../services/firestore');
const { backfillMissingIssueNumbers } = require('../services/issueNumberBackfill');
const { refreshTriageEmbedForIssue } = require('../services/addContext');

const data = new SlashCommandBuilder()
  .setName('backfill-numbers')
  .setDescription('Assign ticket #s to open issues that don\'t have one yet (admin)')
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild);

async function execute(interaction) {
  await interaction.deferReply({ ephemeral: true });

  try {
    const api = {
      listOpenIssuesMissingNumbers: firestore.listOpenIssuesMissingNumbers,
      allocateIssueNumber: () => firestore.allocateIssueNumber(),
      setIssueNumberIfMissing: firestore.setIssueNumberIfMissing,
    };
    const { assigned } = await backfillMissingIssueNumbers(api);

    let refreshed = 0;
    let failedEdits = 0;
    for (const { issueId, number } of assigned) {
      try {
        const issue = await firestore.getIssueById(issueId);
        if (!issue) continue;
        // Use the shared helper so the edit prefers issue.triageChannelId and
        // the embed shape stays consistent with /addcontext.
        const ok = await refreshTriageEmbedForIssue(interaction.guild, { ...issue, number }, issueId);
        if (ok) refreshed += 1;
        else failedEdits += 1;
      } catch (err) {
        console.error(`backfill-numbers: refresh failed for ${issueId}:`, err.message);
        failedEdits += 1;
      }
    }

    const summary = assigned.length === 0
      ? 'Nothing to do — every open issue already has a ticket number.'
      : `Assigned ${assigned.length} ticket #${assigned.length === 1 ? '' : 's'}. Refreshed ${refreshed} triage embed${refreshed === 1 ? '' : 's'}${failedEdits ? ` (${failedEdits} could not be edited).` : '.'}`;

    await interaction.editReply({ content: summary });
  } catch (err) {
    console.error('backfill-numbers failed:', err);
    await interaction.editReply({ content: 'Backfill failed. Check logs.' }).catch(() => {});
  }
}

module.exports = { data, execute };
