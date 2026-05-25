const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const { buildReceipt } = require('../src/services/receipt');

describe('buildReceipt', () => {
  const fields = {
    summary: 'Calendar events not syncing',
    expected: 'New Google Calendar events appear in Poke',
    actual: 'Events created today never show up',
    scope: 'Every event since this morning; only Google Calendar',
  };

  test('renders the fixed template with the ticket number', () => {
    const out = buildReceipt([1234], fields);
    assert.match(out, /Filed as #1234\./);
    assert.match(out, /- Issue: Calendar events not syncing/);
    assert.match(out, /- Expected: New Google Calendar events appear in Poke/);
    assert.match(out, /- Actual: Events created today never show up/);
    assert.match(out, /- Scope: Every event since this morning/);
    assert.match(out, /Expected response:/);
  });

  test('lists multiple ticket numbers when a report is split', () => {
    const out = buildReceipt([1234, 1235], fields);
    assert.match(out, /#1234 and #1235/);
  });

  test('uses a placeholder for missing fields', () => {
    const out = buildReceipt([1], { summary: 's' });
    assert.match(out, /- Expected: \(not provided\)/);
  });
});
