'use strict';

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const { runThreadDecision, IDENTITY_DISCLOSURE } = require('../src/triggers/thread');
const { MAX_QUESTION_TURNS } = require('../src/services/threadDecision');

function deps({ withFileSend = true } = {}) {
  const calls = { incremented: 0, filed: 0, disclosed: 0, sent: [], fileSent: [], reacted: 0 };
  const d = {
    calls,
    firestore: {
      incrementQuestionTurns: async () => { calls.incremented += 1; },
      setIdentityDisclosed: async () => { calls.disclosed += 1; },
    },
    fileIssue: async () => { calls.filed += 1; },
    send: async (c) => { calls.sent.push(c); },
    react: async () => { calls.reacted += 1; },
  };
  if (withFileSend) d.fileSend = async (c) => { calls.fileSent.push(c); };
  return d;
}

const emptyEval = { responseMode: 'reply', reply: '', askedQuestion: false, contextFields: {}, distinctBugs: [] };

describe('runThreadDecision — turn-cap message ordering', () => {
  test('identity-not-disclosed: identity line is sent BEFORE the turn-cap notice', async () => {
    const d = deps();
    await runThreadDecision({
      role: 'OP',
      issue: { questionTurns: MAX_QUESTION_TURNS, identityDisclosed: false },
      issueId: 'i1',
      frustration: { frustrated: false },
      evaluation: emptyEval,
      deps: d,
    });
    assert.equal(d.calls.disclosed, 1);
    assert.equal(d.calls.fileSent.length, 2, 'expected exactly 2 messages on fileSend');
    assert.equal(d.calls.fileSent[0], IDENTITY_DISCLOSURE, 'identity line must be first');
    assert.match(d.calls.fileSent[1], /\/addcontext/, 'second message is the turn-cap notice');
    assert.equal(d.calls.filed, 1);
  });

  test('identity-already-disclosed: only the turn-cap notice is sent', async () => {
    const d = deps();
    await runThreadDecision({
      role: 'OP',
      issue: { questionTurns: MAX_QUESTION_TURNS, identityDisclosed: true },
      issueId: 'i1',
      frustration: { frustrated: false },
      evaluation: emptyEval,
      deps: d,
    });
    assert.equal(d.calls.disclosed, 0, 'must not re-set identity disclosure');
    assert.equal(d.calls.fileSent.length, 1, 'only the turn-cap notice');
    assert.match(d.calls.fileSent[0], /\/addcontext/);
  });

  test('turn-cap notice falls back to deps.send when fileSend is not provided', async () => {
    const d = deps({ withFileSend: false });
    await runThreadDecision({
      role: 'OP',
      issue: { questionTurns: MAX_QUESTION_TURNS, identityDisclosed: true },
      issueId: 'i1',
      frustration: { frustrated: false },
      evaluation: emptyEval,
      deps: d,
    });
    // No fileSend → notice should go through `send`
    assert.equal(d.calls.sent.length, 1);
    assert.match(d.calls.sent[0], /\/addcontext/);
    assert.equal(d.calls.filed, 1);
  });
});

describe('runThreadDecision — turn-cap NOT sent on other file reasons', () => {
  test('frustration filing → identity disclosure but NO turn-cap notice', async () => {
    const d = deps();
    await runThreadDecision({
      role: 'OP',
      issue: { questionTurns: 0, identityDisclosed: false },
      issueId: 'i1',
      frustration: { frustrated: true, signal: 'wtf' },
      evaluation: emptyEval,
      deps: d,
    });
    assert.equal(d.calls.fileSent.length, 1, 'only identity line, no turn-cap notice');
    assert.equal(d.calls.fileSent[0], IDENTITY_DISCLOSURE);
    assert.ok(!d.calls.fileSent.some(m => /\/addcontext/.test(m)), 'no /addcontext mention on frustration path');
  });

  test('sufficient-info filing → no turn-cap notice', async () => {
    const d = deps();
    await runThreadDecision({
      role: 'OP',
      issue: { questionTurns: 1, identityDisclosed: true },
      issueId: 'i1',
      frustration: { frustrated: false },
      evaluation: {
        ...emptyEval,
        contextFields: { expected: 'a', actual: 'b', feature: 'c', frequency: 'd' },
      },
      deps: d,
    });
    assert.equal(d.calls.fileSent.length, 0, 'sufficient path posts nothing extra');
    assert.equal(d.calls.filed, 1);
  });

  test('model shouldFile → no turn-cap notice', async () => {
    const d = deps();
    await runThreadDecision({
      role: 'OP',
      issue: { questionTurns: 0, identityDisclosed: true },
      issueId: 'i1',
      frustration: { frustrated: false },
      evaluation: { ...emptyEval, shouldFile: true },
      deps: d,
    });
    assert.equal(d.calls.fileSent.length, 0);
    assert.equal(d.calls.filed, 1);
  });
});

describe('runThreadDecision — precedence and edge cases', () => {
  test('frustration beats turn-cap when both are true', async () => {
    // questionTurns is at the cap AND user is frustrated. decideThreadAction
    // prioritises frustration. Confirm the turn-cap notice does NOT fire.
    const d = deps();
    await runThreadDecision({
      role: 'OP',
      issue: { questionTurns: MAX_QUESTION_TURNS, identityDisclosed: true },
      issueId: 'i1',
      frustration: { frustrated: true, signal: 'ridiculous' },
      evaluation: emptyEval,
      deps: d,
    });
    assert.equal(d.calls.filed, 1);
    assert.equal(d.calls.fileSent.length, 0, 'frustration path → no turn-cap notice');
  });

  test('already filed → silent (no notices, no fileIssue call)', async () => {
    const d = deps();
    const result = await runThreadDecision({
      role: 'OP',
      issue: { questionTurns: MAX_QUESTION_TURNS, identityDisclosed: true, filedAt: '2026-05-25T00:00:00Z' },
      issueId: 'i1',
      frustration: { frustrated: false },
      evaluation: emptyEval,
      deps: d,
    });
    assert.equal(result.action, 'silent');
    assert.equal(d.calls.filed, 0);
    assert.equal(d.calls.fileSent.length, 0);
    assert.equal(d.calls.sent.length, 0);
  });

  test('non-OP at turn cap → silent (no notice spammed at bystanders)', async () => {
    const d = deps();
    await runThreadDecision({
      role: 'MOD',
      issue: { questionTurns: MAX_QUESTION_TURNS, identityDisclosed: true },
      issueId: 'i1',
      frustration: { frustrated: false },
      evaluation: emptyEval,
      deps: d,
    });
    assert.equal(d.calls.filed, 0);
    assert.equal(d.calls.fileSent.length, 0);
    assert.equal(d.calls.sent.length, 0);
  });

  test('fileIssue still runs even when neither sender is configured', async () => {
    const d = deps({ withFileSend: false });
    d.send = undefined;
    await runThreadDecision({
      role: 'OP',
      issue: { questionTurns: MAX_QUESTION_TURNS, identityDisclosed: true },
      issueId: 'i1',
      frustration: { frustrated: false },
      evaluation: emptyEval,
      deps: d,
    });
    // No sender → notice silently dropped, but fileIssue still called.
    assert.equal(d.calls.filed, 1);
    assert.equal(d.calls.fileSent.length, 0);
    assert.equal(d.calls.sent.length, 0);
  });
});
