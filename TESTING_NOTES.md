# Testing notes

Phase 1 covers pure, exported functions in `src/services/` only.
This file tracks functions that were reviewed but intentionally skipped,
and any friction discovered while testing.

## Skipped — pure but not exported

These are good test candidates but would require changes to `module.exports`
in the source files, which Phase 1 rules forbid (no refactoring).

- `src/services/automod.js`
  - `isSpamming`, `isDuplicateSpam`, `isMentionSpam`, `isExcessiveCaps`,
    `containsBlockedWord`, `containsBlockedLink`, `containsDiscordInvite`,
    `checkMessageFlood`, `trackJoin`, `isRaid`
  - All pure (no I/O). Not in `module.exports`.
- `src/services/openrouter.js`
  - `buildSystemPrompt` — depends on `getConfig('priorities' | 'categories')`,
    so testing it also requires initializing the file-default config loader.
  - `validateResponse` — pure validator; same config dependency via `getConfig`.
  - Not in `module.exports`.
- `src/services/mcpApproval.js`
  - `extractIssueId`, `extractIssueIdFromMessage` — pure regex/string work.
    Not in `module.exports`.

## Skipped — other friction

- **`src/services/automod.js` has a module-level `setInterval`** at line 538
  that starts a 5-minute cleanup timer the moment the file is `require`d.
  Even if the helper functions were exported, importing the module into a
  Vitest run would leak a timer and prevent the process from exiting cleanly
  unless we unref'd it or mocked timers. Noted for Phase 2+ to address.
- **`src/services/triage.js` — `buildDigestEmbed`**: pure and exported, but
  deferred to keep Phase 1 focused. Straightforward follow-up.

## Phase 1 coverage (root `src/`)

Files under test (`tests/services/`):

- `duplicates.test.js` — `jaccardSimilarity`, `findDuplicate`
- `contextEvaluator.test.js` — `buildConversationHistory`
- `triage.test.js` — `buildTriageButtons`, `buildIssueEmbed`
- `mcpApproval.test.js` — `canModerate`

## Phase 2 coverage (`pokedex-mcp/`)

Required a small structural refactor before Phase 2 could begin — none of the
pure helpers or Zod schemas in `pokedex-mcp/src/index.ts` were exported, and
`main()` ran as a side effect of importing the module.

Structural changes made (no behavior changes):

- Extracted pure helpers into `pokedex-mcp/src/validators.ts`:
  `filterIssue`, `sanitizeString`, `isValidDocId`, `isValidScreenshotUrl`,
  `sanitizeRateLimitKey`, and the `MAX_*` length constants.
- Extracted per-tool Zod input shapes into `pokedex-mcp/src/schemas.ts`:
  `reportBugShape`, `suggestFeatureShape`, `checkIssueShape`, `myIssuesShape`,
  `updateIssueShape`, `searchIssuesShape`, `addCommentShape`, `addContextShape`.
- `index.ts` now imports both modules and references the named shapes in
  each `server.registerTool(...)` call.
- `main()` is now gated by an `isEntryPoint` check using
  `fileURLToPath(import.meta.url) === process.argv[1]`, so importing the module
  from tests no longer connects to stdio or starts Express.

Files under test (`pokedex-mcp/tests/`):

- `validators.test.ts` — `filterIssue` (happy + each rejection branch),
  `sanitizeString`, `isValidDocId`, `isValidScreenshotUrl` (allowed hosts,
  subdomains, http rejection, private IPv4 ranges incl. the 172.16–31 carve-out,
  `.local`/`.internal`, IPv6 loopback/ULA), `sanitizeRateLimitKey`.
- `schemas.test.ts` — each of the 8 tool shapes:
  happy path, defaults-fill, enum rejection, missing-required-field rejection,
  and the `reportBug` vs `updateIssue` category/status enum divergence
  (`feature_request` and `wontfix` only allowed in `updateIssue`).

## Phase 2 follow-up: handler extraction + handler tests

Completed the deferred piece: tool handler logic now has unit tests with
`firebase-admin` mocked via `vi.mock()`.

Further structural refactor (no behavior changes):

- `pokedex-mcp/src/rateLimit.ts` (new) — extracted `checkRateLimit` + bucket
  state from `index.ts`. Also exports a `resetRateLimits()` test helper.
- `pokedex-mcp/src/firebase.ts` (new) — extracted `initFirebase` + `getDb`.
- `pokedex-mcp/src/discord.ts` (new) — extracted `postToDiscordWebhook` +
  `postContextToDiscord`.
- `pokedex-mcp/src/handlers.ts` (new) — all 8 tool handler bodies moved into
  named exported async functions (`handleReportBug`, `handleSuggestFeature`,
  `handleCheckIssue`, `handleMyIssues`, `handleUpdateIssue`,
  `handleSearchIssues`, `handleAddComment`, `handleAddContext`). Input types
  derived from the Zod shapes via `z.output<ZodObject<typeof shape>>`.
- `pokedex-mcp/src/index.ts` — slimmed from ~725 lines to ~205. Now just:
  imports, `McpServer` setup, 8 `registerTool(..., handleX)` calls, `main()`,
  and the entry-point guard.

Handler tests (`pokedex-mcp/tests/handlers.test.ts`) cover three
representative handlers with rich logic:

- `handleReportBug`: happy path (asserts on `issueData` written to Firestore +
  webhook call), spam-filter rejection (short title), invalid screenshot URL
  rejection, valid screenshot URL propagation, rate-limit exhaustion at 10/min.
- `handleCheckIssue`: happy path, not-found, slash-in-id rejection,
  rate-limit exhaustion at 30/min.
- `handleUpdateIssue`: happy path (two sequential `doc.get()` calls —
  before and after update), non-MCP source rejection, reporter mismatch
  rejection, close/fix/wontfix restriction (iterated over all three statuses),
  slash-in-id rejection, not-found.

Mocking strategy:

- `vi.mock("firebase-admin", ...)` with a hoisted `mockState` object that
  tests mutate per-case. The fake Firestore exposes `collection().add()`,
  `collection().doc().get()`, `collection().doc().update()`, and chainable
  `where/orderBy/limit/get`. `admin.firestore.FieldValue.serverTimestamp()`
  returns the sentinel string `"MOCK_SERVER_TIMESTAMP"`; `.arrayUnion(...)`
  returns `{ __arrayUnion: items }`. `admin.apps` is a non-empty array so
  `initFirebase()` short-circuits without touching env vars.
- `vi.mock("../src/discord.js", ...)` replaces the Discord helpers with
  `vi.fn()` stubs so handlers don't hit `fetch`. Tests assert on call
  counts for `postToDiscordWebhook`.
- `beforeEach` calls `mockState.reset()` and `resetRateLimits()` to isolate
  cases.

Deferred (not blocking):

- Handler tests for the other 5 tools (`suggestFeature`, `myIssues`,
  `searchIssues`, `addComment`, `addContext`). The three covered handlers
  exercise every *distinct* pattern — multi-step auth checks, rate limiting,
  Firestore reads/writes, sequential `get` calls, external webhook stubs.
  Extending to the rest is mechanical and can be done if specific bug risk
  justifies it.

## Running the tests

From the repo root, `npm test` runs **both** the root services tests and the
pokedex-mcp tests — Vitest auto-discovers every `*.test.{js,ts}` file in the
tree (excluding `node_modules` and `dist`). From `pokedex-mcp/`, `npm test`
runs only the pokedex-mcp suite. Currently: 115 tests total, 7 files.
