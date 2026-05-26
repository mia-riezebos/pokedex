'use strict';

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const { decideThreadAction, MAX_QUESTION_TURNS, hasAllFields } = require('../src/services/threadDecision');

const baseEval = () => ({
  responseMode: 'reply',
  reply: 'q?',
  askedQuestion: true,
  shouldFile: false,
  contextFields: { expected: null, actual: null, feature: null, frequency: null },
  distinctBugs: [],
  resolved: false,
});

describe('decideThreadAction — precedence table', () => {
  // Order tested: filed > non-op > frustration > turn-cap > sufficient > shouldFile > ask/reply/react/silent
  const cases = [
    {
      name: 'filed beats every other signal',
      input: { role: 'OP', issue: { filedAt: 'x', questionTurns: 99 }, frustration: { frustrated: true }, evaluation: { ...baseEval(), shouldFile: true } },
      action: 'silent', reason: 'already-filed',
    },
    {
      name: 'non-op beats every other signal except filed',
      input: { role: 'MOD', issue: { questionTurns: 99 }, frustration: { frustrated: true }, evaluation: { ...baseEval(), shouldFile: true } },
      action: 'silent', reason: 'non-op',
    },
    {
      name: 'frustration beats turn-cap',
      input: { role: 'OP', issue: { questionTurns: MAX_QUESTION_TURNS }, frustration: { frustrated: true }, evaluation: baseEval() },
      action: 'file', reason: 'frustration',
    },
    {
      name: 'turn-cap beats sufficiency',
      input: {
        role: 'OP',
        issue: { questionTurns: MAX_QUESTION_TURNS },
        frustration: { frustrated: false },
        evaluation: { ...baseEval(), contextFields: { expected: 'a', actual: 'b', feature: 'c', frequency: 'd' } },
      },
      action: 'file', reason: 'turn-cap',
    },
    {
      name: 'sufficiency beats shouldFile',
      input: {
        role: 'OP',
        issue: { questionTurns: 0 },
        frustration: { frustrated: false },
        evaluation: { ...baseEval(), shouldFile: true, contextFields: { expected: 'a', actual: 'b', feature: 'c', frequency: 'd' } },
      },
      action: 'file', reason: 'sufficient',
    },
    {
      name: 'shouldFile beats ask',
      input: {
        role: 'OP',
        issue: { questionTurns: 0 },
        frustration: { frustrated: false },
        evaluation: { ...baseEval(), shouldFile: true, askedQuestion: true, responseMode: 'reply' },
      },
      action: 'file', reason: 'model',
    },
    {
      name: 'ask is the default when responseMode=reply and a question was asked',
      input: {
        role: 'OP',
        issue: { questionTurns: 1 },
        frustration: { frustrated: false },
        evaluation: { ...baseEval(), askedQuestion: true, responseMode: 'reply' },
      },
      action: 'ask',
    },
    {
      name: 'react when responseMode=react',
      input: {
        role: 'OP',
        issue: { questionTurns: 0 },
        frustration: { frustrated: false },
        evaluation: { ...baseEval(), askedQuestion: false, responseMode: 'react' },
      },
      action: 'react',
    },
    {
      name: 'reply when responseMode=reply but no question was asked',
      input: {
        role: 'OP',
        issue: { questionTurns: 0 },
        frustration: { frustrated: false },
        evaluation: { ...baseEval(), askedQuestion: false, responseMode: 'reply', reply: 'noted' },
      },
      action: 'reply',
    },
    {
      name: 'silent when responseMode=ignore (or anything unhandled)',
      input: {
        role: 'OP',
        issue: { questionTurns: 0 },
        frustration: { frustrated: false },
        evaluation: { ...baseEval(), askedQuestion: false, responseMode: 'ignore' },
      },
      action: 'silent', reason: 'ignore',
    },
  ];

  for (const c of cases) {
    test(c.name, () => {
      const out = decideThreadAction(c.input);
      assert.equal(out.action, c.action, `expected action=${c.action}, got ${out.action}`);
      if (c.reason) assert.equal(out.reason, c.reason, `expected reason=${c.reason}, got ${out.reason}`);
    });
  }
});

describe('decideThreadAction — boundary on the question cap', () => {
  test('questionTurns at MAX-1 still asks', () => {
    const out = decideThreadAction({
      role: 'OP',
      issue: { questionTurns: MAX_QUESTION_TURNS - 1 },
      frustration: { frustrated: false },
      evaluation: baseEval(),
    });
    assert.equal(out.action, 'ask');
    assert.equal(out.incrementTurn, true);
  });

  test('questionTurns at exactly MAX flips to file with turn-cap', () => {
    const out = decideThreadAction({
      role: 'OP',
      issue: { questionTurns: MAX_QUESTION_TURNS },
      frustration: { frustrated: false },
      evaluation: baseEval(),
    });
    assert.equal(out.action, 'file');
    assert.equal(out.reason, 'turn-cap');
  });

  test('missing questionTurns is treated as 0 (does not cap immediately)', () => {
    const out = decideThreadAction({
      role: 'OP',
      issue: {}, // no questionTurns at all
      frustration: { frustrated: false },
      evaluation: baseEval(),
    });
    assert.equal(out.action, 'ask');
  });
});

describe('hasAllFields', () => {
  test('returns false when no field is set', () => {
    assert.equal(hasAllFields({}), false);
    assert.equal(hasAllFields(undefined), false);
  });

  test('returns false when even one field is missing', () => {
    assert.equal(hasAllFields({ expected: 'a', actual: 'b', feature: 'c' }), false);
  });

  test('returns true only when ALL four are non-empty strings', () => {
    assert.equal(hasAllFields({ expected: 'a', actual: 'b', feature: 'c', frequency: 'd' }), true);
  });

  test('treats empty strings as missing (falsy check)', () => {
    assert.equal(hasAllFields({ expected: '', actual: 'b', feature: 'c', frequency: 'd' }), false);
  });
});
