# Pokedex Triage Conversation Overhaul Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Pokedex a disciplined, author-aware triage collector — discloses it's a bot, asks at most 3 one-at-a-time questions, exits on frustration, files structured tickets with real `#numbers`, splits multi-bug reports, ignores mod/bystander chatter as bug-info, and supports `/exclude`.

**Architecture:** The bot is stateless-per-evaluation: each issue-thread message triggers `src/triggers/thread.js`, which re-sends the whole transcript to one `evaluateIssueContext` LLM call (OpenRouter, JSON mode). "Turn counter / frustration / sufficiency" are signals persisted on the Firestore issue doc and enforced in code around that call. "Filing" = mark `contextComplete`, post a templated receipt, mirror to triage, stop asking. New decision logic is extracted into pure, unit-testable functions; wiring into `thread.js`/`index.js` is integration.

**Tech Stack:** Node 18+, CommonJS, discord.js v14, firebase-admin (Firestore), OpenRouter. Tests: `node --test` in `test/` (run `npm test`). MCP package: TypeScript + Vitest in `pokedex-mcp/`.

**Spec:** `docs/superpowers/specs/2026-05-21-pokedex-triage-overhaul-design.md`

**Branch:** `feat/triage-overhaul` (already created off `main`). PR1 (2.9.1) merges first; this PR bumps to **2.10.0**.

**Conventions for every task:** follow existing patterns in `test/` (use `require('node:test')`, `node:assert/strict`, and `test/helpers/mocks.js`). Test data is synthetic only — no real user IDs or secrets (repo policy). Run `npm test` before each commit; all tests stay green.

---

## Task 1: Frustration classifier (pure module)

**Files:**
- Create: `src/services/frustration.js`
- Test: `test/frustration.test.js`

- [ ] **Step 1: Write the failing test**

```js
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --test-name-pattern="detectFrustration"` (or `node --test test/frustration.test.js`)
Expected: FAIL — `detectFrustration` is not a function / module not found.

- [ ] **Step 3: Write minimal implementation**

```js
// Cheap regex/keyword frustration pre-check. Runs on OP messages only,
// before the LLM call, so the bot can exit and file instead of asking more.

const PHRASES = [
  /\bridiculous\b/i,
  /\bembarrass(ing|ed|ment)?\b/i,
  /\bis this an? (ai|bot|robot)\b/i,
  /\b(useless|pointless|terrible|awful)\b/i,
  /\bi (already )?(told|said) (you|this|that)\b/i,
  /\bwaste of (my )?(time|money)\b/i,
  /\b(give me|talk to|get me|i want|need) a (human|person|real person|agent)\b/i,
  /\b(hire me|do better|come on)\b/i,
  /\bwtf\b/i,
  /\b(f+u+c+k|shit|crap|damn|bullshit)\b/i,
];

function isShouting(text) {
  // A "sentence" of >=3 letters that is entirely uppercase, with >=2 words.
  const letters = text.replace(/[^a-zA-Z]/g, '');
  if (letters.length < 6) return false;
  const upper = text.replace(/[^A-Z]/g, '').length;
  const lower = text.replace(/[^a-z]/g, '').length;
  const words = text.trim().split(/\s+/).filter(Boolean);
  return words.length >= 2 && upper >= 6 && lower === 0;
}

function detectFrustration(text) {
  if (!text || typeof text !== 'string') return { frustrated: false, signal: null };
  for (const re of PHRASES) {
    if (re.test(text)) return { frustrated: true, signal: re.source };
  }
  if (isShouting(text)) return { frustrated: true, signal: 'all-caps' };
  return { frustrated: false, signal: null };
}

module.exports = { detectFrustration };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/frustration.test.js`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/services/frustration.js test/frustration.test.js
git commit -m "feat(triage): regex frustration classifier"
```

---

## Task 2: Author role resolution (pure helper)

**Files:**
- Create: `src/services/authorRole.js`
- Test: `test/authorRole.test.js`

Roles: `OP` = `issue.reporterId` (or in `issue.reporterIds`), `BOT` = author is a bot, `MOD` = author has `ManageMessages`, else `OTHER`.

- [ ] **Step 1: Write the failing test**

```js
const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const { PermissionFlagsBits } = require('discord.js');
const { resolveAuthorRole } = require('../src/services/authorRole');

function msg({ id = 'a', bot = false, manage = false } = {}) {
  return {
    author: { id, bot },
    member: { permissions: { has: (f) => manage && f === PermissionFlagsBits.ManageMessages } },
  };
}

