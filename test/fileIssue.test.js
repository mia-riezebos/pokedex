const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const { buildFilePlan } = require('../src/services/contextEvaluator');

describe('buildFilePlan', () => {
  const baseFields = { expected: 'e', actual: 'a', feature: 'f', frequency: 'always' };

  test('single bug → one receipt, no children', () => {
    const plan = buildFilePlan({
      issue: { number: 10, summary: 'sync broken' },
      evaluation: { contextFields: baseFields, distinctBugs: [] },
    });
    assert.equal(plan.children.length, 0);
    assert.match(plan.receipt, /Filed as #10\./);
  });

  test('two distinct bugs → one child issue + receipt names both numbers', () => {
    const plan = buildFilePlan({
      issue: { number: 10, summary: 'first bug' },
      evaluation: {
        contextFields: baseFields,
        distinctBugs: [
          { summary: 'first bug', expected: 'e1', actual: 'a1', feature: 'f1', frequency: 'always' },
          { summary: 'second bug', expected: 'e2', actual: 'a2', feature: 'f2', frequency: 'sometimes' },
        ],
      },
    });
    assert.equal(plan.children.length, 1);
    assert.equal(plan.children[0].summary, 'second bug');
    assert.match(plan.receipt, /#10 and #11/);
  });
});
