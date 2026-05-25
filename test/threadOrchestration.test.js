'use strict';
const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const { runThreadDecision } = require('../src/triggers/thread');

function deps() {
  const calls = { incremented: 0, filed: 0, sent: [], reacted: 0, disclosed: 0 };
  return {
    calls,
    firestore: {
      incrementQuestionTurns: async () => { calls.incremented++; },
      setIdentityDisclosed: async () => { calls.disclosed++; },
    },
    fileIssue: async () => { calls.filed++; },
    send: async (c) => { calls.sent.push(c); },
    react: async () => { calls.reacted++; },
  };
}

describe('runThreadDecision', () => {
  test('OP ask under cap increments the turn and sends the reply', async () => {
    const d = deps();
    await runThreadDecision({
      role: 'OP', issue: { questionTurns: 0, identityDisclosed: true }, issueId: 'i1',
      frustration: { frustrated: false },
      evaluation: { responseMode: 'reply', reply: 'what feature?', askedQuestion: true, contextFields: {}, distinctBugs: [] },
      deps: d,
    });
    assert.equal(d.calls.incremented, 1);
    assert.equal(d.calls.sent.length, 1);
    assert.equal(d.calls.filed, 0);
  });

  test('frustrated OP files and does not increment', async () => {
    const d = deps();
    await runThreadDecision({
      role: 'OP', issue: { questionTurns: 0, identityDisclosed: true }, issueId: 'i1',
      frustration: { frustrated: true, signal: 'ridiculous' },
      evaluation: { responseMode: 'reply', reply: 'x', askedQuestion: true, contextFields: {}, distinctBugs: [] },
      deps: d,
    });
    assert.equal(d.calls.filed, 1);
    assert.equal(d.calls.incremented, 0);
  });

  test('non-OP message does nothing', async () => {
    const d = deps();
    await runThreadDecision({
      role: 'MOD', issue: { questionTurns: 0 }, issueId: 'i1',
      frustration: { frustrated: false },
      evaluation: { responseMode: 'reply', reply: 'x', askedQuestion: true, contextFields: {}, distinctBugs: [] },
      deps: d,
    });
    assert.equal(d.calls.sent.length, 0);
    assert.equal(d.calls.filed, 0);
    assert.equal(d.calls.incremented, 0);
  });

  test('file path discloses identity and posts receipt when not yet disclosed', async () => {
    const d = deps();
    d.fileSend = async (c) => { d.calls.sent.push(c); };
    await runThreadDecision({
      role: 'OP',
      issue: { questionTurns: 0, identityDisclosed: false },
      issueId: 'i1',
      frustration: { frustrated: true, signal: 'ridiculous' },
      evaluation: { responseMode: 'reply', reply: '', askedQuestion: false, contextFields: {}, distinctBugs: [] },
      deps: d,
    });
    assert.equal(d.calls.disclosed, 1, 'identityDisclosed flag set');
    assert.equal(d.calls.filed, 1, 'fileIssue invoked');
    // disclosure line was posted via fileSend before filing
    const { IDENTITY_DISCLOSURE } = require('../src/triggers/thread');
    assert.ok(d.calls.sent.some(s => String(s).includes("automated bot")), 'identity line sent');
  });
});
