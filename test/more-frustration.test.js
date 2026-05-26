'use strict';

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const { detectFrustration } = require('../src/services/frustration');

describe('detectFrustration — positive matches', () => {
  test('catches profanity', () => {
    assert.equal(detectFrustration('this is bullshit').frustrated, true);
    assert.equal(detectFrustration('damn it').frustrated, true);
  });

  test('catches "this is ridiculous"', () => {
    assert.equal(detectFrustration('this is ridiculous').frustrated, true);
  });

  test('catches "give me a human"', () => {
    assert.equal(detectFrustration('give me a human').frustrated, true);
    assert.equal(detectFrustration('I want a real person').frustrated, true);
  });

  test('catches "is this an AI"', () => {
    assert.equal(detectFrustration('is this an AI?').frustrated, true);
    assert.equal(detectFrustration('is this a bot').frustrated, true);
  });

  test('case-insensitive', () => {
    assert.equal(detectFrustration('THIS IS RIDICULOUS!!!').frustrated, true);
    assert.equal(detectFrustration('WtF is going on').frustrated, true);
  });

  test('catches multi-word all-caps shouting', () => {
    assert.equal(detectFrustration('WHY IS THIS BROKEN').frustrated, true);
    assert.equal(detectFrustration('PLEASE HELP NOW').frustrated, true);
  });
});

describe('detectFrustration — negative matches (no false positives)', () => {
  test('short all-caps tokens do NOT trip the shouting check', () => {
    assert.equal(detectFrustration('OK thanks').frustrated, false);
    assert.equal(detectFrustration('AI bug').frustrated, false);
    assert.equal(detectFrustration('WHY?').frustrated, false);
  });

  test('words containing trigger substrings but not the whole word do not match', () => {
    // \b ensures whole-word match
    assert.equal(detectFrustration('clarification').frustrated, false);
    assert.equal(detectFrustration('passing').frustrated, false);
  });

  test('polite messages are calm', () => {
    assert.equal(detectFrustration('Hi! Could you help me debug this?').frustrated, false);
    assert.equal(detectFrustration('I think there might be an issue here.').frustrated, false);
  });
});

describe('detectFrustration — defensive', () => {
  test('null / undefined / non-string returns calm', () => {
    assert.deepEqual(detectFrustration(null), { frustrated: false, signal: null });
    assert.deepEqual(detectFrustration(undefined), { frustrated: false, signal: null });
    assert.deepEqual(detectFrustration(42), { frustrated: false, signal: null });
    assert.deepEqual(detectFrustration({}), { frustrated: false, signal: null });
  });

  test('empty string returns calm', () => {
    assert.deepEqual(detectFrustration(''), { frustrated: false, signal: null });
  });

  test('result always includes signal name when frustrated', () => {
    const out = detectFrustration('this is ridiculous');
    assert.equal(out.frustrated, true);
    assert.ok(typeof out.signal === 'string' && out.signal.length > 0);
  });

  test('all-caps signal is labeled "all-caps"', () => {
    const out = detectFrustration('WHY IS THIS BROKEN');
    assert.equal(out.signal, 'all-caps');
  });
});
