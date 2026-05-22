const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const { computeLastExclusions } = require('../src/commands/exclude');

describe('computeLastExclusions', () => {
  const msgs = [
    { id: '1', authorId: 'op1' },
    { id: '2', authorId: 'mod1' },
    { id: '3', authorId: 'op1' },
    { id: '4', authorId: 'mod1' },
  ];
  test('mod excludes last N across all authors', () => {
    assert.deepEqual(computeLastExclusions(msgs, 2, { isMod: true, runnerId: 'mod1' }), ['3', '4']);
  });
  test('OP can only exclude their own among the last N', () => {
    assert.deepEqual(computeLastExclusions(msgs, 3, { isMod: false, runnerId: 'op1' }), ['3']);
  });
});
