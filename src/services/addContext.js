const { buildIssueEmbed, findTriageChannel } = require('./triage');

const MAX_LEN = 1024;

function normalizeAdditionalContextText(input) {
  if (input == null) return null;
  const trimmed = String(input).trim();
  if (trimmed.length === 0) return null;
  if (trimmed.length > MAX_LEN) return `${trimmed.slice(0, MAX_LEN - 1)}…`;
  return trimmed;
}

function buildTriageRefreshPayload(issue, issueId) {
  const embed = buildIssueEmbed(issue, issueId);
  embed.setTimestamp();
  return { embeds: [embed] };
}

async function refreshTriageEmbedForIssue(guild, issue, issueId) {
  if (!issue.triageMessageId) return false;
  const channel = findTriageChannel(guild, issue.target);
  if (!channel) return false;
  try {
    const msg = await channel.messages.fetch(issue.triageMessageId);
    await msg.edit(buildTriageRefreshPayload(issue, issueId));
    return true;
  } catch {
    return false;
  }
}

module.exports = {
  MAX_LEN,
  normalizeAdditionalContextText,
  buildTriageRefreshPayload,
  refreshTriageEmbedForIssue,
};
