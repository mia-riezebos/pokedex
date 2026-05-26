'use strict';

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const { backfillMissingIssueNumbers } = require('../src/services/issueNumberBackfill');

function makeApi({ docs, startCounter = 0, throwOn = {} } = {}) {
  const store = new Map(docs.map(d => [d.id, { ...d }]));
  let counter = startCounter;
  const log = { allocations: 0, sets: 0 };
  return {
    store,
    log,
    api: {
      async listOpenIssuesMissingNumbers() {
        return Array.from(store.values()).filter(
          d => d.status === 'open' && typeof d.number !== 'number',
        );
      },
      async allocateIssueNumber() {
        log.allocations += 1;
        if (throwOn.allocateAt && log.allocations === throwOn.allocateAt) {
          throw new Error('boom: allocate');
        }
        counter += 1;
        return counter;
      },
      async setIssueNumberIfMissing(id, number) {
        log.sets += 1;
        if (throwOn.setAt && log.sets === throwOn.setAt) {
          throw new Error('boom: set');
        }
        const doc = store.get(id);
        if (!doc) return false;
        if (typeof doc.number === 'number') return false;
        doc.number = number;
        return true;
      },
    },
  };
}

describe('backfillMissingIssueNumbers — idempotency and ordering', () => {
  test('second run is a no-op (every issue already has a number)', async () => {
    const { api, store } = makeApi({
      docs: [
        { id: 'a', status: 'open' },
        { id: 'b', status: 'open' },
      ],
      startCounter: 0,
    });
    const first = await backfillMissingIssueNumbers(api);
    assert.equal(first.assigned.length, 2);

    const second = await backfillMissingIssueNumbers(api);
    assert.deepEqual(second.assigned, []);
    assert.equal(second.skipped, 0);
    // store must still hold the original assignments
    assert.equal(store.get('a').number, 1);
    assert.equal(store.get('b').number, 2);
  });

  test('numbers are monotonic and unique across a large batch', async () => {
    const docs = Array.from({ length: 100 }, (_, i) => ({ id: `i${i}`, status: 'open' }));
    const { api } = makeApi({ docs, startCounter: 500 });

    const result = await backfillMissingIssueNumbers(api);
    assert.equal(result.assigned.length, 100);

    const numbers = result.assigned.map(a => a.number);
    const unique = new Set(numbers);
    assert.equal(unique.size, 100, 'all numbers must be unique');
    // monotonic
    for (let i = 1; i < numbers.length; i += 1) {
      assert.ok(numbers[i] > numbers[i - 1], `numbers must be strictly increasing (i=${i})`);
    }
    assert.equal(numbers[0], 501);
    assert.equal(numbers[99], 600);
  });

  test('skipped count is correct when some docs come back already-numbered', async () => {
    // Two docs in the candidate list still have `.number` set (race condition: another
    // process numbered them between list and loop). Backfill must skip them silently.
    const { api } = makeApi({
      docs: [
        { id: 'a', status: 'open' },                  // missing → assigned
        { id: 'b', status: 'open', number: 9 },       // would be filtered by list… but test the inner guard too
      ],
    });
    // Patch list to bypass its filter so we exercise the in-loop guard.
    api.listOpenIssuesMissingNumbers = async () => [
      { id: 'a', status: 'open' },
      { id: 'b', status: 'open', number: 9 },
    ];
    const result = await backfillMissingIssueNumbers(api);
    assert.equal(result.assigned.length, 1);
    assert.equal(result.assigned[0].issueId, 'a');
    assert.equal(result.skipped, 1, 'must report 1 skipped doc');
  });

  test('reports zero skipped when nothing in input', async () => {
    const { api } = makeApi({ docs: [] });
    const result = await backfillMissingIssueNumbers(api);
    assert.deepEqual(result, { assigned: [], skipped: 0 });
  });
});

