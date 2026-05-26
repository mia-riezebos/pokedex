'use strict';

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const { buildReceipt, numberList, buildTurnCapNotice } = require('../src/services/receipt');

describe('numberList — list arity', () => {
  test('single number renders as "#N"', () => {
    assert.equal(numberList([1]), '#1');
  });

  test('two numbers join with " and "', () => {
    assert.equal(numberList([1, 2]), '#1 and #2');
  });

  test('three numbers use Oxford comma', () => {
    assert.equal(numberList([1, 2, 3]), '#1, #2, and #3');
  });

  test('four+ numbers use Oxford comma between every pair except last', () => {
    assert.equal(numberList([1, 2, 3, 4]), '#1, #2, #3, and #4');
    assert.equal(numberList([10, 20, 30, 40, 50]), '#10, #20, #30, #40, and #50');
  });

  test('empty array renders cleanly (no "undefined", no trailing comma)', () => {
    const out = numberList([]);
    assert.doesNotMatch(out, /undefined/);
    assert.doesNotMatch(out, /, and $/);
  });

  test('preserves large numbers and zero', () => {
    assert.equal(numberList([0]), '#0');
    assert.equal(numberList([999999]), '#999999');
  });
});

describe('buildReceipt — content shape', () => {
  test('all missing fields render as "(not provided)"', () => {
    const out = buildReceipt([7], {});
    assert.match(out, /- Issue: \(not provided\)/);
    assert.match(out, /- Expected: \(not provided\)/);
    assert.match(out, /- Actual: \(not provided\)/);
    assert.match(out, /- Scope: \(not provided\)/);
  });

  test('preserves multi-line / markdown content in fields', () => {
    const out = buildReceipt([1], {
      summary: 'Login broken',
      expected: 'Line 1\nLine 2',
      actual: '*emphasized* and `code`',
      scope: 'every login',
    });
    assert.match(out, /Line 1\nLine 2/);
    assert.match(out, /\*emphasized\* and `code`/);
  });

  test('contains the structured outro line', () => {
    const out = buildReceipt([1], {});
    assert.match(out, /Expected response: a human will follow up\./);
  });

  test('with empty numbers array does NOT produce "undefined" in output', () => {
    const out = buildReceipt([], { summary: 's' });
    assert.doesNotMatch(out, /undefined/, 'receipt must never leak "undefined" to users');
  });

  test('field with very long content is preserved verbatim (caller may truncate later)', () => {
    const huge = 'x'.repeat(5000);
    const out = buildReceipt([1], { summary: huge });
    assert.ok(out.includes(huge), 'receipt builder is not the place to truncate');
  });
});

describe('buildTurnCapNotice — invariants', () => {
  test('is deterministic', () => {
    assert.equal(buildTurnCapNotice(), buildTurnCapNotice());
  });

  test('mentions the right-click action too, not just the slash command', () => {
    const out = buildTurnCapNotice();
    assert.match(out, /Add to Pokedex context/);
  });

  test('does not exceed Discord\'s 2000-char message limit', () => {
    assert.ok(buildTurnCapNotice().length <= 2000);
  });
});
