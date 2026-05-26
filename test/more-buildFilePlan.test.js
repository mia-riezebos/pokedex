'use strict';

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const { buildFilePlan } = require('../src/services/contextEvaluator');

describe('buildFilePlan — children and numbers', () => {
  test('zero distinct bugs → no children, receipt uses primary number', () => {
    const plan = buildFilePlan({
      issue: { id: 'p', number: 100, summary: 'primary' },
      evaluation: { distinctBugs: [], contextFields: {} },
    });
    assert.equal(plan.children.length, 0);
    assert.deepEqual(plan.numbers, [100]);
    assert.match(plan.receipt, /Filed as #100\./);
  });

  test('one distinct bug → still no children (slice(1) is empty)', () => {
    const plan = buildFilePlan({
      issue: { id: 'p', number: 100, summary: 'primary' },
      evaluation: { distinctBugs: [{ summary: 'same bug' }], contextFields: {} },
    });
    assert.equal(plan.children.length, 0);
    assert.deepEqual(plan.numbers, [100]);
  });

  test('three distinct bugs → 2 children with placeholder numbers', () => {
    const plan = buildFilePlan({
      issue: { id: 'p', number: 100, summary: 'a' },
      evaluation: {
        distinctBugs: [
          { summary: 'a' },
          { summary: 'b', expected: 'e2', actual: 'a2', feature: 'f', frequency: 'q' },
          { summary: 'c' },
        ],
        contextFields: {},
      },
    });
    assert.equal(plan.children.length, 2);
    assert.deepEqual(plan.numbers, [100, 101, 102]);
    assert.match(plan.receipt, /#100, #101, and #102/);
    // Child carries its context fields.
    assert.deepEqual(plan.children[0].contextFields, {
      expected: 'e2', actual: 'a2', feature: 'f', frequency: 'q',
    });
    // Missing fields normalise to null.
    assert.deepEqual(plan.children[1].contextFields, {
      expected: null, actual: null, feature: null, frequency: null,
    });
  });

  test('distinctBugs missing / null / non-array is treated as empty', () => {
    for (const distinctBugs of [undefined, null, 'oops', {}, 123]) {
      const plan = buildFilePlan({
        issue: { id: 'p', number: 1, summary: 's' },
        evaluation: { distinctBugs, contextFields: {} },
      });
      assert.equal(plan.children.length, 0, `expected 0 children for ${JSON.stringify(distinctBugs)}`);
    }
  });

  test('children inherit reporter/target metadata from the primary', () => {
    const plan = buildFilePlan({
      issue: {
        id: 'p', number: 1, summary: 'a',
        reporterId: 'u1', reporterName: 'alice', target: 'pokedex_bot',
      },
      evaluation: { distinctBugs: [{ summary: 'a' }, { summary: 'b' }], contextFields: {} },
    });
    assert.equal(plan.children[0].reporterId, 'u1');
    assert.equal(plan.children[0].reporterName, 'alice');
    assert.equal(plan.children[0].target, 'pokedex_bot');
    assert.equal(plan.children[0].splitFromIssueId, 'p');
    assert.equal(plan.children[0].contextComplete, true);
  });
});

describe('buildFilePlan — receipt fields', () => {
  test('scope concatenates frequency / feature when both present', () => {
    const plan = buildFilePlan({
      issue: { id: 'p', number: 1, summary: 's' },
      evaluation: {
        distinctBugs: [],
        contextFields: { frequency: 'always', feature: 'login' },
      },
    });
    assert.equal(plan.fields.scope, 'always / login');
  });

  test('scope drops empty halves cleanly', () => {
    const plan = buildFilePlan({
      issue: { id: 'p', number: 1, summary: 's' },
      evaluation: { distinctBugs: [], contextFields: { feature: 'login' } },
    });
    assert.equal(plan.fields.scope, 'login');
  });

  test('summary falls back to first distinctBug summary when issue has none', () => {
    const plan = buildFilePlan({
      issue: { id: 'p', number: 1 }, // no summary
      evaluation: {
        distinctBugs: [{ summary: 'fallback summary' }],
        contextFields: {},
      },
    });
    assert.equal(plan.fields.summary, 'fallback summary');
  });
});

describe('buildFilePlan — degenerate inputs', () => {
  test('issue with no number → numbers filtered to []; receipt uses [primaryNumber] fallback', () => {
    // Per impl: filter(n => typeof n === 'number'); if empty, buildReceipt uses [primaryNumber]
    // which is undefined → "Filed as #undefined." Document this corner.
    const plan = buildFilePlan({
      issue: { id: 'p' }, // no number
      evaluation: { distinctBugs: [], contextFields: {} },
    });
    assert.deepEqual(plan.numbers, []);
    // The fallback path passes [primaryNumber=undefined] to numberList → "#undefined".
    // This is the documented corner today; flagged so a future fix doesn't break silently.
    assert.match(plan.receipt, /Filed as #/);
  });
});
