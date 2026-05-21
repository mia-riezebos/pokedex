# Pokedex Triage Conversation Overhaul — Design

**Date:** 2026-05-21
**Status:** Approved for planning
**Scope:** PR2 of two. (PR1 = MCP approve-button fix, shipped separately as 2.9.1.)

## Problem

Pokedex collects bug reports from users in Discord threads and forwards them to
engineers. In practice it behaves badly:

1. It doesn't identify itself as a bot up front; users get angry mid-conversation.
2. It over-asks — 6+ rounds of clarifying questions when 2 would do.
3. It asks two questions per message.
4. It keeps asking after clear frustration signals.
5. It echoes filler summaries every turn ("Got it — so you have…").
6. It asks the user to do diagnosis work instead of collecting symptoms.
7. It never produces a closing receipt — the user doesn't know a ticket was filed.
8. It lumps two distinct bugs into one ticket.
9. When mods jump into a thread to help, Pokedex treats their messages as if the
   original reporter said them, polluting the ticket context.

The goal: make Pokedex a disciplined, author-aware triage collector — bias toward
filing early, never tone-deaf, and never confuse mod chatter for bug info.

## Architectural reality (this shapes the whole design)

This bot has **no multi-turn chat session**. Each message in an issue thread
triggers `src/triggers/thread.js`, which:

1. Appends the message to the issue's `threadContext` in Firestore.
2. Debounces 5s.
3. Re-fetches the whole thread (≤500 messages), rebuilds a transcript via
   `buildConversationHistory`, and makes **one** `evaluateIssueContext` LLM call
   (OpenRouter, JSON mode) returning `{ complete, missing, responseMode, reply,
   triageUpdate, reclassify, resolved, resolvedReason }`.
4. `processConversationResponse` posts the reply/react and handles auto-resolve.

Consequences:

- The **issue document already exists** from the moment of report. The bot never
  "creates a ticket" mid-conversation. Therefore **"file the ticket"** in this
  design means: **mark `contextComplete: true`, post the closing receipt in the
  thread, mirror it to the triage embed, and stop asking questions.**
- "Turn counter / frustration / sufficient-info" are **signals computed over the
  transcript and persisted on the issue doc**, enforced in code *around* the
  single LLM call — not a chat-loop state machine.
- Because the full transcript is re-sent each evaluation, author tags and
  exclusions just need to be reflected in how the transcript is built.

## Identity / role definitions

- **OP** = `issue.reporterId` (set at creation: forum → `thread.ownerId`;
  mention → `message.author.id`). Forum issues may have multiple `reporterIds`;
  the first/owner is the canonical OP.
- **MOD** = message author has the `ManageMessages` permission (same test as the
  existing `canModerate`).
- **BOT** = `message.author.bot`.
- **OTHER** = everyone else.

Role is resolved per message using `message.member` when present, falling back to
a member fetch, falling back to `OTHER`. Role resolution is best-effort and must
never throw the evaluation path.

## Data model (Firestore `issues` doc additions)

| Field | Type | Purpose |
|---|---|---|
| `number` | int | Sequential human-facing ticket number (`#1234`). |
| `questionTurns` | int | Count of questions the bot has asked the OP (cap 3). |
| `identityDisclosed` | bool | Whether the bot has posted its identity line in this thread. |
| `contextFields` | object | Latest structured extraction `{ expected, actual, feature, frequency }` (strings or null). |
| `excludedMessageIds` | string[] | Message IDs excluded from context for this thread. |
| `excludeModeUserIds` | string[] | Users whose messages are auto-excluded (exclude-mode on). |
| `filedAt` | ISO string | When the closing receipt was posted. |
| `splitFromIssueId` | string | Set on child issues created by multi-issue splitting. |

A new top-level collection `counters` holds a single doc `counters/issues` with
`{ next: <int> }`, incremented in a Firestore transaction to allocate `number`.

## Changes (in the brief's priority order)

### 1. Rewrite the system prompt
Replace the inline prompt in `evaluateIssueContext` (`src/services/openrouter.js`)
with one adapted to this architecture. It enforces: identity disclosure on first
message; only OP messages are bug info; author tags respected absolutely; the
core loop (have expected/actual/feature/frequency? frustrated? asked 2 already? →
file); one question per message; max 3 question-turns; no diagnosis asks; banned
openers; off-limits behaviors; multi-bug splitting; and the closing receipt
format using `#<number>`.

The evaluator's JSON contract is **extended** (additive, back-compatible):

