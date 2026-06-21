const { test } = require('node:test');
const assert = require('node:assert/strict');
const { containsCryptoScam } = require('../src/services/automod');

// Hard edge-case suite for containsCryptoScam. Focus areas:
//  - unicode / zero-width / fullwidth / whitespace evasion
//  - case variations
//  - scam-warning PSAs that must NOT be flagged
//  - legit security advice that must NOT be flagged
//  - borderline giveaway / wallet-drainer phrasing
//  - bypass attempts where a scammer sprinkles "warning" vocabulary
//
// Tests marked `// BUG:` document REAL defects: either a scam that slips
// through or a false positive on benign text.

// ---------------------------------------------------------------------------
// Evasion that SHOULD still be caught (these all pass — guards work well)
// ---------------------------------------------------------------------------

test('catches fullwidth-unicode "FREE NITRO" evasion', () => {
  assert.ok(containsCryptoScam('ＦＲＥＥ ＮＩＴＲＯ for everyone'),
    'fullwidth chars should normalize to ASCII and match');
});

test('catches zero-width chars buried inside "double" and "btc"', () => {
  assert.ok(containsCryptoScam('do​uble your bitcoin now'));
  assert.ok(containsCryptoScam('send 1 b​tc get 2 back'));
});

test('catches all-caps scam', () => {
  assert.ok(containsCryptoScam('DOUBLE YOUR BITCOIN — SEND 1 BTC GET 2 BACK'));
});

test('catches tab / multi-newline split keywords', () => {
  assert.ok(containsCryptoScam('free\tnitro for everyone'));
  assert.ok(containsCryptoScam('claim\n\n\nfree btc airdrop now'));
});

test('catches soft-hyphen evasion inside a keyword', () => {
  // U+00AD soft hyphen is in the stripped set. Placed INSIDE the word "nitro"
  // (keeping the real space), it strips away leaving "free nitro".
  assert.ok(containsCryptoScam('free ni­tro for everyone'));
});

// ---------------------------------------------------------------------------
// Legit messages that must NOT be flagged (these pass — false-positive guards work)
// ---------------------------------------------------------------------------

test('does not flag "never share your seed phrase" advice', () => {
  assert.equal(containsCryptoScam('Never share your seed phrase with anyone'), null);
});

test('does not flag legit dApp "connect your wallet"', () => {
  assert.equal(containsCryptoScam('Connect your wallet to start trading on the dApp'), null);
});

test('does not flag benign "send the eth address, get back to me"', () => {
  assert.equal(containsCryptoScam('send me the eth address and get back to me later'), null);
});

test('does not flag "free tier - nitro users" product talk', () => {
  assert.equal(containsCryptoScam('our API has a free tier - nitro users get extra calls'), null);
});

// ---------------------------------------------------------------------------
// REAL BUGS — false positives on security advice
// ---------------------------------------------------------------------------

test('BUG: flags legit advice "Do not paste your private key anywhere"', () => {
  // BUG: src/services/automod.js:317 — the seed/private-key phishing pattern
  // /\b(enter|submit|paste)\s+(your\s+)?(seed phrase|recovery phrase|private key)\b/i
  // matches "paste your private key" even when the surrounding text is a
  // warning. "do not" is NOT part of SCAM_WARNING_CONTEXT (which only has
  // "do ?n'?t click"), so this security advice is removed as a scam.
  // The existing suite covers "never share" (no action verb) but not the
  // far more common "do not enter/paste" phrasing.
  assert.equal(containsCryptoScam('Do not paste your private key anywhere'), null,
    'security advice telling users NOT to paste their key must not be flagged');
});

test('BUG: flags legit advice "Never enter your seed phrase on any site"', () => {
  // BUG: src/services/automod.js:317 — same pattern. "never enter your seed
  // phrase" is textbook security advice but the action verb "enter" trips the
  // phishing rule, and "never" is not a warning-context keyword.
  assert.equal(containsCryptoScam('Never enter your seed phrase on any site'), null,
    'advice telling users to NEVER enter their seed phrase must not be flagged');
});

// ---------------------------------------------------------------------------
// Scam-warning PSAs that must NOT be flagged (these pass)
// ---------------------------------------------------------------------------

test('does not flag a genuine PSA warning about giveaway scams', () => {
  assert.equal(
    containsCryptoScam('PSA: that BTC giveaway DM is a phishing scam, do not click'),
    null);
});

test('does not flag "watch out for airdrop scams" warning', () => {
  assert.equal(
    containsCryptoScam('Watch out for airdrop scams targeting ETH holders this week'),
    null);
});

// ---------------------------------------------------------------------------
// REAL BUGS — warning-vocabulary bypass lets actual scams through
// ---------------------------------------------------------------------------

test('BUG: scammer bypasses detection by prefixing "PSA"', () => {
  // BUG: src/services/automod.js:331,337 — SCAM_WARNING_CONTEXT short-circuits
  // and returns null on ANY message containing a warning keyword (psa, scam,
  // phishing, beware, ...). A scammer only has to sprinkle one of those words
  // into the lure to get a free pass. Here a real "free nitro" lure prefixed
  // with "PSA" slips through entirely.
  assert.ok(containsCryptoScam('PSA claim your free nitro here right now'),
    'a real "free nitro" lure must still be flagged even if it says "PSA"');
});

test('BUG: scammer bypasses detection by including the word "scammers"', () => {
  // BUG: src/services/automod.js:331,337 — same root cause. An active
  // "send X get Y back" lure that mentions "scammers" is treated as a warning
  // and not flagged.
  assert.ok(containsCryptoScam('scammers hate this trick: send 1 btc get 2 back guaranteed'),
    'a real "send X get Y back" lure must be flagged even if it says "scammers"');
});

test('BUG: wallet-drainer lure bypasses via the word "phishing"', () => {
  // BUG: src/services/automod.js:331,337 — "validate your wallet" is an
  // explicit wallet-drainer phrase, but adding the word "phishing" disables
  // the entire scan via the warning-context short-circuit.
  assert.ok(containsCryptoScam('phishing-proof: validate your wallet here to claim rewards'),
    'a wallet-drainer lure must be flagged even if it name-drops "phishing"');
});

test('BUG: "beware" prefix lets a double-your-bitcoin lure through', () => {
  // BUG: src/services/automod.js:331,337 — "beware" is a warning keyword, so a
  // classic investment scam prefixed with it is not flagged.
  assert.ok(containsCryptoScam('beware everyone, double your bitcoin: send 1 btc get 2 back'),
    'a "double your bitcoin" lure must be flagged even if it says "beware"');
});

// ---------------------------------------------------------------------------
// Borderline giveaway / memecoin language (these pass — sanity checks)
// ---------------------------------------------------------------------------

test('catches $TICKER memecoin airdrop', () => {
  assert.ok(containsCryptoScam('$PEPE airdrop live, claim now'));
});

test('does not flag plain crypto price chatter', () => {
  assert.equal(containsCryptoScam('did you see the bitcoin price today'), null);
});

test('handles empty / nullish input without flagging', () => {
  assert.equal(containsCryptoScam(''), null);
  assert.equal(containsCryptoScam(null), null);
  assert.equal(containsCryptoScam(undefined), null);
});
