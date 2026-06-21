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
  // evasion: newline-split keywords (normalized to spaces)
  'giveaway\nbtc free',
  'free\nnitro for everyone',
  'Elon Musk\ngiveaway happening now',
  // evasion: zero-width chars inside keywords
  'f​ree nitro for everyone',
  // memecoin tickers
  '$PEPE airdrop live, claim now',
  'DOGE giveaway, free for holders',
  '$SHIB giveaway claim your tokens',
  // "send X get Y back" without the word "double"
  'first 100 people to send 0.1 BTC get 0.2 back guaranteed',
  'send 1 ETH receive 2 ETH instantly',
  // phishing with an action verb
  'enter your seed phrase to verify and unlock rewards',
];

const SAFE = [
  'I think crypto is a scam honestly',
  'did you see the bitcoin price today',
  'I use metamask for my side project',
  'free pizza in the lounge at noon',
  'lost my wallet at the mall, so annoying',
  'the eth network is slow right now',
  '',
  // security advice / dev talk must NOT be flagged
  'Never share your seed phrase with anyone',
  'How do I import a private key into MetaMask?',
  'Click Connect Wallet to get started with the dApp',
  'Our app is not free. Nitro users get priority support',
  'our API has a free tier - nitro users get extra calls',
  'send me a DM and get back to me within twice the time',
  'I will give away my old GPU in the hardware channel',
  // warnings ABOUT scams must not be auto-removed
  'Watch out for airdrop scams targeting ETH holders this week',
  'PSA: that BTC giveaway DM is a phishing scam, do not click',
  'heads up, fake Elon giveaway going around — report it',
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
