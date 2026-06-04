const { test } = require('node:test');
const assert = require('node:assert/strict');
const { planLockdown, planUnlock } = require('../src/services/lockdown');

test('planLockdown locks only open, non-excluded channels', () => {
  const channels = [
    { id: 'a', locked: false },
    { id: 'b', locked: true },   // already locked beforehand
    { id: 'c', locked: false },
    { id: 'd', locked: false },  // excluded
  ];
  const plan = planLockdown(channels, ['d']);
  assert.deepEqual(plan.toLock, ['a', 'c']);
  assert.deepEqual(plan.skipped, ['b']);
  assert.deepEqual(plan.excluded, ['d']);
});

test('planUnlock only touches recorded channels that still exist', () => {
  const recorded = ['a', 'c', 'z']; // z was deleted since
  const existing = ['a', 'b', 'c', 'd'];
  assert.deepEqual(planUnlock(recorded, existing), ['a', 'c']);
});

test('planUnlock handles empty record', () => {
  assert.deepEqual(planUnlock([], ['a']), []);
  assert.deepEqual(planUnlock(undefined, ['a']), []);
});