describe('backfillMissingIssueNumbers — failure paths', () => {
  test('an error from setIssueNumber propagates and partial work is observable in api log', async () => {
    const { api, log } = makeApi({
      docs: [
        { id: 'a', status: 'open' },
        { id: 'b', status: 'open' },
        { id: 'c', status: 'open' },
      ],
      throwOn: { setAt: 2 }, // fail on the second setIssueNumber
    });

    await assert.rejects(
      () => backfillMissingIssueNumbers(api),
      /boom: set/,
    );
    // We allocated for 1, 2 successfully (set), then failed on 2 — but allocation already
    // happened for 'b'. Caller can re-run; counter advanced but doc 'b' did not get the number.
    assert.equal(log.allocations, 2, 'counter advanced for a and b');
    assert.equal(log.sets, 2, 'second set was attempted (and threw)');
  });

  test('an error from allocateIssueNumber propagates immediately', async () => {
    const { api } = makeApi({
      docs: [{ id: 'a', status: 'open' }],
      throwOn: { allocateAt: 1 },
    });
    await assert.rejects(
      () => backfillMissingIssueNumbers(api),
      /boom: allocate/,
    );
  });

  test('successive allocation calls happen sequentially (not in parallel)', async () => {
    // If we ever changed the loop to fire allocations in parallel by accident,
    // a fake api that returns the *current* counter could observe duplicate
    // numbers. This is a structural guard against that regression.
    let counter = 0;
    const inFlight = { current: 0, max: 0 };
    const docs = Array.from({ length: 10 }, (_, i) => ({ id: `i${i}`, status: 'open' }));
    const api = {
      async listOpenIssuesMissingNumbers() { return docs.map(d => ({ ...d })); },
      async allocateIssueNumber() {
        inFlight.current += 1;
        inFlight.max = Math.max(inFlight.max, inFlight.current);
        await new Promise(r => setImmediate(r));
        counter += 1;
        inFlight.current -= 1;
        return counter;
      },
      async setIssueNumberIfMissing() { return true; },
    };
    const result = await backfillMissingIssueNumbers(api);
    assert.equal(result.assigned.length, 10);
    assert.equal(inFlight.max, 1, 'allocations must be strictly sequential');
  });
});

describe('backfillMissingIssueNumbers — race-lost handling', () => {
  test('every doc races and loses → assigned is empty, all counted as skipped', async () => {
    const docs = Array.from({ length: 5 }, (_, i) => ({ id: `i${i}`, status: 'open' }));
    const { api } = makeApi({ docs });
    api.setIssueNumberIfMissing = async () => false;
    const result = await backfillMissingIssueNumbers(api);
    assert.deepEqual(result.assigned, []);
    assert.equal(result.skipped, 5, 'all 5 candidates were race-lost');
  });

  test('mixed: some race-lost, some successful', async () => {
    const docs = [
      { id: 'a', status: 'open' },
      { id: 'b', status: 'open' },
      { id: 'c', status: 'open' },
    ];
    const { api } = makeApi({ docs });
    // 'b' races and loses; 'a' and 'c' succeed.
    const realSet = api.setIssueNumberIfMissing;
    api.setIssueNumberIfMissing = async (id, n) => {
      if (id === 'b') return false;
      return realSet(id, n);
    };
    const result = await backfillMissingIssueNumbers(api);
    assert.equal(result.assigned.length, 2);
    assert.ok(result.assigned.every(a => a.issueId !== 'b'));
    assert.equal(result.skipped, 1, 'b is the one race-lost skip');
  });

  test('counter advances for race-lost docs (wasted allocations are acceptable)', async () => {
    const docs = [{ id: 'a', status: 'open' }, { id: 'b', status: 'open' }];
    const { api, log } = makeApi({ docs, startCounter: 0 });
    let setAttempts = 0;
    api.setIssueNumberIfMissing = async () => { setAttempts += 1; return false; };
    await backfillMissingIssueNumbers(api);
    assert.equal(log.allocations, 2, 'both candidates got an allocation even though both lost');
    assert.equal(setAttempts, 2, 'both candidates attempted the if-missing write');
  });
});
