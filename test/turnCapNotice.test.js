const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const { buildTurnCapNotice } = require('../src/services/receipt');

describe('buildTurnCapNotice', () => {
  test('says context gathering is done and points to /addcontext', () => {
    const out = buildTurnCapNotice();
    assert.match(out, /context|asking|questions/i);
    assert.match(out, /\/addcontext/);
  });

  test('mentions the thread is the place to add more later', () => {
    const out = buildTurnCapNotice();
    assert.match(out, /thread|here|this thread/i);
  });
});
