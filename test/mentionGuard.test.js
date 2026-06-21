const { test } = require('node:test');
const assert = require('node:assert/strict');
const { mentionsBotDirectly } = require('../src/triggers/mention');

const BOT = { id: 'bot1' };

// Faithful stand-in for discord.js MessageMentions.has(user, options): an explicit typed
// mention (parsedUsers) always counts; everyone/role/repliedUser only count when their
// ignore flag is false.
function fakeMessage({ parsed = false, everyone = false, role = false, repliedToBot = false } = {}) {
  return {
    mentions: {
      has(user, options) {
        if (parsed) return true;
        if (!options.ignoreEveryone && everyone) return true;
        if (!options.ignoreRoles && role) return true;
        if (!options.ignoreRepliedUser && repliedToBot && user.id === BOT.id) return true;
        return false;
      },
    },
  };
}

test('explicitly typed @bot ping counts as a mention', () => {
  assert.equal(mentionsBotDirectly(fakeMessage({ parsed: true }), BOT), true);
});

test('@everyone does not count', () => {
  assert.equal(mentionsBotDirectly(fakeMessage({ everyone: true }), BOT), false);
});

test('role ping does not count', () => {
  assert.equal(mentionsBotDirectly(fakeMessage({ role: true }), BOT), false);
});

test('merely replying to the bot (no typed @) does not count', () => {
  assert.equal(mentionsBotDirectly(fakeMessage({ repliedToBot: true }), BOT), false);
});

test('replying to the bot AND typing @bot still counts', () => {
  assert.equal(mentionsBotDirectly(fakeMessage({ repliedToBot: true, parsed: true }), BOT), true);
});
