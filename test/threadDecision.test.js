const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const { decideThreadAction, MAX_QUESTION_TURNS } = require('../src/services/threadDecision');

const baseEval = {
  responseMode: 'reply', reply: 'what feature?', askedQuestion: true, shouldFile: false,
  contextFields: { expected: null, actual: null, feature: null, frequency: null },
  distinctBugs: [], resolved: false,
};

describe('decideThreadAction', () => {
  test('non-OP message → silent (no ask, no file)', () => {
    const out = decideThreadAction({ role: 'MOD', issue: {}, frustration: { frustrated: false }, evaluation: baseEval });
    assert.equal(out.action, 'silent');
  });

  test('OP frustrated → file regardless of evaluation', () => {
    const out = decideThreadAction({ role: 'OP', issue: { questionTurns: 0 }, frustration: { frustrated: true, signal: 'ridiculous' }, evaluation: baseEval });
    assert.equal(out.action, 'file');
    assert.equal(out.reason, 'frustration');
  });

  test('OP at turn cap → file instead of asking', () => {
    const out = decideThreadAction({ role: 'OP', issue: { questionTurns: MAX_QUESTION_TURNS }, frustration: { frustrated: false }, evaluation: baseEval });
    assert.equal(out.action, 'file');
    assert.equal(out.reason, 'turn-cap');
  });

  test('OP with all contextFields → file (sufficiency)', () => {
    const ev = { ...baseEval, contextFields: { expected: 'a', actual: 'b', feature: 'c', frequency: 'd' } };
    const out = decideThreadAction({ role: 'OP', issue: { questionTurns: 1 }, frustration: { frustrated: false }, evaluation: ev });
    assert.equal(out.action, 'file');
    assert.equal(out.reason, 'sufficient');
  });

  test('OP under cap, info missing, model asks → ask (increments turn)', () => {
    const out = decideThreadAction({ role: 'OP', issue: { questionTurns: 1 }, frustration: { frustrated: false }, evaluation: baseEval });
    assert.equal(out.action, 'ask');
    assert.equal(out.incrementTurn, true);
  });

  test('already filed → silent (idempotent)', () => {
    const out = decideThreadAction({ role: 'OP', issue: { filedAt: 'x', questionTurns: 0 }, frustration: { frustrated: true }, evaluation: baseEval });
    assert.equal(out.action, 'silent');
  });

  test('model shouldFile → file', () => {
    const ev = { ...baseEval, shouldFile: true, askedQuestion: false };
    const out = decideThreadAction({ role: 'OP', issue: { questionTurns: 0 }, frustration: { frustrated: false }, evaluation: ev });
    assert.equal(out.action, 'file');
  });

  test('react/ignore evaluation passes through for OP', () => {
    const ev = { ...baseEval, responseMode: 'react', askedQuestion: false };
    const out = decideThreadAction({ role: 'OP', issue: { questionTurns: 0 }, frustration: { frustrated: false }, evaluation: ev });
    assert.equal(out.action, 'react');
  });
});
