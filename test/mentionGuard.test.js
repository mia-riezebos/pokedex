const { test } = require('node:test');
const assert = require('node:assert/strict');
const { mentionsBotDirectly } = require('../src/triggers/mention');

function fakeMessage(directHit) {
  return {
    mentions: {
      has(user, options) {
        assert.equal(options.ignoreEveryone, true);
        assert.equal(options.ignoreRoles, true);
        return directHit;
      },
    },
  };
}

const BOT = { id: 'bot1' };

test('direct @bot ping counts as a mention', () => {
  assert.equal(mentionsBotDirectly(fakeMessage(true), BOT), true);
});

test('@everyone / role ping does not count', () => {
  assert.equal(mentionsBotDirectly(fakeMessage(false), BOT), false);
});
