const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const { normalizeEvaluation } = require('../src/services/openrouter');

describe('normalizeEvaluation', () => {
  test('preserves existing fields and shouldReply alias', () => {
    const e = normalizeEvaluation({ complete: true, responseMode: 'reply', reply: 'hi?' });
    assert.equal(e.complete, true);
    assert.equal(e.responseMode, 'reply');
    assert.equal(e.shouldReply, true);
  });

  test('defaults new fields safely', () => {
    const e = normalizeEvaluation({});
    assert.equal(e.askedQuestion, false);
    assert.equal(e.shouldFile, false);
    assert.deepEqual(e.contextFields, { expected: null, actual: null, feature: null, frequency: null });
    assert.deepEqual(e.distinctBugs, []);
    assert.equal(e.receipt, null);
  });

  test('passes through structured contextFields and distinctBugs', () => {
    const e = normalizeEvaluation({
      askedQuestion: true,
      shouldFile: true,
      contextFields: { expected: 'x', actual: 'y', feature: 'z', frequency: 'always' },
      distinctBugs: [{ summary: 'a' }, { summary: 'b' }],
      receipt: { issue: 'i', expected: 'e', actual: 'a', scope: 's', expectedResponse: 'soon' },
    });
    assert.equal(e.contextFields.frequency, 'always');
    assert.equal(e.distinctBugs.length, 2);
    assert.equal(e.receipt.scope, 's');
  });

  test('coerces invalid types to safe defaults', () => {
    const e = normalizeEvaluation({ contextFields: 'nope', distinctBugs: 'nope', responseMode: 'bogus' });
    assert.deepEqual(e.contextFields, { expected: null, actual: null, feature: null, frequency: null });
    assert.deepEqual(e.distinctBugs, []);
    assert.equal(e.responseMode, 'react');
  });
});
