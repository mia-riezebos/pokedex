const { PermissionFlagsBits } = require('discord.js');

// Best-effort role for a Discord message relative to an issue. Never throws.
function resolveAuthorRole(message, issue) {
  const authorId = message?.author?.id;
  if (message?.author?.bot) return 'BOT';

  const reporters = new Set([issue?.reporterId, ...(issue?.reporterIds || [])].filter(Boolean));
  if (authorId && reporters.has(authorId)) return 'OP';

  try {
    if (message?.member?.permissions?.has?.(PermissionFlagsBits.ManageMessages)) return 'MOD';
  } catch {
    // ignore — fall through to OTHER
  }
  return 'OTHER';
}

module.exports = { resolveAuthorRole };
