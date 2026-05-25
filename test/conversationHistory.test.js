const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const { buildConversationHistory, buildTranscript } = require('../src/services/contextEvaluator');

function m({ id, authorId, username, bot = false, content }) {
  return {
    id,
    author: { id: authorId, username, bot },
    content,
    attachments: { values: () => [][Symbol.iterator]() },
    createdAt: new Date('2026-05-21T00:00:00Z'),
    member: { permissions: { has: () => false } },
  };
}

describe('buildConversationHistory + buildTranscript', () => {
  const issue = { reporterId: 'op1', excludedMessageIds: ['x9'], excludeModeUserIds: ['mute1'] };
  const messages = [
    m({ id: '1', authorId: 'op1', username: 'op', content: 'calendar broken' }),
    m({ id: '2', authorId: 'mod1', username: 'mod', content: 'have you tried X' }),
    m({ id: 'x9', authorId: 'op1', username: 'op', content: 'excluded line' }),
    m({ id: '3', authorId: 'mute1', username: 'muted', content: 'side chatter' }),
    m({ id: '4', authorId: 'bot', username: 'pokedex', bot: true, content: 'a question?' }),
  ];

  test('tags roles and drops excluded messages/users', () => {
    const hist = buildConversationHistory(messages, issue);
    const ids = hist.map(h => h.id);
    assert.deepEqual(ids, ['1', '2', '4']); // x9 excluded by id, mute1 by user
    assert.equal(hist.find(h => h.id === '1').role, 'OP');
    assert.equal(hist.find(h => h.id === '2').role, 'OTHER'); // no ManageMessages here
    assert.equal(hist.find(h => h.id === '4').role, 'BOT');
  });

  test('transcript prints role tags', () => {
    const hist = buildConversationHistory(messages, issue);
    const t = buildTranscript(hist);
    assert.match(t, /\[OP\] calendar broken/);
    assert.match(t, /\[BOT\] a question\?/);
    assert.ok(!t.includes('excluded line'));
  });

  test('back-compat: works with no issue arg (nothing excluded)', () => {
    const hist = buildConversationHistory(messages);
    assert.equal(hist.length, 5);
  });

  test('buildTranscript falls back to BOT/OTHER when role is absent', () => {
    const t = buildTranscript([
      { isBot: true, content: 'bot line' },
      { isBot: false, content: 'human line' },
    ]);
    assert.match(t, /\[BOT\] bot line/);
    assert.match(t, /\[OTHER\] human line/);
  });
});
