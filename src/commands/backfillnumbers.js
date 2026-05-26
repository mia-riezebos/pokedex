const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const firestore = require('../services/firestore');
const { backfillMissingIssueNumbers } = require('../services/issueNumberBackfill');
const { buildIssueEmbed, findTriageChannel } = require('../services/triage');

const data = new SlashCommandBuilder()
  .setName('backfill-numbers')
  .setDescription('Assign ticket #s to open issues that don\'t have one yet (admin)')
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild);

async function refreshTriageEmbed(guild, issue, issueId) {
  if (!issue.triageMessageId) return false;
  const channel = findTriageChannel(guild, issue.target);
  if (!channel) return false;
  try {
    const msg = await channel.messages.fetch(issue.triageMessageId);
    const embed = buildIssueEmbed(issue, issueId);
    embed.setTimestamp();
    await msg.edit({ embeds: [embed] });
    return true;
  } catch {
    return false;
  }
}

async function execute(interaction) {
  await interaction.deferReply({ ephemeral: true });

  try {
    const api = {
      listOpenIssuesMissingNumbers: firestore.listOpenIssuesMissingNumbers,
      allocateIssueNumber: () => firestore.allocateIssueNumber(),
      setIssueNumber: firestore.setIssueNumber,
    };
    const { assigned } = await backfillMissingIssueNumbers(api);

    let refreshed = 0;
    let failedEdits = 0;
    for (const { issueId, number } of assigned) {
      try {
        const issue = await firestore.getIssueById(issueId);
        if (!issue) continue;
        const ok = await refreshTriageEmbed(interaction.guild, { ...issue, number }, issueId);
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
