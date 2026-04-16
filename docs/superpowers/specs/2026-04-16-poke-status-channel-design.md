# Poke Status Channel & `/status` Command — Design

**Date:** 2026-04-16
**Branch:** `feat/poke-status-channel` (off `main`)
**Target:** new PR

## Summary

Add a `/status` slash command and an auto-updating status channel that surface the health of Poke (status.poke.com) inside Discord. The feature polls the public incident.io JSON summary every 2 minutes, maintains a pinned "current status" message in a dedicated channel, and posts alert messages when components change state or incidents are created/updated/resolved.

## Goals

1. Members can run `/status` and see current Poke health instantly.
2. Admins can run `/status setup` once to create a persistent status channel that stays up to date automatically.
3. Transitions (outages starting, incidents opening/closing) produce a single, clean alert message — optionally pinging a role.
4. The feature is additive: disabled by default, no impact on the rest of the bot when off.

## Non-goals

- Full historical incident archive inside Discord (users can click through to the status page).
- Per-user subscriptions or DM alerts.
- Supporting status pages other than `status.poke.com`.
- Real-time (<1 min) updates — incident.io doesn't update faster than the 2-min poll cadence anyway.

## Data source

**Endpoint:** `https://status.poke.com/api/v2/summary.json`

This is statuspage.io-schema-compatible (incident.io exposes the same shape). A single request returns:

```jsonc
{
  "page": { "id", "name", "url", "updated_at" },
  "status": { "indicator": "none|minor|major|critical|maintenance", "description": "..." },
  "components": [
    { "id", "name", "status": "operational|degraded_performance|partial_outage|major_outage|under_maintenance", "updated_at" }
    // ...7 components as of 2026-04-16: App, Email, Integrations, WhatsApp, SMS, iMessage, iMessage Group Chats
  ],
  "incidents": [
    { "id", "name", "status": "investigating|identified|monitoring|resolved",
      "impact": "none|minor|major|critical", "created_at", "updated_at",
      "incident_updates": [ { "body", "status", "created_at" } ] }
  ]
}
```

One shared fetch per poll tick covers all guilds — no per-guild API fan-out.

## Architecture

### File layout

```
src/
  commands/
    status.js              NEW — /status, /status setup, /status disable
  services/
    statusPoller.js        NEW — orchestrates fetch + diff + Discord updates
    statusFetcher.js       NEW — HTTPS fetch with timeout + retry budget
    statusDiff.js          NEW — pure diff between two snapshots
    statusFormatter.js     NEW — pure embed builders
    statusStore.js         NEW — Firestore CRUD for status_config/{guildId}
  index.js                 EDIT — start cron if status.enabled

config.json                EDIT — add status block
test/
  fixtures/status/         NEW — 4 JSON fixtures
  statusDiff.test.js       NEW
  statusFormatter.test.js  NEW
  statusStore.test.js      NEW
  statusPoller.test.js     NEW
```

### Data flow — cron tick

```
node-cron (*/2 * * * *) → poller.runTick()
  ├─ fetcher.fetchSummary()            (one HTTPS request, shared across guilds)
  ├─ store.listEnabledGuilds()         (Firestore read)
  └─ for each guild:
      ├─ store.getSnapshot(guildId)    (Firestore read)
      ├─ diff = statusDiff.diff(prev, fresh)
      ├─ if pinnedMessageId → edit pinned summary embed
      │  else → send + pin new summary, save pinnedMessageId
      ├─ for each transition in diff:
      │   ├─ post component transition embed (no ping), OR
      │   ├─ post incident embed (+ optional role ping on new-incident only)
      └─ store.saveSnapshot(guildId, fresh)
```

### Data flow — `/status` command

```
interaction → status.js execute
  ├─ poller.runTickForGuild(guildId)   (forces fresh fetch + updates pinned msg if configured)
  └─ interaction.editReply({ embeds:[summaryEmbed], ephemeral: true })
```

`/status` and the cron share `runTick()` — one codepath, no drift. `/status` works even without a configured channel (just replies without editing any pinned message).

## Modules

### `statusFetcher.js`
- `fetchSummary(url, { timeoutMs = 10_000 })` → returns parsed JSON or throws.
- Uses `AbortController` for the timeout. No retries within a call — the next tick is the retry.
- Module-level counter of consecutive failures; exposes `consecutiveFailures()`. The poller uses this to log an error exactly once at the 3rd failure (~6 min) and reset on the first success.

### `statusDiff.js` — pure
- `diff(prev, next)` → `{ overallChanged, componentTransitions, incidentsCreated, incidentsResolved, incidentsUpdated }`.
- `prev` may be `null` (first snapshot). First-snapshot rules:
  - No `componentTransitions` fired (avoids noise).
  - Open incidents in `next.incidents` are reported as `incidentsCreated` so admins see current state.
- Deduplicates by `component.id` / `incident.id`. `incident_updates` are diffed by `created_at` timestamps within each incident.

### `statusFormatter.js` — pure
- `buildSummaryEmbed(summary)` → Discord embed with overall title + color, per-component list, incident count, "last checked" relative timestamp, link button to status page.
- `buildIncidentEmbed(incident, { isNew, isResolved, isUpdate })` → title prefix (🚨/✅/ℹ️), impact field, status field, latest update body (truncated to 500 chars), link.
- `buildTransitionEmbed(component, prevStatus, nextStatus)` → compact single-line embed.
- Severity → color map: `none → 0x2ECC71`, `minor → 0xF1C40F`, `major → 0xE67E22`, `critical → 0xE74C3C`, `maintenance → 0x3498DB`.
- All functions take plain objects and return plain objects / `EmbedBuilder` outputs — no network, no Discord calls.

