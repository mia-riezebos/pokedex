const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const { allocateIssueNumber } = require('../src/services/firestore');

// Fake Firestore exposing just runTransaction + a counters doc.
function fakeDb(start) {
  let value = start; // undefined => counter doc absent
  const docRef = { __id: 'counters/issues' };
  return {
    _value: () => value,
    collection: () => ({ doc: () => docRef }),
    runTransaction: async (fn) => fn({
      get: async () => ({ exists: value !== undefined, data: () => ({ next: value }) }),
      set: async (_ref, data) => { value = data.next; },
    }),
  };
}

describe('allocateIssueNumber', () => {
  test('starts at 1 when counter is absent', async () => {
    const db = fakeDb(undefined);
    assert.equal(await allocateIssueNumber(db), 1);
    assert.equal(db._value(), 1);
  });
  test('increments monotonically', async () => {
    const db = fakeDb(7);
    assert.equal(await allocateIssueNumber(db), 8);
    assert.equal(await allocateIssueNumber(db), 9);
  });
});