```jsonc
{
  "complete": boolean,
  "missing": [string],
  "responseMode": "ignore" | "react" | "reply",
  "reply": string | null,
  "triageUpdate": string | null,
  "reclassify": boolean,
  "resolved": boolean,
  "resolvedReason": string | null,

  // new:
  "askedQuestion": boolean,             // true when `reply` contains a question to the OP
  "shouldFile": boolean,                // model thinks there's enough to file now
  "contextFields": {                    // structured extraction (#4)
    "expected": string | null,
    "actual": string | null,
    "feature": string | null,
    "frequency": string | null
  },
  "distinctBugs": [                     // multi-issue (#8); length<=1 = single
    { "summary": string, "expected": string|null, "actual": string|null,
      "feature": string|null, "frequency": string|null }
  ],
  "receipt": {                          // filled only when filing
    "issue": string, "expected": string, "actual": string, "scope": string,
    "expectedResponse": string
  } | null
}
```

Existing callers keep working because the original fields are unchanged and the
`shouldReply` alias is preserved.

### 2. Turn counter (code-enforced)
`questionTurns` persists on the issue doc. It increments **only** when the bot
actually posts a question to the OP (evaluation `askedQuestion === true` AND the
reply was sent). Before generating/sending a question, `thread.js` checks the
counter: at `>= 3`, the bot is **not allowed to ask** — it forces filing instead
(see #7). Enforced in code; the prompt's "max 3" is belt-and-suspenders.

### 3. Frustration classifier
New pure module `src/services/frustration.js`: `detectFrustration(text) ->
{ frustrated: boolean, signal: string|null }`. Regex/keyword check for profanity,
"ridiculous/embarrassing/useless", "is this an ai", "i already told you", "waste
of time/money", ALL-CAPS sentences, "hire me", demands for a human, etc. Runs in
`thread.js` on **OP messages only**, before the LLM call. On a hit: set a
force-file path and skip asking. Regex, not a second LLM call (latency).

### 4. Sufficient-info check
The evaluator returns `contextFields`. `thread.js` persists them and computes
sufficiency in code: when `expected`, `actual`, `feature`, and `frequency` are
all populated → file. Structured (JSON mode) rather than free-form; no extra LLM
round-trip.

### 5. Author-aware message handling (core)
- `buildConversationHistory` gains a `role` per message (`OP|MOD|OTHER|BOT`),
  resolved via `reporterId` + permission check (best-effort, see above).
- The transcript sent to the model tags every line: `[OP] …`, `[MOD] …`,
  `[OTHER] …`, `[BOT] …`, `[EXCLUDED] …`.
- Turn counter, frustration, and sufficiency checks consider **OP messages only**.
- **Anyone may chime in.** The thread is never locked or restricted — mods,
  other users, and bystanders can post freely. Author-awareness only governs what
  the bot *treats as bug info* and *responds to*; it does not gate who can speak.
- The bot does **not** respond to non-OP messages. `thread.js` gates: run the
  reply/ask path only when the triggering message is from the OP. Exception: if a
  **MOD @-mentions** the bot, it may answer a meta question ("what have you
  collected so far?") but never asks the mod questions and never treats the mod's
  text as bug info.
- Non-OP messages are still stored for the record and shown to the model with
  their `[MOD]`/`[OTHER]` tag (so it has situational awareness), but they never
  count toward turn/frustration/sufficiency checks and never become ticket
  content. This replaces today's behavior where every thread message is appended
  and evaluated flat as if the OP had said it.

### 6. `/exclude` + context-menu command
**Single-message exclusion** uses a Discord **message context-menu command**
("Apps → Exclude from Pokedex") — slash commands cannot target a replied-to
message. **Bulk/range/toggle** use a `/exclude` slash command:

- Context-menu **Exclude from Pokedex** → excludes that one message.
- `/exclude last <N>` → exclude the last N messages from the runner's perspective.
- `/exclude on` / `/exclude off` → toggle exclude-mode for the runner (all their
  messages excluded until off). For long mod side-conversations.
- `/exclude status` → show what's currently excluded in this thread.
- `/exclude clear` → reset exclusions for this thread.

**Permissions:** any MOD can exclude any message; the OP can exclude only their
own messages. **Scope:** per-thread/per-issue, stored on the issue doc
(`excludedMessageIds`, `excludeModeUserIds`). **Effect:** excluded messages are
dropped from the LLM transcript (cleaner than an `[EXCLUDED]` tag for the model)
and never count toward turn/frustration/sufficiency. IDs are retained on the doc
so `/exclude status` can report them. Only usable inside an issue thread.

The bot's first-message identity line points users at help; `/help` gains an
`/exclude` entry.

### 7. Structured ticket output (closing receipt)
When filing (sufficiency met, OR frustration, OR turn cap), the bot posts a
single templated receipt — never free-generated:

```
Filed as #<number>.
What the team will see:
- Issue: <one line>
- Expected: <one line>
- Actual: <one line>
- Scope: <frequency / which features>
Expected response: <timeframe>.
```

Fields come from `contextFields` / `receipt`. The same summary is mirrored to the
triage embed, `filedAt` is set, `contextComplete: true`, and no follow-up
questions are asked afterward. Filing is idempotent (guarded by `filedAt`).

### 8. Multi-issue splitting
When `distinctBugs.length >= 2`, create one child issue doc per additional bug
(each gets its own `number`, `splitFromIssueId` back-reference, its own triage
embed), and post one receipt listing all ticket numbers. The originating issue
keeps the first bug.

### Sequential counter (#1234)
`firestore.allocateIssueNumber()` runs a transaction on `counters/issues` and
returns the next int. Called at creation in every path: `pipeline.js` (mention),
`forum.js`, `pokedexbug.js`, `autoscrape.js`, **and** the MCP package
(`pokedex-mcp/src/handlers.ts` — `handleReportBug`, `handleSuggestFeature`). The
triage embed footer and receipts show `#<number>`; issues created before this
change have no `number` and fall back to showing their Firestore ID. The MCP
package gets a matching helper, a version bump, and test updates.

## Module / file impact

| File | Change |
|---|---|
| `src/services/openrouter.js` | New conversational prompt + extended JSON contract + parsing. |
| `src/services/contextEvaluator.js` | Thread author tags in transcript; pass new fields through; filing helper. |
| `src/triggers/thread.js` | Author gating, turn counter, frustration pre-check, sufficiency/file logic, exclusions. |
| `src/services/frustration.js` | **New.** Regex frustration classifier. |
| `src/services/firestore.js` | `allocateIssueNumber`, new field setters, exclusion read/write helpers. |
| `src/services/triage.js` | Show `#number` in embeds; receipt mirroring. |
| `src/commands/exclude.js` | **New.** `/exclude` slash command. |
| `src/commands/excludeContext.js` | **New.** Message context-menu command. |
| `src/index.js` | Register the two new commands; route the context-menu interaction; mod @-mention meta path. |
| `src/commands/help.js` | Document `/exclude`. |
| Creation paths: `pipeline.js`, `forum.js`, `pokedexbug.js`, `autoscrape.js` | Allocate `number` at creation. |
| `pokedex-mcp/src/handlers.ts` + `discord.ts` | Allocate `number`; show it in webhook embed. |
| `CHANGELOG.md`, `src/commands/changelog.js`, `package.json` | 2.10.0 (minor). MCP `package.json` bump. |

## Testing (node:test, `test/`)

New/updated unit tests:

- **Turn counter cap:** at 3 prior questions, the next OP message produces a file
  action, not a question.
- **Frustration classifier:** representative frustrated strings → `frustrated:
  true`; neutral strings → false; ALL-CAPS heuristic; non-OP frustration ignored.
- **Author-role filtering:** a MOD message does not increment `questionTurns` and
  does not trigger a bot reply; an OP message does.
- **`/exclude` subcommands:** `last N`, `on`/`off`, `status`, `clear`, and the
  context-menu single-message path each mutate the doc correctly; OP can't
  exclude others' messages; excluded messages drop from the built transcript.
- **Sufficient-info:** all four `contextFields` present → file; missing one →
  ask (under the turn cap).
- **Multi-issue split:** `distinctBugs` length 2 → two issue docs + one receipt
  naming both numbers.
- **Counter:** `allocateIssueNumber` increments and is monotonic; creation paths
  attach a `number`.
- **Receipt rendering:** templated output matches the fixed format; filing is
  idempotent.

All transcript fixtures use **synthetic data only** (no real user IDs/secrets);
secrets-dependent paths stay env-gated and skipped, per repo policy. Existing
tests must stay green; any I touch will be updated intentionally and noted.

MCP package: extend `pokedex-mcp/tests/handlers.test.ts` to assert a `number` is
allocated and stored.

## Manual test plan (bad → good)

The reference transcript was not attached; these are reconstructed from the
brief's failure modes. To be replaced with real transcript excerpts when provided.

1. **"Is this an AI? Embarrassing." (frustration):** Old: keeps asking. New: first
   message disclosed identity; on the frustration signal it stops, files, and
   posts the receipt.
2. **Mod jumps in to help:** Old: mod's question becomes bug context and the bot
   replies to the mod. New: mod line tagged `[MOD]`, ignored for signals, bot
   stays silent unless @-mentioned for a meta question.
3. **Two bugs in one report:** Old: one muddled ticket. New: two tickets filed,
   receipt names `#A` and `#B`.

## Decisions locked

- Delivery: two PRs. (PR1 = approve fix, done.)
- Ticket reference: real sequential `#number` via a Firestore counter, everywhere
  including MCP-created issues.
- `/exclude`: message context-menu for single messages + `/exclude` slash for
  `last N`/`on`/`off`/`status`/`clear`.

## Open / to confirm

- Reference transcript still needed to finalize the manual test plan with real
  examples.
- "Expected response" timeframe wording in the receipt — default to a generic
  line ("a human will follow up") unless a concrete SLA is provided.