describe('resolveAuthorRole', () => {
  const issue = { reporterId: 'op1', reporterIds: ['op1', 'op2'] };

  test('OP by reporterId', () => {
    assert.equal(resolveAuthorRole(msg({ id: 'op1' }), issue), 'OP');
  });
  test('OP by membership in reporterIds', () => {
    assert.equal(resolveAuthorRole(msg({ id: 'op2' }), issue), 'OP');
  });
  test('BOT takes precedence', () => {
    assert.equal(resolveAuthorRole(msg({ id: 'x', bot: true }), issue), 'BOT');
  });
  test('MOD by ManageMessages', () => {
    assert.equal(resolveAuthorRole(msg({ id: 'mod1', manage: true }), issue), 'MOD');
  });
  test('OTHER fallback', () => {
    assert.equal(resolveAuthorRole(msg({ id: 'rando' }), issue), 'OTHER');
  });
  test('never throws on missing member/permissions', () => {
    assert.equal(resolveAuthorRole({ author: { id: 'z' } }, issue), 'OTHER');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/authorRole.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```js
const { PermissionFlagsBits } = require('discord.js');

// Best-effort role for a Discord message relative to an issue. Never throws.
function resolveAuthorRole(message, issue) {
  const authorId = message?.author?.id;
  if (message?.author?.bot) return 'BOT';

  const reporters = new Set([issue?.reporterId, ...(issue?.reporterIds || [])].filter(Boolean));
  if (authorId && reporters.has(authorId)) return 'OP';

  try {
    if (message?.member?.permissions?.has?.(PermissionFlagsBits.ManageMessages)) return 'MOD';
  } catch {
    // ignore — fall through to OTHER
  }
  return 'OTHER';
}

module.exports = { resolveAuthorRole };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/authorRole.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/services/authorRole.js test/authorRole.test.js
git commit -m "feat(triage): author role resolution helper"
```

---

## Task 3: Sequential ticket counter (`allocateIssueNumber`)

**Files:**
- Modify: `src/services/firestore.js` (add `allocateIssueNumber`, wire into `saveIssue` at lines 24-31, export it)
- Test: `test/issueNumber.test.js`

`allocateIssueNumber` takes an optional `db` param (defaults to the module's `db`) so it is unit-testable with a fake transaction.

- [ ] **Step 1: Write the failing test**

```js
const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const { allocateIssueNumber } = require('../src/services/firestore');

// Fake Firestore exposing just runTransaction + a counters doc.
function fakeDb(start) {
  let value = start; // undefined => counter doc absent
  const docRef = { __id: 'counters/issues' };
  return {
    _value: () => value,
    collection: () => ({ doc: () => docRef }),
    runTransaction: async (fn) => fn({
      get: async () => ({ exists: value !== undefined, data: () => ({ next: value }) }),
      set: async (_ref, data) => { value = data.next; },
    }),
  };
}

describe('allocateIssueNumber', () => {
  test('starts at 1 when counter is absent', async () => {
    const db = fakeDb(undefined);
    assert.equal(await allocateIssueNumber(db), 1);
    assert.equal(db._value(), 1);
  });
  test('increments monotonically', async () => {
    const db = fakeDb(7);
    assert.equal(await allocateIssueNumber(db), 8);
    assert.equal(await allocateIssueNumber(db), 9);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/issueNumber.test.js`
Expected: FAIL — `allocateIssueNumber` is not exported.

- [ ] **Step 3: Implement and wire into `saveIssue`**

Add near the other helpers in `src/services/firestore.js`:

```js
async function allocateIssueNumber(database = db) {
  const ref = database.collection('counters').doc('issues');
  return database.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const next = ((snap.exists && snap.data().next) || 0) + 1;
    tx.set(ref, { next });
    return next;
  });
}
```

Modify `saveIssue` (currently lines 24-31) so every bot-side creation gets a number:

```js
async function saveIssue(issueData) {
  const number = await allocateIssueNumber();
  const docRef = await db.collection('issues').add({
    ...issueData,
    number,
    status: 'open',
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });
  return docRef.id;
}
```

Add `allocateIssueNumber` to the `module.exports` object (around line 513).

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test test/issueNumber.test.js` → PASS.
Run: `npm test` → all green (the existing `fakeFirestore.saveIssue` mock is unaffected; it doesn't call the real one).

- [ ] **Step 5: Commit**

```bash
git add src/services/firestore.js test/issueNumber.test.js
git commit -m "feat(triage): sequential issue number counter, allocated in saveIssue"
```

---

## Task 4: Receipt renderer (pure)

**Files:**
- Create: `src/services/receipt.js`
- Test: `test/receipt.test.js`

- [ ] **Step 1: Write the failing test**

```js
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/receipt.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```js
const NA = '(not provided)';

function numberList(numbers) {
  const tags = numbers.map(n => `#${n}`);
  if (tags.length === 1) return tags[0];
  if (tags.length === 2) return `${tags[0]} and ${tags[1]}`;
  return `${tags.slice(0, -1).join(', ')}, and ${tags[tags.length - 1]}`;
}

// Templated closing receipt. `numbers` is one or more ticket numbers (multi-bug
// splits list all of them). `fields` is the structured ticket content.
function buildReceipt(numbers, fields = {}) {
  const lead = numbers.length > 1
    ? `Filed as ${numberList(numbers)}.`
    : `Filed as ${numberList(numbers)}.`;
  return [
    lead,
    'What the team will see:',
    `- Issue: ${fields.summary || NA}`,
    `- Expected: ${fields.expected || NA}`,
    `- Actual: ${fields.actual || NA}`,
    `- Scope: ${fields.scope || NA}`,
    'Expected response: a human will follow up.',
  ].join('\n');
}

module.exports = { buildReceipt, numberList };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/receipt.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/services/receipt.js test/receipt.test.js
git commit -m "feat(triage): structured closing-receipt renderer"
```

---

## Task 5: Extended evaluator contract — `normalizeEvaluation` (pure)

**Files:**
- Modify: `src/services/openrouter.js` (extract the response-normalization block from `evaluateIssueContext` at lines 206-217 into an exported `normalizeEvaluation`, then add the new fields)
- Test: `test/normalizeEvaluation.test.js`

This isolates the JSON contract so it's testable without network. `evaluateIssueContext` then calls `normalizeEvaluation(parsed)`.

- [ ] **Step 1: Write the failing test**

```js
const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const { normalizeEvaluation } = require('../src/services/openrouter');

describe('normalizeEvaluation', () => {
  test('preserves existing fields and shouldReply alias', () => {
    const e = normalizeEvaluation({ complete: true, responseMode: 'reply', reply: 'hi?' });
    assert.equal(e.complete, true);
    assert.equal(e.responseMode, 'reply');
    assert.equal(e.shouldReply, true);
  });

  test('defaults new fields safely', () => {
    const e = normalizeEvaluation({});
    assert.equal(e.askedQuestion, false);
    assert.equal(e.shouldFile, false);
    assert.deepEqual(e.contextFields, { expected: null, actual: null, feature: null, frequency: null });
    assert.deepEqual(e.distinctBugs, []);
    assert.equal(e.receipt, null);
  });

  test('passes through structured contextFields and distinctBugs', () => {
    const e = normalizeEvaluation({
      askedQuestion: true,
      shouldFile: true,
      contextFields: { expected: 'x', actual: 'y', feature: 'z', frequency: 'always' },
      distinctBugs: [{ summary: 'a' }, { summary: 'b' }],
      receipt: { issue: 'i', expected: 'e', actual: 'a', scope: 's', expectedResponse: 'soon' },
    });
    assert.equal(e.contextFields.frequency, 'always');
    assert.equal(e.distinctBugs.length, 2);
    assert.equal(e.receipt.scope, 's');
  });

  test('coerces invalid types to safe defaults', () => {
    const e = normalizeEvaluation({ contextFields: 'nope', distinctBugs: 'nope', responseMode: 'bogus' });
    assert.deepEqual(e.contextFields, { expected: null, actual: null, feature: null, frequency: null });
    assert.deepEqual(e.distinctBugs, []);
    assert.equal(e.responseMode, 'react'); // existing fallback
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/normalizeEvaluation.test.js`
Expected: FAIL — `normalizeEvaluation` not exported.

- [ ] **Step 3: Implement**

In `src/services/openrouter.js`, add (and export) this function, then replace the inline `return { ... }` block in `evaluateIssueContext` (lines 206-217) with `return normalizeEvaluation(parsed);` and the error-path return objects with `normalizeEvaluation({})` where they currently hand-build the shape:

```js
function normalizeEvaluation(parsed = {}) {
  const cf = (parsed && typeof parsed.contextFields === 'object' && parsed.contextFields) || {};
  const str = (v) => (typeof v === 'string' && v.trim() ? v : null);
  return {
    complete: !!parsed.complete,
    missing: Array.isArray(parsed.missing) ? parsed.missing : [],
    responseMode: ['ignore', 'react', 'reply'].includes(parsed.responseMode) ? parsed.responseMode : 'react',
    shouldReply: parsed.responseMode === 'reply',
    reply: typeof parsed.reply === 'string' ? parsed.reply : null,
    triageUpdate: typeof parsed.triageUpdate === 'string' ? parsed.triageUpdate : null,
    reclassify: !!parsed.reclassify,
    resolved: !!parsed.resolved,
    resolvedReason: typeof parsed.resolvedReason === 'string' ? parsed.resolvedReason : null,
    // new fields
    askedQuestion: !!parsed.askedQuestion,
    shouldFile: !!parsed.shouldFile,
    contextFields: {
      expected: str(cf.expected),
      actual: str(cf.actual),
      feature: str(cf.feature),
      frequency: str(cf.frequency),
    },
    distinctBugs: Array.isArray(parsed.distinctBugs) ? parsed.distinctBugs : [],
    receipt: (parsed && typeof parsed.receipt === 'object' && parsed.receipt) || null,
  };
}
```

Add `normalizeEvaluation` to `module.exports` (line 280).

> Note: the two error-path returns inside `evaluateIssueContext` (lines 196 and 220) must keep `responseMode: 'ignore'`. Build them as `{ ...normalizeEvaluation({}), responseMode: 'ignore', shouldReply: false }` so they stay back-compatible.

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test test/normalizeEvaluation.test.js` → PASS.
Run: `npm test` → all green (existing `processConversationResponse`/`autoResolve` tests still see the same field shapes).

- [ ] **Step 5: Commit**

```bash
git add src/services/openrouter.js test/normalizeEvaluation.test.js
git commit -m "feat(triage): extend evaluator JSON contract (extracted normalizeEvaluation)"
```

---

## Task 6: Rewrite the conversational system prompt

**Files:**
- Modify: `src/services/openrouter.js` — the `systemPrompt` template inside `evaluateIssueContext` (lines 137-173) and the JSON shape it requests (lines 163-173).

No new unit test (prompt text). Validation is the contract test from Task 5 plus the manual test plan.

- [ ] **Step 1: Replace the system prompt body**

Replace the prompt with one enforcing the spec's rules. Keep the dynamic `## Current Issue` / `## Context Checklist` / `${extraHint}` interpolations already present. Add these rule blocks and ask for the extended JSON:

```
IDENTITY: If no [BOT] message has appeared yet in the transcript, your reply MUST begin: "I'm pokedex, an automated bot that collects bug details for the engineering team. I'm not support — I'll ask 1–3 quick questions, then file your report. A human follows up from there." Never claim to be human.

WHOSE MESSAGES MATTER: Each transcript line is tagged [OP], [MOD], [OTHER], or [BOT]. ONLY [OP] lines are bug information. [MOD]/[OTHER] lines are context for your awareness but must NOT drive your questions, summaries, contextFields, distinctBugs, or receipt. Never ask [MOD]/[OTHER] questions; stay silent toward them.

CORE LOOP (after each OP message): (1) Do you have expected, actual, feature, and frequency? (2) Is the OP frustrated? (3) Have you already asked 2 questions? If YES to any → set shouldFile=true and produce a receipt. Otherwise ask ONE question (askedQuestion=true). Bias toward filing early.

QUESTION RULES: One question per message, never two. Never ask the OP to do diagnosis (re-run, restart, incognito). Never re-ask something answered (even implicitly). If they paste a spec, treat it as several answers at once.

BANNED OPENERS: "Got it —", "Thanks for clarifying", "That's really helpful", "That's helpful context", "So it sounds like". No echoing the user's message back as a mid-thread summary.

OFF-LIMITS: No diagnosing, workarounds, explaining how Poke works, or promises. If asked: "That's a human question — I've flagged it on the ticket."

MULTIPLE BUGS: If the OP surfaced 2+ distinct bugs, populate distinctBugs with one entry per bug.

FILING: When shouldFile=true, set responseMode="reply", askedQuestion=false, fill contextFields, and fill receipt (issue/expected/actual/scope/expectedResponse). The code renders the final user-facing receipt — keep reply short or empty.
```

Update the returned-JSON spec block to include `askedQuestion`, `shouldFile`, `contextFields {expected,actual,feature,frequency}`, `distinctBugs [...]`, and `receipt {...}|null` (matching Task 5's contract).

- [ ] **Step 2: Sanity-check it loads**

Run: `node -e "require('./src/services/openrouter')"` → no error.
Run: `npm test` → all green.

- [ ] **Step 3: Commit**

```bash
git add src/services/openrouter.js
git commit -m "feat(triage): rewrite conversational prompt — identity, author-aware, 1Q, file-early"
```

---

## Task 7: Author-tagged transcript + exclusions in `buildConversationHistory`

**Files:**
- Modify: `src/services/contextEvaluator.js` — `buildConversationHistory` (lines 63-71) and the transcript builder used by `evaluateIssueContext`.
- Modify: `src/services/openrouter.js` — transcript line builder (line 124-126) to emit role tags.
- Test: `test/conversationHistory.test.js`

Approach: `buildConversationHistory(messages, issue)` attaches `role` per message via `resolveAuthorRole` and drops messages whose id is in `issue.excludedMessageIds` or whose author is in `issue.excludeModeUserIds`. The transcript builder prints `[ROLE] content`.

- [ ] **Step 1: Write the failing test**

```js
const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const { buildConversationHistory, buildTranscript } = require('../src/services/contextEvaluator');

function m({ id, authorId, username, bot = false, content }) {
  return {
    id,
    author: { id: authorId, username, bot },
    content,
    attachments: { values: () => [][Symbol.iterator]() },
    createdAt: new Date('2026-05-21T00:00:00Z'),
    member: { permissions: { has: () => false } },
  };
}

describe('buildConversationHistory + buildTranscript', () => {
  const issue = { reporterId: 'op1', excludedMessageIds: ['x9'], excludeModeUserIds: ['mute1'] };
  const messages = [
    m({ id: '1', authorId: 'op1', username: 'op', content: 'calendar broken' }),
    m({ id: '2', authorId: 'mod1', username: 'mod', content: 'have you tried X' }),
    m({ id: 'x9', authorId: 'op1', username: 'op', content: 'excluded line' }),
    m({ id: '3', authorId: 'mute1', username: 'muted', content: 'side chatter' }),
    m({ id: '4', authorId: 'bot', username: 'pokedex', bot: true, content: 'a question?' }),
  ];

  test('tags roles and drops excluded messages/users', () => {
    const hist = buildConversationHistory(messages, issue);
    const ids = hist.map(h => h.id);
    assert.deepEqual(ids, ['1', '2', '4']); // x9 excluded by id, mute1 by user
    assert.equal(hist.find(h => h.id === '1').role, 'OP');
    assert.equal(hist.find(h => h.id === '2').role, 'OTHER'); // no ManageMessages here
    assert.equal(hist.find(h => h.id === '4').role, 'BOT');
  });

  test('transcript prints role tags', () => {
    const hist = buildConversationHistory(messages, issue);
    const t = buildTranscript(hist);
    assert.match(t, /\[OP\] calendar broken/);
    assert.match(t, /\[BOT\] a question\?/);
    assert.ok(!t.includes('excluded line'));
  });

  test('back-compat: works with no issue arg (all OTHER/BOT, nothing excluded)', () => {
    const hist = buildConversationHistory(messages);
    assert.equal(hist.length, 5);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/conversationHistory.test.js`
Expected: FAIL — `buildTranscript` not exported / `role` undefined / excluded not dropped.

- [ ] **Step 3: Implement**

In `src/services/contextEvaluator.js`, replace `buildConversationHistory` and add `buildTranscript`:

```js
const { resolveAuthorRole } = require('./authorRole');

function buildConversationHistory(messages, issue = {}) {
  const excludedIds = new Set(issue.excludedMessageIds || []);
  const excludedUsers = new Set(issue.excludeModeUserIds || []);
  return messages
    .filter(m => !excludedIds.has(m.id) && !excludedUsers.has(m.author?.id))
    .map(m => ({
      id: m.id,
      role: resolveAuthorRole(m, issue),
      author: m.author?.username || 'unknown',
      isBot: m.author?.bot || false,
      content: m.content || '',
      attachments: [...(m.attachments?.values() || [])].map(a => ({ url: a.url, name: a.name })),
      createdAt: m.createdAt?.toISOString() || new Date().toISOString(),
    }));
}

function buildTranscript(history) {
  return history.map(h => `[${h.role}] ${h.content}`).join('\n');
}
```

Add `buildTranscript` to `module.exports` (line 182).

In `src/services/openrouter.js`, change `evaluateIssueContext` to accept a pre-built transcript OR keep building one but with role tags. Simplest: have callers pass `buildTranscript(history)` as the conversation text. Update the `transcript` construction (lines 124-126) to prefer role tags when present:

```js
const transcript = conversationHistory
  .map(m => `[${m.role || (m.isBot ? 'BOT' : 'OTHER')}] ${m.content}`)
  .join('\n');
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test test/conversationHistory.test.js` → PASS.
Run: `npm test` → green. (Check `test/mention-parent-context.test.js` and any test calling `buildConversationHistory`; if a caller passed only `messages`, the new optional `issue` keeps it working.)

- [ ] **Step 5: Commit**

```bash
git add src/services/contextEvaluator.js src/services/openrouter.js test/conversationHistory.test.js
git commit -m "feat(triage): author-tagged transcript + per-thread exclusions in history"
```

---

## Task 8: Thread decision logic (pure) — turn cap, frustration, file gating

**Files:**
- Create: `src/services/threadDecision.js`
- Test: `test/threadDecision.test.js`

A pure function decides what the bot should do for an OP message, given the persisted counters and the evaluation. `thread.js` (Task 9) calls it and performs the side effects.

- [ ] **Step 1: Write the failing test**

```js
const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const { decideThreadAction, MAX_QUESTION_TURNS } = require('../src/services/threadDecision');

const baseEval = {
  responseMode: 'reply', reply: 'what feature?', askedQuestion: true, shouldFile: false,
  contextFields: { expected: null, actual: null, feature: null, frequency: null },
  distinctBugs: [], resolved: false,
};

describe('decideThreadAction', () => {
  test('non-OP message → silent (no ask, no file)', () => {
    const out = decideThreadAction({ role: 'MOD', issue: {}, frustration: { frustrated: false }, evaluation: baseEval });
    assert.equal(out.action, 'silent');
  });

  test('OP frustrated → file regardless of evaluation', () => {
    const out = decideThreadAction({ role: 'OP', issue: { questionTurns: 0 }, frustration: { frustrated: true, signal: 'ridiculous' }, evaluation: baseEval });
    assert.equal(out.action, 'file');
    assert.equal(out.reason, 'frustration');
  });

  test('OP at turn cap → file instead of asking', () => {
    const out = decideThreadAction({ role: 'OP', issue: { questionTurns: MAX_QUESTION_TURNS }, frustration: { frustrated: false }, evaluation: baseEval });
    assert.equal(out.action, 'file');
    assert.equal(out.reason, 'turn-cap');
  });

  test('OP with all contextFields → file (sufficiency)', () => {
    const ev = { ...baseEval, contextFields: { expected: 'a', actual: 'b', feature: 'c', frequency: 'd' } };
    const out = decideThreadAction({ role: 'OP', issue: { questionTurns: 1 }, frustration: { frustrated: false }, evaluation: ev });
    assert.equal(out.action, 'file');
    assert.equal(out.reason, 'sufficient');
  });

  test('OP under cap, info missing, model asks → ask (increments turn)', () => {
    const out = decideThreadAction({ role: 'OP', issue: { questionTurns: 1 }, frustration: { frustrated: false }, evaluation: baseEval });
    assert.equal(out.action, 'ask');
    assert.equal(out.incrementTurn, true);
  });

  test('already filed → silent (idempotent)', () => {
    const out = decideThreadAction({ role: 'OP', issue: { filedAt: 'x', questionTurns: 0 }, frustration: { frustrated: true }, evaluation: baseEval });
    assert.equal(out.action, 'silent');
  });

  test('model shouldFile → file', () => {
    const ev = { ...baseEval, shouldFile: true, askedQuestion: false };
    const out = decideThreadAction({ role: 'OP', issue: { questionTurns: 0 }, frustration: { frustrated: false }, evaluation: ev });
    assert.equal(out.action, 'file');
  });

  test('react/ignore evaluation passes through for OP', () => {
    const ev = { ...baseEval, responseMode: 'react', askedQuestion: false };
    const out = decideThreadAction({ role: 'OP', issue: { questionTurns: 0 }, frustration: { frustrated: false }, evaluation: ev });
    assert.equal(out.action, 'react');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/threadDecision.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```js
const MAX_QUESTION_TURNS = 3;

function hasAllFields(cf = {}) {
  return !!(cf.expected && cf.actual && cf.feature && cf.frequency);
}

// Decide what the bot should do for one thread message. Pure: no I/O.
// Returns { action, reason?, incrementTurn?, evaluation }.
// action ∈ 'silent' | 'file' | 'ask' | 'reply' | 'react'.
function decideThreadAction({ role, issue = {}, frustration = {}, evaluation = {} }) {
  if (issue.filedAt) return { action: 'silent', reason: 'already-filed', evaluation };

  // Auto-resolve is handled separately (processConversationResponse); not here.
  if (role !== 'OP') return { action: 'silent', reason: 'non-op', evaluation };

  if (frustration.frustrated) return { action: 'file', reason: 'frustration', evaluation };
  if ((issue.questionTurns || 0) >= MAX_QUESTION_TURNS) return { action: 'file', reason: 'turn-cap', evaluation };
  if (hasAllFields(evaluation.contextFields)) return { action: 'file', reason: 'sufficient', evaluation };
  if (evaluation.shouldFile) return { action: 'file', reason: 'model', evaluation };

  if (evaluation.askedQuestion && evaluation.responseMode === 'reply') {
    return { action: 'ask', incrementTurn: true, evaluation };
  }
  if (evaluation.responseMode === 'react') return { action: 'react', evaluation };
  if (evaluation.responseMode === 'reply' && evaluation.reply) return { action: 'reply', evaluation };
  return { action: 'silent', reason: 'ignore', evaluation };
}

module.exports = { decideThreadAction, hasAllFields, MAX_QUESTION_TURNS };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/threadDecision.test.js` → PASS.

- [ ] **Step 5: Commit**

```bash
git add src/services/threadDecision.js test/threadDecision.test.js
git commit -m "feat(triage): pure thread decision logic (turn cap, frustration, sufficiency)"
```

---

## Task 9: Filing side-effects + multi-issue split (in contextEvaluator)

**Files:**
- Modify: `src/services/contextEvaluator.js` — add `fileIssue(guild, issue, issueId, evaluation, reason)`.
- Modify: `src/services/firestore.js` — add `setIssueFiled`, `incrementQuestionTurns`, `setIdentityDisclosed` helpers (thin wrappers over `updateIssueFields`).
- Test: `test/fileIssue.test.js`

`fileIssue` builds receipt(s), creates child issues for extra `distinctBugs`, posts the receipt in the thread, mirrors to the triage embed, and marks the issue filed (idempotent). It takes injectable deps so it is testable without Discord/Firestore.

- [ ] **Step 1: Write the failing test**

```js
const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const { buildFilePlan } = require('../src/services/contextEvaluator');

describe('buildFilePlan', () => {
  const baseFields = { expected: 'e', actual: 'a', feature: 'f', frequency: 'always' };

  test('single bug → one receipt, no children', () => {
    const plan = buildFilePlan({
      issue: { number: 10, summary: 'sync broken' },
      evaluation: { contextFields: baseFields, distinctBugs: [] },
    });
    assert.equal(plan.children.length, 0);
    assert.match(plan.receipt, /Filed as #10\./);
  });

  test('two distinct bugs → one child issue + receipt names both numbers', () => {
    const plan = buildFilePlan({
      issue: { number: 10, summary: 'first bug' },
      evaluation: {
        contextFields: baseFields,
        distinctBugs: [
          { summary: 'first bug', expected: 'e1', actual: 'a1', feature: 'f1', frequency: 'always' },
          { summary: 'second bug', expected: 'e2', actual: 'a2', feature: 'f2', frequency: 'sometimes' },
        ],
      },
    });
    assert.equal(plan.children.length, 1);
    assert.equal(plan.children[0].summary, 'second bug');
    assert.match(plan.receipt, /#10 and #11/); // child number is allocated as primary+1 placeholder
  });
});
```

> Note on numbers in the plan: `buildFilePlan` returns child *issue payloads* (without numbers) and a receipt computed from the primary number plus the count of children, using sequential placeholders `primary+1..`. The caller (`fileIssue`) allocates real numbers when it creates children and re-renders the receipt with the actual numbers. The unit test asserts the placeholder math; the integration wiring is verified manually.

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/fileIssue.test.js`
Expected: FAIL — `buildFilePlan` not exported.

- [ ] **Step 3: Implement `buildFilePlan` + `fileIssue` + firestore helpers**

In `src/services/contextEvaluator.js`:

```js
const { buildReceipt } = require('./receipt');

function buildFilePlan({ issue, evaluation }) {
  const bugs = Array.isArray(evaluation.distinctBugs) ? evaluation.distinctBugs : [];
  const primaryNumber = issue.number;
  const children = bugs.slice(1).map(b => ({
    summary: b.summary,
    text: `${b.summary}`,
    reporterId: issue.reporterId,
    reporterName: issue.reporterName,
    target: issue.target,
    splitFromIssueId: issue.id,
    contextComplete: true,
    contextFields: {
      expected: b.expected || null, actual: b.actual || null,
      feature: b.feature || null, frequency: b.frequency || null,
    },
  }));
  // Placeholder numbers for children: primary+1, primary+2, ...
  const numbers = [primaryNumber, ...children.map((_c, i) => primaryNumber + 1 + i)]
    .filter(n => typeof n === 'number');
  const primaryFields = bugs[0] || evaluation.contextFields || {};
  const fields = {
    summary: primaryFields.summary || issue.summary,
    expected: (evaluation.contextFields || {}).expected || primaryFields.expected,
    actual: (evaluation.contextFields || {}).actual || primaryFields.actual,
    scope: [(evaluation.contextFields || {}).frequency, (evaluation.contextFields || {}).feature].filter(Boolean).join(' / '),
  };
  return { children, numbers, receipt: buildReceipt(numbers.length ? numbers : [primaryNumber], fields), fields };
}

async function fileIssue(guild, issue, issueId, evaluation, deps = {}) {
  const fs = deps.firestore || firestore;
  if (issue.filedAt) return { ok: true, skipped: true };

  const plan = buildFilePlan({ issue, evaluation });

  // Create real child issues and collect their numbers.
  const realNumbers = [issue.number];
  for (const child of plan.children) {
    const childId = await fs.saveIssue(child);   // saveIssue allocates a number
    const childDoc = await fs.getIssueById(childId);
    realNumbers.push(childDoc?.number);
  }
  const receipt = buildReceipt(realNumbers.filter(n => typeof n === 'number'), plan.fields);

  // Post receipt in the thread.
  if (deps.thread?.send) await deps.thread.send({ content: receipt }).catch(() => {});

  // Mark filed + complete (idempotent guard via filedAt).
  await fs.updateIssueFields(issueId, {
    contextComplete: true,
    contextFields: evaluation.contextFields,
    filedAt: new Date().toISOString(),
  });

  // Mirror to triage embed.
  try { await updateContextBadge(guild, { ...issue, contextComplete: true }, issueId); } catch {}
  return { ok: true, receipt };
}
```

Export both `buildFilePlan` and `fileIssue`.

In `src/services/firestore.js`, add (and export) thin helpers used by `thread.js`:

```js
async function incrementQuestionTurns(issueId) {
  await db.collection('issues').doc(issueId).update({
    questionTurns: admin.firestore.FieldValue.increment(1),
  });
}
async function setIdentityDisclosed(issueId) {
  await db.collection('issues').doc(issueId).update({ identityDisclosed: true });
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test test/fileIssue.test.js` → PASS.
Run: `npm test` → green.

- [ ] **Step 5: Commit**

```bash
git add src/services/contextEvaluator.js src/services/firestore.js test/fileIssue.test.js
git commit -m "feat(triage): filing side-effects + multi-issue split planning"
```

---

## Task 10: Wire decision logic into `thread.js`

**Files:**
- Modify: `src/triggers/thread.js` (the debounced evaluation block, lines 60-127)
- Test: extend `test/thread-rate-limit.test.js` is NOT enough; add `test/threadOrchestration.test.js` that exercises the new branch wiring via the exported helpers. (The full `handleThreadMessage` is integration; cover the decision wiring by asserting the helper calls.)

Because `handleThreadMessage` does heavy Discord I/O, refactor the decision portion into an exported `runThreadDecision({ message, issue, history, evaluation, frustration, deps })` that is pure-ish (delegates side effects to injected deps) and unit-test that.

- [ ] **Step 1: Write the failing test**

```js
const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const { runThreadDecision } = require('../src/triggers/thread');

function deps() {
  const calls = { incremented: 0, filed: 0, sent: [], reacted: 0, disclosed: 0 };
  return {
    calls,
    firestore: {
      incrementQuestionTurns: async () => { calls.incremented++; },
      setIdentityDisclosed: async () => { calls.disclosed++; },
    },
    fileIssue: async () => { calls.filed++; },
    send: async (c) => { calls.sent.push(c); },
    react: async () => { calls.reacted++; },
  };
}

describe('runThreadDecision', () => {
  test('OP ask under cap increments the turn and sends the reply', async () => {
    const d = deps();
    await runThreadDecision({
      role: 'OP', issue: { questionTurns: 0, identityDisclosed: true }, issueId: 'i1',
      frustration: { frustrated: false },
      evaluation: { responseMode: 'reply', reply: 'what feature?', askedQuestion: true, contextFields: {}, distinctBugs: [] },
      deps: d,
    });
    assert.equal(d.calls.incremented, 1);
    assert.equal(d.calls.sent.length, 1);
    assert.equal(d.calls.filed, 0);
  });

  test('frustrated OP files and does not increment', async () => {
    const d = deps();
    await runThreadDecision({
      role: 'OP', issue: { questionTurns: 0, identityDisclosed: true }, issueId: 'i1',
      frustration: { frustrated: true, signal: 'ridiculous' },
      evaluation: { responseMode: 'reply', reply: 'x', askedQuestion: true, contextFields: {}, distinctBugs: [] },
      deps: d,
    });
    assert.equal(d.calls.filed, 1);
    assert.equal(d.calls.incremented, 0);
  });

  test('non-OP message does nothing', async () => {
    const d = deps();
    await runThreadDecision({
      role: 'MOD', issue: { questionTurns: 0 }, issueId: 'i1',
      frustration: { frustrated: false },
      evaluation: { responseMode: 'reply', reply: 'x', askedQuestion: true, contextFields: {}, distinctBugs: [] },
      deps: d,
    });
    assert.equal(d.calls.sent.length, 0);
    assert.equal(d.calls.filed, 0);
    assert.equal(d.calls.incremented, 0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/threadOrchestration.test.js`
Expected: FAIL — `runThreadDecision` not exported.

- [ ] **Step 3: Implement `runThreadDecision` and call it from `handleThreadMessage`**

Add to `src/triggers/thread.js`:

```js
const { decideThreadAction } = require('../services/threadDecision');
const { detectFrustration } = require('../services/frustration');
const { resolveAuthorRole } = require('../services/authorRole');

async function runThreadDecision({ role, issue, issueId, frustration, evaluation, deps }) {
  const decision = decideThreadAction({ role, issue, frustration, evaluation });
  switch (decision.action) {
    case 'file':
      await deps.fileIssue(deps.guild, issue, issueId, evaluation, { thread: { send: deps.send }, firestore: deps.firestore });
      return decision;
    case 'ask':
      if (!issue.identityDisclosed) { await deps.firestore.setIdentityDisclosed(issueId); }
      if (decision.incrementTurn) await deps.firestore.incrementQuestionTurns(issueId);
      if (evaluation.reply) await deps.send(evaluation.reply);
      return decision;
    case 'reply':
      if (evaluation.reply) await deps.send(evaluation.reply);
      return decision;
    case 'react':
      await deps.react('✅');
      return decision;
    default:
      return decision; // 'silent'
  }
}
```

In `handleThreadMessage`'s debounced block: compute `role = resolveAuthorRole(message, updatedIssue)`; compute `frustration = role === 'OP' ? detectFrustration(message.content) : { frustrated: false }`; build history with the issue (`buildConversationHistory(allMessages, updatedIssue)`); after `evaluateContext`, when not auto-resolving, call `runThreadDecision` with real deps (`guild: message.guild`, `firestore`, `fileIssue: contextEvaluator.fileIssue`, `send: (c) => message.channel.send(typeof c === 'string' ? { content: c } : c)`, `react: (e) => message.react(e)`), gated by the existing `canBotReplyInThread` rate-limit for `ask`/`reply`. Keep `processEvaluation` (triage-embed update / reclassify) running as today. Keep `processConversationResponse` ONLY for the auto-resolve path (reporter says "fixed"), since `runThreadDecision` now owns reply/react/file.

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test test/threadOrchestration.test.js` → PASS.
Run: `npm test` → green. Update `test/processConversationResponse.test.js` only if its assumptions about reply/react ownership changed; if so, narrow it to the auto-resolve path it still owns and note the change in the commit.

- [ ] **Step 5: Commit**

```bash
git add src/triggers/thread.js test/threadOrchestration.test.js
git commit -m "feat(triage): wire author-aware decision/turn-cap/frustration/filing into thread.js"
```

---

## Task 11: `/exclude` slash command + storage helpers

**Files:**
- Create: `src/commands/exclude.js`
- Modify: `src/services/firestore.js` — add exclusion helpers
- Test: `test/exclude.test.js`

Subcommands: `last <n>`, `on`, `off`, `status`, `clear`. (Single-message exclusion is the context-menu command in Task 12.) Permissions: any MOD; OP may exclude only their own messages (enforced for `last` by filtering to the runner's own messages when they're not a mod).

- [ ] **Step 1: Write the failing test (pure helpers)**

```js
const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const { computeLastExclusions } = require('../src/commands/exclude');

describe('computeLastExclusions', () => {
  const msgs = [
    { id: '1', authorId: 'op1' },
    { id: '2', authorId: 'mod1' },
    { id: '3', authorId: 'op1' },
    { id: '4', authorId: 'mod1' },
  ];
  test('mod excludes last N across all authors', () => {
    assert.deepEqual(computeLastExclusions(msgs, 2, { isMod: true, runnerId: 'mod1' }), ['3', '4']);
  });
  test('OP can only exclude their own among the last N', () => {
    assert.deepEqual(computeLastExclusions(msgs, 3, { isMod: false, runnerId: 'op1' }), ['1', '3']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/exclude.test.js`
Expected: FAIL — module/function not found.

- [ ] **Step 3: Implement command + helpers**

In `src/services/firestore.js`, add and export:

```js
async function addExcludedMessageIds(issueId, ids) {
  await db.collection('issues').doc(issueId).update({
    excludedMessageIds: admin.firestore.FieldValue.arrayUnion(...ids),
  });
}
async function setExcludeMode(issueId, userId, on) {
  await db.collection('issues').doc(issueId).update({
    excludeModeUserIds: on
      ? admin.firestore.FieldValue.arrayUnion(userId)
      : admin.firestore.FieldValue.arrayRemove(userId),
  });
}
async function clearExclusions(issueId) {
  await db.collection('issues').doc(issueId).update({ excludedMessageIds: [], excludeModeUserIds: [] });
}
```

Create `src/commands/exclude.js` exporting `{ data, execute, computeLastExclusions }`. `data` is a `SlashCommandBuilder` named `exclude` with subcommands `last` (integer option `count`, min 1 max 50), `on`, `off`, `status`, `clear`. `execute`:
- Must run inside a thread linked to an issue (`firestore.getIssueByThreadId(thread.id)`), else ephemeral error.
- `isMod = member.permissions.has(ManageMessages)`.
- `last`: fetch recent thread messages, `computeLastExclusions(...)`, `addExcludedMessageIds`.
- `on`/`off`: `setExcludeMode(issueId, user.id, true/false)`.
- `status`: ephemeral list of `excludedMessageIds` count + `excludeModeUserIds`.
- `clear`: mods only; `clearExclusions`.

```js
function computeLastExclusions(messages, n, { isMod, runnerId }) {
  const lastN = messages.slice(-n);
  const eligible = isMod ? lastN : lastN.filter(m => m.authorId === runnerId);
  return eligible.map(m => m.id);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test test/exclude.test.js` → PASS.
Run: `node -e "require('./src/commands/exclude').data.toJSON()"` → prints JSON, no error.
Run: `npm test` → green.

- [ ] **Step 5: Commit**

```bash
git add src/commands/exclude.js src/services/firestore.js test/exclude.test.js
git commit -m "feat(triage): /exclude command + per-thread exclusion storage"
```

---

## Task 12: Context-menu "Exclude from Pokedex" + interaction routing

**Files:**
- Create: `src/commands/excludeContext.js`
- Modify: `src/index.js` — require both new commands; add to `registerCommands` body; route `isMessageContextMenuCommand()`; add both to the chat-command map for `/exclude`.

- [ ] **Step 1: Implement the context-menu command**

`src/commands/excludeContext.js`:

```js
const { ContextMenuCommandBuilder, ApplicationCommandType, PermissionFlagsBits } = require('discord.js');
const firestore = require('../services/firestore');

const data = new ContextMenuCommandBuilder()
  .setName('Exclude from Pokedex')
  .setType(ApplicationCommandType.Message);

async function execute(interaction) {
  const thread = interaction.channel;
  const issue = thread?.isThread?.() ? await firestore.getIssueByThreadId(thread.id) : null;
  if (!issue) {
    return interaction.reply({ content: 'Run this on a message inside a Pokedex issue thread.', ephemeral: true });
  }
  const target = interaction.targetMessage;
  const isMod = interaction.member?.permissions?.has(PermissionFlagsBits.ManageMessages);
  const isOwn = target.author?.id === interaction.user.id;
  if (!isMod && !isOwn) {
    return interaction.reply({ content: 'You can only exclude your own messages.', ephemeral: true });
  }
  await firestore.addExcludedMessageIds(issue.id, [target.id]);
  return interaction.reply({ content: 'Excluded that message from Pokedex context.', ephemeral: true });
}

module.exports = { data, execute };
```

- [ ] **Step 2: Wire into `src/index.js`**

- Add requires near the other command requires (after line ~41):
  ```js
  const excludeCommand = require('./commands/exclude');
  const excludeContextCommand = require('./commands/excludeContext');
  ```
- In `registerCommands`, append to the `body` array: `excludeCommand.data.toJSON(), excludeContextCommand.data.toJSON()`.
- Add `exclude: excludeCommand` to the chat-input `commands` map (line 285) and the autocomplete map is not needed.
- In `interactionCreate`, before the `isChatInputCommand` check, add:
  ```js
  if (interaction.isMessageContextMenuCommand()) {
    if (interaction.commandName === 'Exclude from Pokedex') {
      try { await excludeContextCommand.execute(interaction); }
      catch (err) { console.error('context-menu exclude failed:', err); await safeInteractionReply(interaction, 'Failed to exclude.'); }
    }
    return;
  }
  ```

- [ ] **Step 3: Verify it loads and registers**

Run: `node -e "require('./src/commands/excludeContext').data.toJSON(); require('./src/index.js')" ` is not safe (starts the bot). Instead:
Run: `node -e "const c=require('./src/commands/excludeContext'); console.log(c.data.toJSON().name, c.data.toJSON().type)"`
Expected: `Exclude from Pokedex 3` (type 3 = MESSAGE).
Run: `npm test` → green.

- [ ] **Step 4: Commit**

```bash
git add src/commands/excludeContext.js src/index.js
git commit -m "feat(triage): context-menu Exclude from Pokedex + interaction routing"
```

---

## Task 13: Show `#number` in triage embed + help docs

**Files:**
- Modify: `src/services/triage.js` — `buildIssueEmbed` footer (line 76) to prefer `#number`.
- Modify: `src/commands/help.js` — add `/exclude` to the Issues & Triage category.
- Test: extend `test/triage-routing.test.js` with a footer assertion (uses existing config setup).

- [ ] **Step 1: Write the failing test**

Add to `test/triage-routing.test.js`:

```js
test('issue embed footer shows #number when present', () => {
  const { buildIssueEmbed } = require('../src/services/triage');
  const embed = buildIssueEmbed({ summary: 's', priority: 'low', category: 'bug', reporterName: 'a', reasoning: 'r', number: 42 }, 'doc123');
  assert.match(embed.toJSON().footer.text, /#42/);
});
test('issue embed footer falls back to issue id without a number', () => {
  const { buildIssueEmbed } = require('../src/services/triage');
  const embed = buildIssueEmbed({ summary: 's', priority: 'low', category: 'bug', reporterName: 'a', reasoning: 'r' }, 'doc123');
  assert.match(embed.toJSON().footer.text, /doc123/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/triage-routing.test.js`
Expected: FAIL — footer has no `#42`.

- [ ] **Step 3: Implement**

In `src/services/triage.js` line 76, change the footer:

```js
.setFooter({ text: issue.number ? `Ticket #${issue.number} | Issue ID: ${issueId}` : `Issue ID: ${issueId}` })
```

In `src/commands/help.js`, add to the `issues` category `commands` array:

```js
'`/exclude last <n>|on|off|status|clear` — keep messages out of Pokedex’s context',
'Right-click a message → Apps → **Exclude from Pokedex** — exclude one message',
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test test/triage-routing.test.js` → PASS.
Run: `npm test` → green.

- [ ] **Step 5: Commit**

```bash
git add src/services/triage.js src/commands/help.js test/triage-routing.test.js
git commit -m "feat(triage): show ticket #number in triage embed; document /exclude in help"
```

---

## Task 14: MCP package — allocate `#number` + version bump

**Files:**
- Modify: `pokedex-mcp/src/handlers.ts` — add `allocateIssueNumber` and attach `number` in `handleReportBug` (line 77-91) and `handleSuggestFeature` (line 139-153).
- Modify: `pokedex-mcp/src/discord.ts` — show `#number` in the webhook embed footer (line 77).
- Modify: `pokedex-mcp/package.json` — bump version (e.g. 1.0.0 → 1.1.0).
- Test: `pokedex-mcp/tests/handlers.test.ts` — assert `number` is stored.

The MCP shares the same Firestore project, so it increments the same `counters/issues` doc — numbers stay globally unique across bot + MCP.

- [ ] **Step 1: Add the failing test**

In `pokedex-mcp/tests/handlers.test.ts`, in the report-bug suite, assert the persisted doc includes a numeric `number` (stub the counter transaction in the existing Firestore mock to return e.g. 100). Match the existing mock style in that file.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd pokedex-mcp && npm test` (vitest)
Expected: FAIL — no `number` on the stored doc.

- [ ] **Step 3: Implement**

In `pokedex-mcp/src/handlers.ts`:

```ts
async function allocateIssueNumber(db: FirebaseFirestore.Firestore): Promise<number> {
  const ref = db.collection("counters").doc("issues");
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const next = (((snap.exists && (snap.data() as any).next) || 0) as number) + 1;
    tx.set(ref, { next });
    return next;
  });
}
```

In both `handleReportBug` and `handleSuggestFeature`, after `const db = getDb();` allocate and add to `issueData`:

```ts
const number = await allocateIssueNumber(db);
// ...add to issueData:
number,
```

In `pokedex-mcp/src/discord.ts` `postToDiscordWebhook`, set the footer to include the number when present:

```ts
footer: { text: issue.number ? `Ticket #${issue.number} | Issue ID: ${issueId} | via Pokedex MCP` : `Issue ID: ${issueId} | via Pokedex MCP` },
```

Bump `pokedex-mcp/package.json` version to `1.1.0`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd pokedex-mcp && npm test` → PASS.
Run: `cd pokedex-mcp && npm run build` (if a build script exists) → no type errors.

- [ ] **Step 5: Commit**

```bash
git add pokedex-mcp/src/handlers.ts pokedex-mcp/src/discord.ts pokedex-mcp/package.json pokedex-mcp/tests/handlers.test.ts
git commit -m "feat(mcp): allocate sequential ticket #number on MCP-created issues"
```

---

## Task 15: Housekeeping — version bump + changelogs + full suite

**Files:**
- Modify: `package.json` (2.9.1 → **2.10.0**)
- Modify: `CHANGELOG.md`
- Modify: `src/commands/changelog.js` (prepend a `2.10.0` entry to the `CHANGELOG` array)

- [ ] **Step 1: Bump `package.json`**

Set `"version": "2.10.0"`.

- [ ] **Step 2: Add `CHANGELOG.md` entry**

Prepend under `# Changelog`:

```markdown
## [2.10.0] - 2026-05-21

### Added
- `/exclude` command (`last N`, `on`, `off`, `status`, `clear`) and a right-click **Exclude from Pokedex** message action — keep mod/bystander chatter out of a report's context.
- Sequential ticket numbers (`#1234`) on every issue, including MCP-reported ones; shown in triage embeds and the closing receipt.
- Structured closing receipt so the reporter knows a ticket was filed and what the team will see.
- Multi-bug splitting — distinct bugs in one thread become separate tickets.

### Changed
- Triage conversation is now author-aware: only the original reporter's messages count as bug info; anyone may still chime in, and the bot stays silent toward non-reporters unless a mod @-mentions it.
- Pokedex identifies itself as a bot on its first message, asks at most three one-at-a-time questions, never asks the user to self-diagnose, and exits to file the report on frustration signals.

### Internal
- Code-enforced question-turn counter, regex frustration classifier, structured sufficiency extraction, and a sequential-counter Firestore transaction.
```

- [ ] **Step 3: Add `src/commands/changelog.js` entry**

Prepend to the `CHANGELOG` array:

```js
{
  version: '2.10.0',
  date: '2026-05-21',
  changes: [
    'New **`/exclude`** command + right-click **Exclude from Pokedex** — keep mod/bystander messages out of a report’s context (`last N`, `on`, `off`, `status`, `clear`)',
    'Every issue now gets a **sequential ticket number** (`#1234`), including MCP reports — shown in triage and the closing receipt',
    'Pokedex now **says it’s a bot up front**, asks **at most 3 one-at-a-time questions**, and **files early** when it has enough or senses frustration',
    'Triage is **author-aware** — only the original reporter’s messages count as bug info; anyone can still chime in, and Pokedex ignores mod chatter unless @-mentioned',
    'Reports with **two distinct bugs** are now split into separate tickets, each with its own number',
    'Every filed report ends with a **structured receipt** so the reporter knows what the team will see',
  ],
},
```

- [ ] **Step 4: Run the full suite (both packages)**

Run: `npm test` → all green.
Run: `cd pokedex-mcp && npm test` → all green.

- [ ] **Step 5: Commit**

```bash
git add package.json CHANGELOG.md src/commands/changelog.js
git commit -m "chore: 2.10.0 — triage overhaul changelog + version bump"
```

---

## Task 16: Open the PR

- [ ] **Step 1: Push and open the PR**

```bash
git push -u origin feat/triage-overhaul
gh pr create --title "feat(triage): author-aware conversation overhaul + /exclude + ticket numbers" \
  --body "Implements docs/superpowers/specs/2026-05-21-pokedex-triage-overhaul-design.md. See CHANGELOG 2.10.0."
```

- [ ] **Step 2: Confirm CI/tests**

Verify `npm test` output in the PR description (paste the pass count). Note any existing tests that were intentionally narrowed (e.g. `processConversationResponse`) and why.

---

## Self-review notes (coverage map)

- Spec #1 prompt → Task 6. #2 turn counter → Tasks 8/9/10. #3 frustration → Tasks 1/8/10. #4 sufficiency → Tasks 5/8. #5 author-aware → Tasks 2/7/10. #6 `/exclude` → Tasks 11/12. #7 receipt → Tasks 4/9. #8 multi-issue → Task 9. Counter → Tasks 3/14. Housekeeping → Tasks 13/15. PR → Task 16.
- Open items carried from the spec: real transcript for the manual test plan; "Expected response" wording defaults to "a human will follow up" (in `buildReceipt`, Task 4).