### `statusStore.js`
- Firestore collection `status_config/{guildId}`:
  ```
  { guildId, channelId, pinnedMessageId, alertRoleId|null,
    lastSummary, knownIncidentIds,
    enabled, updatedAt }
  ```
- Methods: `get(guildId)`, `save(guildId, patch)`, `listEnabled()`, `disable(guildId)`, `clearPinnedMessageId(guildId)`.
- `lastSummary` holds the full previous JSON used for diffing on the next tick; bounded in size by trimming `incident_updates` bodies to 1 KB each before storing.

### `statusPoller.js`
- `start(client)` — registers the `node-cron` job (`*/2 * * * *` from config `status.poll_cron`).
- `runTick(client)` — shared fetch, then iterates enabled guilds.
- `runTickForGuild(client, guildId)` — used by the slash command for on-demand refresh.
- Per-guild work is wrapped in try/catch so one guild's Discord error doesn't abort the tick.

### `status.js` command
- Subcommands:
  - `/status` — on-demand check. Ephemeral reply. Default permission: everyone.
  - `/status setup channel:<channel?> alert_role:<role?>` — creates or adopts a channel, saves config. Default permission: `ManageChannels`. If `channel` is omitted, create `#poke-status` in the same category as the invocation.
  - `/status disable` — removes guild from cron rotation, unpins the summary message. Default permission: `ManageChannels`.
- Subcommand permissions enforced via `default_member_permissions` on the `SlashCommandBuilder`.

## Error handling

### Poke status API failures
- Fetch throws (network / 5xx / timeout): log `warn`, skip the tick. Pinned message untouched (shows stale-but-last-known state + its own "last checked" timestamp).
- Log `error` once when `consecutiveFailures === 3` (6 min of failure). Do **not** post errors to the status channel (noise).
- Counter resets on first success.

### Discord API failures (per-guild)
| Error | Code | Handling |
|-------|------|----------|
| Pinned message deleted | 10008 | clear `pinnedMessageId`, next tick re-creates + re-pins |
| Channel deleted | 10003 | `store.disable(guildId)`, log info, admin must re-setup |
| Missing permissions | 50013 | log once per 24h per guild, skip |
| Any other | — | log, skip this guild this tick |

### Setup validation
- `/status setup` checks the bot has `ViewChannel + SendMessages + ManageMessages + EmbedLinks` in the target channel before saving config. Refuses with a clear error otherwise.
- If `alert_role` is `@everyone` or `@here`, reject.

### First-tick rules
- First ever `/status setup` → snapshot is empty. First tick posts pinned summary; any currently-open incidents emit "Ongoing incident" alerts (one per incident), no component transitions.
- Bot restart mid-outage → loads prior `knownIncidentIds` from Firestore, so resolved-while-offline incidents fire exactly one "resolved" alert; new incidents fire exactly one "new incident" alert.

## Config

`config.json` additions (all overridable via Firestore `config/*` following the two-layer pattern):

```json
"status": {
  "enabled": false,
  "api_url": "https://status.poke.com/api/v2/summary.json",
  "poll_cron": "*/2 * * * *",
  "fetch_timeout_ms": 10000,
  "default_channel_name": "poke-status"
}
```

`status.enabled: false` by default — the cron job does not start and `index.js` skips poller init. The slash command is still registered but `/status setup` refuses with "status feature is disabled globally; set status.enabled true in config".

## Testing

**Runner:** `node:test` (built into Node 18+, zero new deps). Added as `"test": "node --test test/"` in `package.json`.

**Fixtures** (`test/fixtures/status/`):
- `all-operational.json`
- `partial-outage.json`
- `active-incident.json`
- `incident-resolved.json`

**Coverage:**
- `statusFormatter.test.js` (~12 asserts): each severity → color mapping, summary embed field count, incident embed with/without resolve marker, transition embed format.
- `statusDiff.test.js` (~8 scenarios): empty → populated (no component alerts; incidents reported), component flip, new incident appears, incident resolves, incident update added, no change, prev=null behavior, multi-change tick.
- `statusStore.test.js` (~6 cases): injected in-memory Firestore fake. get/save/listEnabled/disable/clearPinnedMessageId, including `listEnabled` skipping disabled rows.
- `statusPoller.test.js` (~4 scenarios): injected fake fetch + fake Discord client + fake store. Verifies pinned-message-create vs edit, transition message posting, role ping on new-incident only, graceful handling when one guild throws while another succeeds.

**What is NOT tested:**
- Real Discord API calls (no test token available).
- Real HTTPS calls to status.poke.com (flakiness, external).

**Regression guarantee:**
- All new files are additive. Only `index.js` and `config.json` are edited.
- With `status.enabled: false` (default), `index.js` skips poller init entirely — no behavior change for existing users.
- Smoke check: run `npm start` locally, confirm bot boots and registers commands as today.

## Delivery

1. Branch: `feat/poke-status-channel` off latest `origin/main`.
2. Commit the spec first (this document).
3. Implementation follows the plan produced by `writing-plans`.
4. Open a single PR titled `feat: add /status command and auto-updating status channel`.
5. PR body includes: screenshots of the embeds (if feasible via a test guild), a note that the feature is disabled by default, and a manual-test checklist.
