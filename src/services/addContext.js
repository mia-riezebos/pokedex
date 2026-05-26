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

// Prefer the channel that actually holds the message (issue.triageChannelId)
// over the configured triage channel. Configured channels can change between
// posting and editing, and `pokedex_bot` issues may have used the eng-triage
// fallback — in either case findTriageChannel would point at the wrong place
// and the edit would silently fail.
async function resolveTriageChannel(guild, issue) {
  const stored = issue.triageChannelId
    ? guild?.channels?.cache?.get?.(issue.triageChannelId)
    : null;
  if (stored && stored.isTextBased?.()) return stored;
  return findTriageChannel(guild, issue.target);
}

async function refreshTriageEmbedForIssue(guild, issue, issueId) {
  if (!issue.triageMessageId) return false;
  const channel = await resolveTriageChannel(guild, issue);
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
  resolveTriageChannel,
};
