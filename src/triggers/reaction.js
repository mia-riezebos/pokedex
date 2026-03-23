const { enqueue } = require('../services/queue');
const { processIssue } = require('../services/pipeline');
const { getConfig } = require('../config/config');

async function handleReaction(reaction, user) {
  // Ignore bot reactions
  if (user.bot) return;

  // Check if the emoji matches the configured trigger
  const triggerEmoji = getConfig('emoji_trigger');
  if (reaction.emoji.name !== triggerEmoji) return;

  // Fetch partial message if needed (reactions on uncached messages arrive as partials)
  if (reaction.partial) {
    try {
      await reaction.fetch();
    } catch {
      console.error('Failed to fetch partial reaction');
      return;
    }
  }

  const message = reaction.message;
  if (message.partial) {
    try {
      await message.fetch();
    } catch {
      console.error('Failed to fetch partial message');
      return;
    }
  }

  const text = message.content?.trim();
  if (!text) {
    // Per spec: reply when message has no understandable content
    try {
      await message.reply("I couldn't understand an issue from that message.");
    } catch {
      // Best effort — may not have permission to reply
    }
    return;
  }

  enqueue(() => processIssue(message, text));
}

module.exports = { handleReaction };