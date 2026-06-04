# Moderation & Community Features — Design (v2.12.0)

**Date:** 2026-06-04
**Status:** Approved (pending spec review)

Five mostly-independent additions to the Pokedex Discord bot: server-wide
channel lock/unlock, friendly mute/unmute, crypto-scam auto-moderation, an
`@everyone`-triggers-Pokedex fix, and self-service color roles.

---

## 1. Server-wide lock — `/lockall` + `/unlockall`

### Commands
- **`/lockall now [reason]`** — lock every text channel for `@everyone`.
- **`/lockall exclude add <channel>`** — add a channel to the skip-list.
- **`/lockall exclude remove <channel>`** — remove a channel from the skip-list.
- **`/lockall exclude list`** — show the current skip-list.
- **`/unlockall [reason]`** — undo the last lockdown.

Permission: `ManageChannels` (`setDefaultMemberPermissions`).

### Behavior — "remember what was already locked"
On `/lockall now`:
1. Load the exclude-list from Firestore.
2. For each text channel in the guild **not** in the exclude-list:
   - Read the current `@everyone` `SendMessages` overwrite.
   - If it is **already `false`** (already locked), **skip it and do not record it**.
   - Otherwise set `SendMessages: false` and record the channel ID.
3. Persist the recorded channel IDs to `config/lockdown.lockedChannelIds`,
   plus `lockedAt`, `lockedBy`, `reason`.
4. Reply with a summary embed: `N locked`, `M skipped (already locked)`,
   `K excluded`.

On `/unlockall`:
1. Load `lockedChannelIds` from `config/lockdown`.
2. For each recorded channel that still exists, set `SendMessages: null`
   (inherit). Channels locked *before* the lockdown are not in this list, so
   they stay locked.
3. Clear `lockedChannelIds` and reply with a summary.

If `/unlockall` runs with no recorded lockdown, reply that there is nothing to
restore.

### Service — `src/services/lockdown.js`
Firestore-backed (`config` collection, doc `lockdown`):
- `getExcludedChannels()` → `string[]`
- `addExcludedChannel(id)` / `removeExcludedChannel(id)`
- `recordLockdown({ channelIds, lockedBy, reason })`
- `getLockdown()` → `{ lockedChannelIds, lockedAt, lockedBy, reason } | null`
- `clearLockdown()`

The command files iterate channels and apply overwrites; the service only
handles persisted state. Locking/unlocking each channel is wrapped in
try/catch so one failing channel does not abort the sweep — failures are
counted and reported.

---

## 2. `/mute` + `/unmute` (native timeout)

- **`/mute <user> <duration> [reason]`** — mirrors `/timeout`: same duration
  choices, calls `member.timeout(durationMs, reason)`, logs an `infractions`
  doc of `type: 'mute'`, DMs the user, replies with an embed. Guards:
  member exists, `member.moderatable`.
- **`/unmute <user> [reason]`** — calls `member.timeout(null, reason)` to clear
  the timeout, logs `type: 'unmute'`, DMs the user, replies with an embed.
  If the user is not currently timed out, says so and still clears safely.

Permission: `ModerateMembers`. `/timeout` is left unchanged. `mute.js` and
`unmute.js` are self-contained, matching the one-file-per-command convention.

---

## 3. Crypto-scam blocking (automod check)

### Heuristic — `containsCryptoScam(content)` in `src/services/automod.js`
Returns a short reason string when matched, else `null`. Flags a message when
it matches **either**:
- A **scam phrase pattern** — combinations like free-nitro / steam-gift bait,
  "airdrop" / "claim your" / "giveaway" + crypto terms, "double your
  bitcoin/eth/crypto", seed-phrase / wallet-connect / metamask lures,
  impersonation giveaways ("elon", "binance", "tesla" + "giveaway"). Implemented
  as a list of case-insensitive regexes so it is easy to extend.
- A **scam link shape** — a URL whose host or path matches known
  drainer/gift-scam patterns (e.g. `*-giveaway.*`, `free-nitro.*`,
  `steamcommunity\.com` look-alikes, wallet-connect drainer domains).

Conservative by design: requires a recognizable scam *pattern*, not just the
word "crypto", to limit false positives in normal conversation.

