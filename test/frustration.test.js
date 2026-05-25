const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const { detectFrustration } = require('../src/services/frustration');

describe('detectFrustration', () => {
  test('flags explicit frustration phrases', () => {
    for (const s of [
      'this is ridiculous',
      'Is this an AI? embarrassing',
      'I already told you that',
      'what a waste of my time',
      'just give me a human',
      'this bot is useless',
    ]) {
      assert.equal(detectFrustration(s).frustrated, true, `expected frustrated: ${s}`);
    }
  });

  test('flags all-caps shouting sentences', () => {
    assert.equal(detectFrustration('THIS DOES NOT WORK AT ALL').frustrated, true);
  });

  test('does not flag normal bug reports', () => {
    for (const s of [
      'My calendar sync stopped working yesterday',
      'It happens every time I send a message',
      'ok thanks',
    ]) {
      assert.equal(detectFrustration(s).frustrated, false, `expected calm: ${s}`);
    }
  });

  test('returns a signal label on match and null otherwise', () => {
    assert.equal(typeof detectFrustration('this is ridiculous').signal, 'string');
    assert.equal(detectFrustration('hello there').signal, null);
  });

  test('handles empty/nullish input', () => {
    assert.equal(detectFrustration('').frustrated, false);
    assert.equal(detectFrustration(null).frustrated, false);
  });
});
