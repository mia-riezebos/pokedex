const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const { backfillMissingIssueNumbers } = require('../src/services/issueNumberBackfill');

function makeFakeDb(initialDocs, initialCounter = 0) {
  const docs = new Map(initialDocs.map(d => [d.id, { ...d }]));
  let counter = initialCounter;
  return {
    docs,
    counter: () => counter,
    api: {
      async listOpenIssuesMissingNumbers() {
        return Array.from(docs.values()).filter(d => d.status === 'open' && typeof d.number !== 'number');
      },
      async allocateIssueNumber() {
        counter += 1;
        return counter;
      },
      async setIssueNumberIfMissing(id, number) {
        const doc = docs.get(id);
        if (!doc) return false;
        if (typeof doc.number === 'number') return false;
        doc.number = number;
        return true;
      },
    },
  };
}

describe('backfillMissingIssueNumbers', () => {
  test('assigns a number to every open issue without one', async () => {
    const { docs, api } = makeFakeDb([
      { id: 'a', status: 'open' },                  // missing
      { id: 'b', status: 'open', number: 5 },       // already numbered
      { id: 'c', status: 'open' },                  // missing
      { id: 'd', status: 'closed' },                // closed → skipped (won't show in feed)
    ], /* counter */ 100);

    const result = await backfillMissingIssueNumbers(api);

    assert.equal(result.assigned.length, 2);
    assert.equal(docs.get('a').number, 101);
    assert.equal(docs.get('c').number, 102);
    assert.equal(docs.get('b').number, 5, 'must not overwrite existing numbers');
  });

  test('returns the assigned mapping so caller can refresh embeds', async () => {
    const { api } = makeFakeDb([
      { id: 'x', status: 'open' },
    ], 200);
    const result = await backfillMissingIssueNumbers(api);
    assert.deepEqual(result.assigned, [{ issueId: 'x', number: 201 }]);
    assert.equal(result.skipped, 0);
  });

  test('returns empty assigned list when nothing needs backfill', async () => {
    const { api } = makeFakeDb([
      { id: 'x', status: 'open', number: 1 },
    ]);
    const result = await backfillMissingIssueNumbers(api);
    assert.deepEqual(result.assigned, []);
  });

  test('race-lost docs (setIssueNumberIfMissing returns false) are skipped, not assigned', async () => {
    // Simulate: list says doc 'a' is missing a number, but by the time we try
    // to set it, another writer has assigned one. The transactional helper
    // returns false; backfill must not include it in `assigned`.
    const { api } = makeFakeDb([{ id: 'a', status: 'open' }], 100);
    api.setIssueNumberIfMissing = async () => false; // always race-lost
    const result = await backfillMissingIssueNumbers(api);
    assert.deepEqual(result.assigned, []);
    assert.equal(result.skipped, 1);
  });
});
