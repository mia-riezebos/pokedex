const { test } = require('node:test');
const assert = require('node:assert/strict');
const { containsCryptoScam } = require('../src/services/automod');

const SCAMS = [
  '🎁 FREE NITRO for everyone, claim here!',
  'Claim your free crypto airdrop now!!!',
  'Double your bitcoin instantly — send 1 BTC get 2 back',
  'Connect your wallet to validate and receive tokens',
  'Elon Musk official BTC giveaway, claim fast',
  'check http://free-nitro.gift/claim',
];

const SAFE = [
  'I think crypto is a scam honestly',
  'did you see the bitcoin price today',
  'I use metamask for my side project',
  'free pizza in the lounge at noon',
  'lost my wallet at the mall, so annoying',
  'the eth network is slow right now',
  '',
];

test('flags known crypto-scam messages', () => {
  for (const s of SCAMS) {
    assert.ok(containsCryptoScam(s), `should flag: ${s}`);
  }
});

test('does not flag normal conversation', () => {
  for (const s of SAFE) {
    assert.equal(containsCryptoScam(s), null, `should not flag: ${s}`);
  }
});