### Wiring
- New config flag `blockCryptoScams: true` in `DEFAULT_CONFIG`.
- New check in `handleMessage` (after blocked-words / before/around the link
  checks), gated on `config.blockCryptoScams`. On match it calls the existing
  `takeAction` path → delete + escalating warn/timeout + mod-log. Existing
  exemptions (mods with ManageMessages, exempt roles/channels) already apply
  because the check sits inside `handleMessage` after those guards.

No new command required; `/automod` already toggles automod on/off. (The new
flag defaults on but only fires when automod itself is enabled.)

---

## 4. `@everyone` no longer triggers Pokedex

**Root cause:** `message.mentions.has(client.user)` defaults to treating an
`@everyone`/`@here` mention (and role mentions the bot belongs to) as a match.
So when a mod posts `@everyone`, Pokedex thinks it was pinged and starts triage.

**Fix:** `src/index.js` (~line 179):
```js
if (!message.mentions.has(client.user, { ignoreEveryone: true, ignoreRoles: true })) return;
```
Only a direct `@Pokedex` user-ping triggers issue creation. Real mentions are
unaffected. One-line change; covered by a unit test of the guard predicate.

---

## 5. Self-service color roles — `/color`

### Subcommands
Open to everyone:
- **`/color list`** — embed listing preset palette names with swatches.
- **`/color set <name>`** — assign the preset color role for `<name>`.
- **`/color hex <code>`** — create-on-demand (or reuse) a custom color role for
  a `#rrggbb` value and assign it.
- **`/color clear`** — remove the user's current bot-managed color role.

Admin only (`ManageRoles`):
- **`/color add <name> <hex>`** — add/update a preset palette entry (creates the
  role if missing).
- **`/color remove <name>`** — remove a preset entry (and delete its role).

The command itself has no `setDefaultMemberPermissions`; the two admin
subcommands check `ManageRoles` at runtime and reject otherwise.

### Service — `src/services/colorRoles.js`
Firestore (`color_roles` collection):
- doc `palette` → `{ <name>: { hex, roleId } }`
- doc `custom` → `{ <hexKey>: roleId }`

Operations:
- `getPalette()`, `addPreset(guild, name, hex)`, `removePreset(guild, name)`
- `getOrCreateCustomRole(guild, hex)` — reuses an existing custom role for that
  hex or creates one named `#rrggbb`.
- `assignColor(member, roleId)` — strips **all** bot-managed color role IDs
  (palette + custom) from the member, then adds `roleId`. Guarantees no
  stacking.
- `clearColor(member)` — removes any bot-managed color role.
- `allColorRoleIds()` — union of palette + custom role IDs, used by assign/clear.

Roles are created with `mentionable: false`, no special permissions, just the
color.

### Seeding
The palette is **pre-seeded** with a ~10-color starter set on first use
(Crimson, Orange, Gold, Green, Teal, Blue, Indigo, Purple, Pink, Gray). Mods
can extend/trim it with `/color add` / `/color remove`.

### Known caveats (surfaced in replies / comments)
- Discord shows the color of a user's **highest colored role**; a higher
  colored role will mask the chosen color.
- The bot can only manage roles **below its own** — the bot's role must sit
  above the color roles, or assignment fails. `/color` replies with a clear
  error if a role edit/create is rejected for this reason.

---

## Wiring & ship steps

- Register `lockall`, `unlockall`, `mute`, `unmute`, `color` in `src/index.js`
  (the `registerCommands` data array **and** the `execute` dispatch map).
- `src/index.js:179` mention-guard fix.
- Bump `package.json` → **2.12.0**.
- Add a `CHANGELOG.md` entry for 2.12.0.
- Add a `CHANGELOG` array entry (version `2.12.0`) in `src/commands/changelog.js`.
- Open a PR.

## Testing

Follow the existing hard-test pattern, **synthetic data only** (no real IDs or
secrets):
- `containsCryptoScam` — positive scam samples + negative normal-conversation
  samples (guard against false positives on the word "crypto").
- Lockdown record logic — already-locked channels excluded from the record;
  unlock only touches recorded channels.
- Color-role selection — assign strips prior color role; clear removes the right
  one; custom hex reuse.
- Mention guard — `@everyone`/role ping does not match, direct ping does.

## Out of scope (YAGNI)

- Per-channel granular lock scheduling / timed auto-unlock.
- Indefinite Muted-role mutes (native timeout chosen).
- Reaction-based color pickers (slash command chosen; `/reactionrole` already
  covers reaction menus).
