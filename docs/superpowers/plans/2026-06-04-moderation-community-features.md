# Moderation & Community Features Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add server-wide channel lock/unlock, friendly mute/unmute, crypto-scam auto-moderation, an `@everyone`-no-longer-triggers-Pokedex fix, and self-service color roles to the Pokedex Discord bot.

**Architecture:** Five mostly-independent features. Pure, testable logic (scam detection, lockdown planning, hex/role helpers, mention guard) lives in service modules and is unit-tested with `node:test`; Discord-side command shells stay thin and follow the existing one-file-per-command pattern. Persisted state goes in Firestore via small service helpers.

**Tech Stack:** Node 18+ (CommonJS), discord.js 14, firebase-admin (Firestore), `node:test` + `node:assert/strict`.

**Spec:** `docs/superpowers/specs/2026-06-04-moderation-community-features-design.md`

**Conventions to follow:**
- Tests: `node --test` style. `const { test } = require('node:test');` and `const assert = require('node:assert/strict');`. Pure functions, hand-rolled mocks, no network/secrets (synthetic data only).
- Commands: one file per command exporting `{ data, execute }`; `data` is a `SlashCommandBuilder`.
- Run the whole suite with: `npm test`
- Commit after each task.

---

## File Structure

**Create:**
- `src/services/lockdown.js` — lockdown pure planners + Firestore state (exclude-list, last-lockdown record)
- `src/commands/lockall.js` — `/lockall now | exclude add|remove|list`
- `src/commands/unlockall.js` — `/unlockall`
- `src/commands/mute.js` — `/mute`
- `src/commands/unmute.js` — `/unmute`
- `src/services/colorRoles.js` — color pure helpers + Firestore palette/custom state
- `src/commands/color.js` — `/color list|set|hex|clear|add|remove`
- `test/cryptoScam.test.js`, `test/lockdownPlan.test.js`, `test/mentionGuard.test.js`, `test/colorRoles.test.js`

**Modify:**
- `src/services/automod.js` — add `containsCryptoScam`, `blockCryptoScams` flag, new check in `handleMessage`
- `src/triggers/mention.js` — add `mentionsBotDirectly` helper
- `src/index.js` — use `mentionsBotDirectly`; register 5 new commands
- `package.json` — version → 2.12.0
- `CHANGELOG.md` — 2.12.0 entry
- `src/commands/changelog.js` — 2.12.0 array entry

---

## Task 1: Crypto-scam detection

**Files:**
- Modify: `src/services/automod.js`
- Test: `test/cryptoScam.test.js`

- [ ] **Step 1: Write the failing test**

Create `test/cryptoScam.test.js`:

```js
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/cryptoScam.test.js`
Expected: FAIL — `containsCryptoScam is not a function`.

- [ ] **Step 3: Add the detector to `src/services/automod.js`**

Add near the other detection functions (after `containsDiscordInvite`, around line 278):

```js
// --- Crypto-scam detection ---

const CRYPTO_SCAM_PATTERNS = [
  /\b(free|claim)\b[^\n]{0,40}\b(nitro|discord nitro|steam gift|gift card)\b/i,
  /\bnitro\b[^\n]{0,20}\bfree\b/i,
  /\b(airdrop|giveaway|claim)\b[^\n]{0,40}\b(crypto|bitcoin|btc|eth|ethereum|usdt|bnb|solana|sol|token|nft)\b/i,
  /\b(crypto|bitcoin|btc|eth|ethereum|usdt|bnb|solana|nft)\b[^\n]{0,40}\b(airdrop|giveaway|claim now|free)\b/i,
  /\bdouble (your |the )?(money|bitcoin|btc|eth|ethereum|crypto|deposit|investment)\b/i,
  /\b(send|deposit)\b[^\n]{0,30}\b(get|receive|back)\b[^\n]{0,20}\b(double|2x|twice)\b/i,
  /\b(seed phrase|recovery phrase|private key|connect (your )?wallet|validate (your )?wallet|wallet ?connect|sync (your )?wallet)\b/i,
  /\b(elon|musk|tesla|binance|coinbase)\b[^\n]{0,40}\b(giveaway|airdrop|double|free)\b/i,
];

const CRYPTO_SCAM_LINK_PATTERNS = [
  /https?:\/\/[^\s<]*free[-.]?nitro[^\s<]*/i,
  /https?:\/\/[^\s<]*(giveaway|airdrop|claim)[^\s<]*\.(xyz|top|live|click|gift|app)\b/i,
  /https?:\/\/[^\s<]*(discord|steamcommunity)[^\s<]*\.(ru|xyz|gift|top|click|live)\b/i,
  /https?:\/\/[^\s<]*wallet[-.]?connect[^\s<]*/i,
];

function containsCryptoScam(content) {
  if (!content) return null;
  for (const re of CRYPTO_SCAM_PATTERNS) {
    if (re.test(content)) return 'Crypto/giveaway scam pattern';
  }
  for (const re of CRYPTO_SCAM_LINK_PATTERNS) {
    if (re.test(content)) return 'Suspected scam link';
  }
  return null;
}
```

Add `containsCryptoScam` to `module.exports` at the bottom of the file (alongside the other exports like `getBlocklist`).

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/cryptoScam.test.js`
Expected: PASS (2 tests).

- [ ] **Step 5: Wire the check into `handleMessage` and add the config flag**

In `DEFAULT_CONFIG` (around line 30), add after `blockInviteLinks: true,`:

```js
  blockCryptoScams: true,
```

In `handleMessage`, immediately after the "Check 4: Blocked words" block (after line ~418, before "Check 5: Discord invite links"), insert:

```js
  // --- Check 4b: Crypto/giveaway scams ---
  if (config.blockCryptoScams) {
    const scamReason = containsCryptoScam(content);
    if (scamReason) {
      return await takeAction(message, config, {
        userId, username, guildId,
        reason: scamReason,
        evidence: content.slice(0, 200),
      });
    }
  }
```

- [ ] **Step 6: Run the full suite**

Run: `npm test`
Expected: PASS (all existing tests + the 2 new ones).

- [ ] **Step 7: Commit**

```bash
git add src/services/automod.js test/cryptoScam.test.js
git commit -m "feat(automod): crypto/giveaway scam detection"
```

---

## Task 2: Lockdown planning logic (pure)

**Files:**
- Create: `src/services/lockdown.js`
- Test: `test/lockdownPlan.test.js`

- [ ] **Step 1: Write the failing test**

Create `test/lockdownPlan.test.js`:

```js
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { planLockdown, planUnlock } = require('../src/services/lockdown');

test('planLockdown locks only open, non-excluded channels', () => {
  const channels = [
    { id: 'a', locked: false },
    { id: 'b', locked: true },   // already locked beforehand
    { id: 'c', locked: false },
    { id: 'd', locked: false },  // excluded
  ];
  const plan = planLockdown(channels, ['d']);
  assert.deepEqual(plan.toLock, ['a', 'c']);
  assert.deepEqual(plan.skipped, ['b']);
  assert.deepEqual(plan.excluded, ['d']);
});

test('planUnlock only touches recorded channels that still exist', () => {
  const recorded = ['a', 'c', 'z']; // z was deleted since
  const existing = ['a', 'b', 'c', 'd'];
  assert.deepEqual(planUnlock(recorded, existing), ['a', 'c']);
});

test('planUnlock handles empty record', () => {
  assert.deepEqual(planUnlock([], ['a']), []);
  assert.deepEqual(planUnlock(undefined, ['a']), []);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/lockdownPlan.test.js`
Expected: FAIL — cannot find module `../src/services/lockdown`.

- [ ] **Step 3: Create `src/services/lockdown.js` with the pure planners**

```js
const admin = require('firebase-admin');

function getDb() {
  return admin.firestore();
}

const DOC = () => getDb().collection('config').doc('lockdown');

// --- Pure planners (unit-tested) ---

function planLockdown(channels, excludeIds = []) {
  const exclude = new Set(excludeIds);
  const toLock = [];
  const skipped = [];
  const excluded = [];
  for (const ch of channels) {
    if (exclude.has(ch.id)) { excluded.push(ch.id); continue; }
    if (ch.locked) { skipped.push(ch.id); continue; }
    toLock.push(ch.id);
  }
  return { toLock, skipped, excluded };
}

function planUnlock(lockedChannelIds = [], existingChannelIds = []) {
  const existing = new Set(existingChannelIds);
  return (lockedChannelIds || []).filter(id => existing.has(id));
}

module.exports = { planLockdown, planUnlock };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/lockdownPlan.test.js`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/services/lockdown.js test/lockdownPlan.test.js
git commit -m "feat(lockdown): pure lock/unlock planners"
```

---

## Task 3: Lockdown Firestore state

**Files:**
- Modify: `src/services/lockdown.js`

- [ ] **Step 1: Add Firestore helpers**

Append to `src/services/lockdown.js`, before `module.exports`:

```js
// --- Firestore state ---

async function getExcludedChannels() {
  try {
    const doc = await DOC().get();
    return doc.exists ? (doc.data().excludeChannelIds || []) : [];
  } catch {
    return [];
  }
}

async function addExcludedChannel(id) {
  await DOC().set(
    { excludeChannelIds: admin.firestore.FieldValue.arrayUnion(id) },
    { merge: true },
  );
}

async function removeExcludedChannel(id) {
  await DOC().set(
    { excludeChannelIds: admin.firestore.FieldValue.arrayRemove(id) },
    { merge: true },
  );
}

async function recordLockdown({ channelIds, lockedBy, reason }) {
  await DOC().set({
    lockedChannelIds: channelIds,
    lockedBy,
    reason: reason || null,
    lockedAt: admin.firestore.FieldValue.serverTimestamp(),
  }, { merge: true });
}

async function getLockdown() {
  try {
    const doc = await DOC().get();
    if (!doc.exists) return null;
    const data = doc.data();
    return { ...data, lockedChannelIds: data.lockedChannelIds || [] };
  } catch {
    return null;
  }
}

async function clearLockdown() {
  await DOC().set({ lockedChannelIds: [] }, { merge: true });
}
```

Update `module.exports` to:

```js
module.exports = {
  planLockdown,
  planUnlock,
  getExcludedChannels,
  addExcludedChannel,
  removeExcludedChannel,
  recordLockdown,
  getLockdown,
  clearLockdown,
};
```

- [ ] **Step 2: Verify the module loads**

Run: `node -e "require('./src/services/lockdown.js'); console.log('ok')"`
Expected: prints `ok`.

- [ ] **Step 3: Commit**

```bash
git add src/services/lockdown.js
git commit -m "feat(lockdown): Firestore exclude-list and lockdown record"
```

---

## Task 4: `/lockall` and `/unlockall` commands

**Files:**
- Create: `src/commands/lockall.js`
- Create: `src/commands/unlockall.js`

- [ ] **Step 1: Create `src/commands/lockall.js`**

```js
const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits, ChannelType } = require('discord.js');
const lockdown = require('../services/lockdown');

const commandData = new SlashCommandBuilder()
  .setName('lockall')
  .setDescription('Lock every text channel at once (server lockdown)')
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
  .addSubcommand(sub =>
    sub.setName('now')
      .setDescription('Lock all text channels except excluded ones')
      .addStringOption(o => o.setName('reason').setDescription('Reason for the lockdown').setRequired(false)))
  .addSubcommandGroup(group =>
    group.setName('exclude')
      .setDescription('Manage channels skipped by /lockall')
      .addSubcommand(sub =>
        sub.setName('add').setDescription('Skip a channel during lockdown')
          .addChannelOption(o => o.setName('channel').setDescription('Channel to skip').addChannelTypes(ChannelType.GuildText).setRequired(true)))
      .addSubcommand(sub =>
        sub.setName('remove').setDescription('Stop skipping a channel')
          .addChannelOption(o => o.setName('channel').setDescription('Channel to stop skipping').addChannelTypes(ChannelType.GuildText).setRequired(true)))
      .addSubcommand(sub =>
        sub.setName('list').setDescription('Show channels currently skipped')));

function isLocked(channel, guild) {
  const overwrite = channel.permissionOverwrites.cache.get(guild.roles.everyone.id);
  if (!overwrite) return false;
  // SendMessages explicitly denied?
  return overwrite.deny.has(PermissionFlagsBits.SendMessages);
}

async function execute(interaction) {
  const group = interaction.options.getSubcommandGroup(false);
  const sub = interaction.options.getSubcommand();

  if (group === 'exclude') {
    const channel = sub === 'list' ? null : interaction.options.getChannel('channel');
    if (sub === 'add') {
      await lockdown.addExcludedChannel(channel.id);
      return interaction.reply({ content: `${channel} will be skipped during lockdowns.`, ephemeral: true });
    }
    if (sub === 'remove') {
      await lockdown.removeExcludedChannel(channel.id);
      return interaction.reply({ content: `${channel} will no longer be skipped.`, ephemeral: true });
    }
    // list
    const ids = await lockdown.getExcludedChannels();
    const list = ids.length ? ids.map(id => `<#${id}>`).join(', ') : '_none_';
    return interaction.reply({ content: `**Excluded channels:** ${list}`, ephemeral: true });
  }

  // sub === 'now'
  await interaction.deferReply();
  const reason = interaction.options.getString('reason') || 'No reason provided';
  const excludeIds = await lockdown.getExcludedChannels();

  const textChannels = interaction.guild.channels.cache.filter(c => c.type === ChannelType.GuildText);
  const channelsState = textChannels.map(c => ({ id: c.id, locked: isLocked(c, interaction.guild) }));
  const plan = lockdown.planLockdown(channelsState, excludeIds);

  let failed = 0;
  const locked = [];
  for (const id of plan.toLock) {
    const channel = textChannels.get(id);
    try {
      await channel.permissionOverwrites.edit(interaction.guild.roles.everyone, { SendMessages: false });
      locked.push(id);
    } catch (err) {
      console.error(`lockall: failed to lock ${id}:`, err.message);
      failed++;
    }
  }

  await lockdown.recordLockdown({ channelIds: locked, lockedBy: interaction.user.id, reason });

  const embed = new EmbedBuilder()
    .setTitle('🔒 Server Locked Down')
    .setColor(0xff0000)
    .setDescription(`Locked **${locked.length}** channel(s).`)
    .addFields(
      { name: 'Already locked (left as-is)', value: String(plan.skipped.length), inline: true },
      { name: 'Excluded', value: String(plan.excluded.length), inline: true },
      { name: 'Failed', value: String(failed), inline: true },
      { name: 'Reason', value: reason },
    )
    .setFooter({ text: 'Use /unlockall to restore only the channels this lockdown changed.' })
    .setTimestamp();
  await interaction.editReply({ embeds: [embed] });
}

module.exports = { data: commandData, execute };
```

- [ ] **Step 2: Create `src/commands/unlockall.js`**

```js
const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const lockdown = require('../services/lockdown');

const commandData = new SlashCommandBuilder()
  .setName('unlockall')
  .setDescription('Undo the last /lockall — restores only the channels it locked')
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
  .addStringOption(o => o.setName('reason').setDescription('Reason for unlocking').setRequired(false));

async function execute(interaction) {
  await interaction.deferReply();
  const record = await lockdown.getLockdown();

  if (!record || record.lockedChannelIds.length === 0) {
    return interaction.editReply('There is no recorded lockdown to undo.');
  }

  const existingIds = interaction.guild.channels.cache.map(c => c.id);
  const toUnlock = lockdown.planUnlock(record.lockedChannelIds, existingIds);

  let failed = 0;
  let unlocked = 0;
  for (const id of toUnlock) {
    const channel = interaction.guild.channels.cache.get(id);
    try {
      await channel.permissionOverwrites.edit(interaction.guild.roles.everyone, { SendMessages: null });
      unlocked++;
    } catch (err) {
      console.error(`unlockall: failed to unlock ${id}:`, err.message);
      failed++;
    }
  }

  await lockdown.clearLockdown();

  const embed = new EmbedBuilder()
    .setTitle('🔓 Server Unlocked')
    .setColor(0x00cc00)
    .setDescription(`Restored **${unlocked}** channel(s). Channels locked before the lockdown were left locked.`)
    .addFields({ name: 'Failed', value: String(failed), inline: true })
    .setTimestamp();
  await interaction.editReply({ embeds: [embed] });
}

module.exports = { data: commandData, execute };
```

- [ ] **Step 3: Verify both modules load**

Run: `node -e "require('./src/commands/lockall.js'); require('./src/commands/unlockall.js'); console.log('ok')"`
Expected: prints `ok`.

- [ ] **Step 4: Commit**

```bash
git add src/commands/lockall.js src/commands/unlockall.js
git commit -m "feat: /lockall and /unlockall server lockdown commands"
```

---

## Task 5: `/mute` and `/unmute` commands

**Files:**
- Create: `src/commands/mute.js`
- Create: `src/commands/unmute.js`

- [ ] **Step 1: Create `src/commands/mute.js`**

```js
const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const admin = require('firebase-admin');

function getDb() {
  return admin.firestore();
}

const DURATIONS = {
  '60s': 60_000,
  '5m': 5 * 60_000,
  '10m': 10 * 60_000,
  '30m': 30 * 60_000,
  '1h': 60 * 60_000,
  '6h': 6 * 60 * 60_000,
  '12h': 12 * 60 * 60_000,
  '1d': 24 * 60 * 60_000,
  '3d': 3 * 24 * 60 * 60_000,
  '7d': 7 * 24 * 60 * 60_000,
  '14d': 14 * 24 * 60 * 60_000,
  '28d': 28 * 24 * 60 * 60_000,
};

const commandData = new SlashCommandBuilder()
  .setName('mute')
  .setDescription('Mute a user for a set time (Discord timeout)')
  .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
  .addUserOption(opt => opt.setName('user').setDescription('User to mute').setRequired(true))
  .addStringOption(opt =>
    opt.setName('duration').setDescription('How long').setRequired(true)
      .addChoices(
        { name: '60 seconds', value: '60s' },
        { name: '5 minutes', value: '5m' },
        { name: '10 minutes', value: '10m' },
        { name: '30 minutes', value: '30m' },
        { name: '1 hour', value: '1h' },
        { name: '6 hours', value: '6h' },
        { name: '12 hours', value: '12h' },
        { name: '1 day', value: '1d' },
        { name: '3 days', value: '3d' },
        { name: '7 days', value: '7d' },
        { name: '14 days', value: '14d' },
        { name: '28 days', value: '28d' },
      ))
  .addStringOption(opt => opt.setName('reason').setDescription('Reason for mute').setRequired(false));

async function execute(interaction) {
  await interaction.deferReply();
  const target = interaction.options.getUser('user');
  const durationKey = interaction.options.getString('duration');
  const reason = interaction.options.getString('reason') || 'No reason provided';
  const durationMs = DURATIONS[durationKey];

  const member = await interaction.guild.members.fetch(target.id).catch(() => null);
  if (!member) return interaction.editReply('Could not find that member in the server.');
  if (!member.moderatable) return interaction.editReply('I cannot mute this user. They may have higher permissions than me.');

  try {
    await member.timeout(durationMs, reason);
  } catch (err) {
    console.error('Failed to mute:', err);
    return interaction.editReply('Failed to mute this user. Please check bot permissions and try again.');
  }

  await getDb().collection('infractions').add({
    type: 'mute',
    userId: target.id,
    username: target.username,
    guildId: interaction.guild.id,
    reason,
    duration: durationKey,
    moderatorId: interaction.user.id,
    moderatorName: interaction.user.username,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  const embed = new EmbedBuilder()
    .setTitle('🔇 User Muted')
    .setColor(0xe67e22)
    .addFields(
      { name: 'User', value: `${target} (${target.username})`, inline: true },
      { name: 'Duration', value: durationKey, inline: true },
      { name: 'Moderator', value: `${interaction.user}`, inline: true },
      { name: 'Reason', value: reason },
    )
    .setTimestamp();

  try {
    await target.send({ embeds: [new EmbedBuilder()
      .setTitle(`🔇 You have been muted in ${interaction.guild.name}`)
      .setColor(0xe67e22)
      .addFields({ name: 'Duration', value: durationKey }, { name: 'Reason', value: reason })
      .setTimestamp()] });
  } catch {
    // Can't DM user
  }

  await interaction.editReply({ embeds: [embed] });
}

module.exports = { data: commandData, execute };
```

- [ ] **Step 2: Create `src/commands/unmute.js`**

```js
const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const admin = require('firebase-admin');

function getDb() {
  return admin.firestore();
}

const commandData = new SlashCommandBuilder()
  .setName('unmute')
  .setDescription('Remove a user\'s mute (clear their timeout)')
  .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
  .addUserOption(opt => opt.setName('user').setDescription('User to unmute').setRequired(true))
  .addStringOption(opt => opt.setName('reason').setDescription('Reason for unmuting').setRequired(false));

async function execute(interaction) {
  await interaction.deferReply();
  const target = interaction.options.getUser('user');
  const reason = interaction.options.getString('reason') || 'No reason provided';

  const member = await interaction.guild.members.fetch(target.id).catch(() => null);
  if (!member) return interaction.editReply('Could not find that member in the server.');

  const wasMuted = member.isCommunicationDisabled();

  try {
    await member.timeout(null, reason);
  } catch (err) {
    console.error('Failed to unmute:', err);
    return interaction.editReply('Failed to unmute this user. Please check bot permissions and try again.');
  }

  await getDb().collection('infractions').add({
    type: 'unmute',
    userId: target.id,
    username: target.username,
    guildId: interaction.guild.id,
    reason,
    moderatorId: interaction.user.id,
    moderatorName: interaction.user.username,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  const embed = new EmbedBuilder()
    .setTitle('🔊 User Unmuted')
    .setColor(0x00cc00)
    .addFields(
      { name: 'User', value: `${target} (${target.username})`, inline: true },
      { name: 'Moderator', value: `${interaction.user}`, inline: true },
      { name: 'Reason', value: reason },
    )
    .setDescription(wasMuted ? '' : '_Note: this user was not currently muted._')
    .setTimestamp();

  await interaction.editReply({ embeds: [embed] });
}

module.exports = { data: commandData, execute };
```

- [ ] **Step 3: Verify both modules load**

Run: `node -e "require('./src/commands/mute.js'); require('./src/commands/unmute.js'); console.log('ok')"`
Expected: prints `ok`.

- [ ] **Step 4: Commit**

```bash
git add src/commands/mute.js src/commands/unmute.js
git commit -m "feat: /mute and /unmute commands"
```

---

## Task 6: `@everyone` no longer triggers Pokedex

**Files:**
- Modify: `src/triggers/mention.js`
- Modify: `src/index.js:179`
- Test: `test/mentionGuard.test.js`

- [ ] **Step 1: Write the failing test**

Create `test/mentionGuard.test.js`:

```js
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { mentionsBotDirectly } = require('../src/triggers/mention');

function fakeMessage(directHit) {
  return {
    mentions: {
      // Mirror discord.js: has(user, options). Our helper must pass
      // { ignoreEveryone: true, ignoreRoles: true }. We assert those are set,
      // then return whether the bot was *directly* pinged.
      has(user, options) {
        assert.equal(options.ignoreEveryone, true);
        assert.equal(options.ignoreRoles, true);
        return directHit;
      },
    },
  };
}

const BOT = { id: 'bot1' };

test('direct @bot ping counts as a mention', () => {
  assert.equal(mentionsBotDirectly(fakeMessage(true), BOT), true);
});

test('@everyone / role ping does not count', () => {
  assert.equal(mentionsBotDirectly(fakeMessage(false), BOT), false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/mentionGuard.test.js`
Expected: FAIL — `mentionsBotDirectly is not a function`.

- [ ] **Step 3: Add the helper to `src/triggers/mention.js`**

Add this function near the top (after the imports):

```js
// Only a direct @bot user-ping should trigger issue creation.
// discord.js counts @everyone/@here and role pings as a match by default,
// which made a mod's @everyone spin up triage. Ignore those.
function mentionsBotDirectly(message, botUser) {
  return message.mentions.has(botUser, { ignoreEveryone: true, ignoreRoles: true });
}
```

Update the exports line at the bottom:

```js
module.exports = { handleMention, extractParentContext, mentionsBotDirectly };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/mentionGuard.test.js`
Expected: PASS (2 tests).

- [ ] **Step 5: Use the helper in `src/index.js`**

At the top of `src/index.js`, update the mention import (line 6) from:

```js
const { handleMention } = require('./triggers/mention');
```

to:

```js
const { handleMention, mentionsBotDirectly } = require('./triggers/mention');
```

Then replace line ~179:

```js
  if (!message.mentions.has(client.user)) return;
```

with:

```js
  if (!mentionsBotDirectly(message, client.user)) return;
```

- [ ] **Step 6: Verify index loads (syntax check)**

Run: `node --check src/index.js`
Expected: no output (valid syntax).

- [ ] **Step 7: Commit**

```bash
git add src/triggers/mention.js src/index.js test/mentionGuard.test.js
git commit -m "fix: @everyone and role pings no longer trigger Pokedex triage"
```

---

## Task 7: Color-role helpers and service

**Files:**
- Create: `src/services/colorRoles.js`
- Test: `test/colorRoles.test.js`

- [ ] **Step 1: Write the failing test**

Create `test/colorRoles.test.js`:

```js
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { normalizeHex, rolesToStrip, DEFAULT_PALETTE } = require('../src/services/colorRoles');

test('normalizeHex accepts 6-digit, 3-digit, with/without #', () => {
  assert.equal(normalizeHex('#FF8800'), '#ff8800');
  assert.equal(normalizeHex('ff8800'), '#ff8800');
  assert.equal(normalizeHex('#f80'), '#ff8800');
  assert.equal(normalizeHex('  #AABBCC '), '#aabbcc');
});

test('normalizeHex rejects junk', () => {
  assert.equal(normalizeHex('red'), null);
  assert.equal(normalizeHex('#12345'), null);
  assert.equal(normalizeHex(''), null);
  assert.equal(normalizeHex(null), null);
});

test('rolesToStrip returns only the member roles that are color roles', () => {
  const memberRoles = ['r1', 'colorA', 'r2', 'colorB'];
  const colorRoleIds = ['colorA', 'colorB', 'colorC'];
  assert.deepEqual(rolesToStrip(memberRoles, colorRoleIds), ['colorA', 'colorB']);
});

test('default palette has the starter colors', () => {
  assert.ok(DEFAULT_PALETTE.Crimson);
  assert.equal(Object.keys(DEFAULT_PALETTE).length, 10);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/colorRoles.test.js`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Create `src/services/colorRoles.js`**

```js
const admin = require('firebase-admin');

function getDb() {
  return admin.firestore();
}

const COL = () => getDb().collection('color_roles');

const DEFAULT_PALETTE = {
  Crimson: '#dc143c',
  Orange: '#e67e22',
  Gold: '#f1c40f',
  Green: '#2ecc71',
  Teal: '#1abc9c',
  Blue: '#3498db',
  Indigo: '#5865f2',
  Purple: '#9b59b6',
  Pink: '#e91e63',
  Gray: '#95a5a6',
};

// --- Pure helpers (unit-tested) ---

function normalizeHex(input) {
  if (!input) return null;
  let s = String(input).trim().replace(/^#/, '');
  if (/^[0-9a-fA-F]{3}$/.test(s)) {
    s = s.split('').map(c => c + c).join('');
  }
  if (!/^[0-9a-fA-F]{6}$/.test(s)) return null;
  return '#' + s.toLowerCase();
}

function rolesToStrip(memberRoleIds, colorRoleIds) {
  const colorSet = new Set(colorRoleIds);
  return memberRoleIds.filter(id => colorSet.has(id));
}

// --- Firestore palette/custom state ---

async function getPalette() {
  try {
    const doc = await COL().doc('palette').get();
    if (doc.exists && doc.data().colors && Object.keys(doc.data().colors).length) {
      return doc.data().colors;
    }
  } catch {
    // fall through to seed
  }
  return null; // caller seeds defaults if null
}

async function setPaletteEntry(name, hex, roleId) {
  await COL().doc('palette').set(
    { colors: { [name]: { hex, roleId } } },
    { merge: true },
  );
}

async function deletePaletteEntry(name) {
  await COL().doc('palette').set(
    { colors: { [name]: admin.firestore.FieldValue.delete() } },
    { merge: true },
  );
}

async function getCustomMap() {
  try {
    const doc = await COL().doc('custom').get();
    return doc.exists ? (doc.data().byHex || {}) : {};
  } catch {
    return {};
  }
}

async function setCustomEntry(hex, roleId) {
  await COL().doc('custom').set(
    { byHex: { [hex.replace(/[.#]/g, '_')]: roleId } },
    { merge: true },
  );
}

// Union of all bot-managed color role IDs (palette + custom).
async function allColorRoleIds() {
  const ids = [];
  const palette = (await getPalette()) || {};
  for (const v of Object.values(palette)) if (v.roleId) ids.push(v.roleId);
  const custom = await getCustomMap();
  for (const id of Object.values(custom)) ids.push(id);
  return ids;
}

module.exports = {
  DEFAULT_PALETTE,
  normalizeHex,
  rolesToStrip,
  getPalette,
  setPaletteEntry,
  deletePaletteEntry,
  getCustomMap,
  setCustomEntry,
  allColorRoleIds,
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test test/colorRoles.test.js`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/services/colorRoles.js test/colorRoles.test.js
git commit -m "feat(colorRoles): hex/role helpers and Firestore palette state"
```

---

## Task 8: `/color` command

**Files:**
- Create: `src/commands/color.js`

- [ ] **Step 1: Create `src/commands/color.js`**

```js
const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const colorRoles = require('../services/colorRoles');

const commandData = new SlashCommandBuilder()
  .setName('color')
  .setDescription('Pick a color role for your name')
  .addSubcommand(sub => sub.setName('list').setDescription('Show available preset colors'))
  .addSubcommand(sub =>
    sub.setName('set').setDescription('Use a preset color')
      .addStringOption(o => o.setName('name').setDescription('Preset color name').setRequired(true)))
  .addSubcommand(sub =>
    sub.setName('hex').setDescription('Use a custom hex color')
      .addStringOption(o => o.setName('code').setDescription('e.g. #ff8800').setRequired(true)))
  .addSubcommand(sub => sub.setName('clear').setDescription('Remove your color role'))
  .addSubcommand(sub =>
    sub.setName('add').setDescription('(Mods) Add a preset color')
      .addStringOption(o => o.setName('name').setDescription('Color name').setRequired(true))
      .addStringOption(o => o.setName('code').setDescription('Hex, e.g. #ff8800').setRequired(true)))
  .addSubcommand(sub =>
    sub.setName('remove').setDescription('(Mods) Remove a preset color')
      .addStringOption(o => o.setName('name').setDescription('Color name').setRequired(true)));

// Ensure the palette exists, seeding defaults the first time.
async function ensurePalette(guild) {
  let palette = await colorRoles.getPalette();
  if (palette) return palette;
  palette = {};
  for (const [name, hex] of Object.entries(colorRoles.DEFAULT_PALETTE)) {
    const role = await guild.roles.create({ name, color: hex, mentionable: false, reason: 'Color role palette seed' });
    palette[name] = { hex, roleId: role.id };
    await colorRoles.setPaletteEntry(name, hex, role.id);
  }
  return palette;
}

async function applyColor(interaction, roleId) {
  const member = interaction.member;
  const allIds = await colorRoles.allColorRoleIds();
  const toStrip = colorRoles.rolesToStrip([...member.roles.cache.keys()], allIds);
  try {
    if (toStrip.length) await member.roles.remove(toStrip, 'Switching color role');
    await member.roles.add(roleId, 'Color role');
  } catch (err) {
    console.error('color apply failed:', err.message);
    return interaction.editReply('I could not change your color. My role must be **above** the color roles, and I need **Manage Roles**.');
  }
  return interaction.editReply('✅ Color updated!');
}

async function execute(interaction) {
  const sub = interaction.options.getSubcommand();

  if (sub === 'list') {
    await interaction.deferReply({ ephemeral: true });
    const palette = await ensurePalette(interaction.guild);
    const lines = Object.entries(palette).map(([name, v]) => `• **${name}** — \`${v.hex}\``).join('\n');
    const embed = new EmbedBuilder().setTitle('🎨 Available colors').setDescription(lines || '_none_').setColor(0x5865f2);
    return interaction.editReply({ embeds: [embed] });
  }

  if (sub === 'set') {
    await interaction.deferReply({ ephemeral: true });
    const name = interaction.options.getString('name');
    const palette = await ensurePalette(interaction.guild);
    const entry = Object.entries(palette).find(([n]) => n.toLowerCase() === name.toLowerCase());
    if (!entry) return interaction.editReply(`No preset color named "${name}". Try \`/color list\`.`);
    return applyColor(interaction, entry[1].roleId);
  }

  if (sub === 'hex') {
    await interaction.deferReply({ ephemeral: true });
    const hex = colorRoles.normalizeHex(interaction.options.getString('code'));
    if (!hex) return interaction.editReply('That is not a valid hex color. Example: `#ff8800`.');
    const custom = await colorRoles.getCustomMap();
    const key = hex.replace(/[.#]/g, '_');
    let roleId = custom[key];
    if (!roleId) {
      try {
        const role = await interaction.guild.roles.create({ name: hex, color: hex, mentionable: false, reason: 'Custom color role' });
        roleId = role.id;
        await colorRoles.setCustomEntry(hex, roleId);
      } catch (err) {
        console.error('color hex create failed:', err.message);
        return interaction.editReply('I could not create that color role. I need **Manage Roles** and my role must be high enough.');
      }
    }
    return applyColor(interaction, roleId);
  }

  if (sub === 'clear') {
    await interaction.deferReply({ ephemeral: true });
    const allIds = await colorRoles.allColorRoleIds();
    const toStrip = colorRoles.rolesToStrip([...interaction.member.roles.cache.keys()], allIds);
    if (!toStrip.length) return interaction.editReply('You have no color role to remove.');
    try {
      await interaction.member.roles.remove(toStrip, 'Cleared color role');
    } catch (err) {
      console.error('color clear failed:', err.message);
      return interaction.editReply('I could not remove your color role. Check my permissions.');
    }
    return interaction.editReply('✅ Color cleared.');
  }

  // --- Admin subcommands ---
  if (sub === 'add' || sub === 'remove') {
    if (!interaction.member.permissions.has(PermissionFlagsBits.ManageRoles)) {
      return interaction.reply({ content: 'You need the **Manage Roles** permission to manage the palette.', ephemeral: true });
    }
    await interaction.deferReply({ ephemeral: true });
    const name = interaction.options.getString('name');

    if (sub === 'add') {
      const hex = colorRoles.normalizeHex(interaction.options.getString('code'));
      if (!hex) return interaction.editReply('Invalid hex color. Example: `#ff8800`.');
      await ensurePalette(interaction.guild);
      try {
        const role = await interaction.guild.roles.create({ name, color: hex, mentionable: false, reason: 'Palette color added' });
        await colorRoles.setPaletteEntry(name, hex, role.id);
      } catch (err) {
        console.error('palette add failed:', err.message);
        return interaction.editReply('Could not create the role. Check my permissions.');
      }
      return interaction.editReply(`✅ Added **${name}** (\`${hex}\`) to the palette.`);
    }

    // remove
    const palette = await colorRoles.getPalette() || {};
    const entry = Object.entries(palette).find(([n]) => n.toLowerCase() === name.toLowerCase());
    if (!entry) return interaction.editReply(`No preset named "${name}".`);
    const role = interaction.guild.roles.cache.get(entry[1].roleId);
    if (role) await role.delete('Palette color removed').catch(() => {});
    await colorRoles.deletePaletteEntry(entry[0]);
    return interaction.editReply(`✅ Removed **${entry[0]}** from the palette.`);
  }
}

module.exports = { data: commandData, execute };
```

- [ ] **Step 2: Verify the module loads**

Run: `node -e "require('./src/commands/color.js'); console.log('ok')"`
Expected: prints `ok`.

- [ ] **Step 3: Commit**

```bash
git add src/commands/color.js
git commit -m "feat: /color self-service color roles (presets + custom hex)"
```

---

## Task 9: Register the new commands in `src/index.js`

**Files:**
- Modify: `src/index.js`

- [ ] **Step 1: Add the require lines**

Near the other command requires (top of file, around lines 6–44), add:

```js
const lockallCommand = require('./commands/lockall');
const unlockallCommand = require('./commands/unlockall');
const muteCommand = require('./commands/mute');
const unmuteCommand = require('./commands/unmute');
const colorCommand = require('./commands/color');
```

- [ ] **Step 2: Add to the command registration array**

In the `registerCommands` body array (line ~82, the `{ body: [...] }`), append before the closing `]`:

```js
, lockallCommand.data.toJSON(), unlockallCommand.data.toJSON(), muteCommand.data.toJSON(), unmuteCommand.data.toJSON(), colorCommand.data.toJSON()
```

- [ ] **Step 3: Add to the execute dispatch map**

In the dispatch map at line ~301 (`const commands = { config: configCommand, ... }`), add these entries:

```js
    lockall: lockallCommand,
    unlockall: unlockallCommand,
    mute: muteCommand,
    unmute: unmuteCommand,
    color: colorCommand,
```

- [ ] **Step 4: Syntax check**

Run: `node --check src/index.js`
Expected: no output (valid syntax).

- [ ] **Step 5: Commit**

```bash
git add src/index.js
git commit -m "feat: register lockall, unlockall, mute, unmute, color commands"
```

---

## Task 10: Version bump + changelog (ship process)

**Files:**
- Modify: `package.json`
- Modify: `CHANGELOG.md`
- Modify: `src/commands/changelog.js`

- [ ] **Step 1: Bump the version**

In `package.json`, change `"version": "2.11.0"` to `"version": "2.12.0"`.

- [ ] **Step 2: Add the `CHANGELOG.md` entry**

Add at the top of `CHANGELOG.md` (below any title heading, above the 2.11.0 entry), matching the file's existing format:

```markdown
## 2.12.0 — 2026-06-04

### New
- `/lockall now` and `/unlockall` — lock or unlock every text channel at once. `/lockall` skips channels you've added via `/lockall exclude add`, and only records the channels it actually changed, so `/unlockall` never re-opens a channel you'd locked beforehand.
- `/mute` and `/unmute` — friendly wrappers over Discord timeouts for muting and clearing a user's mute.
- `/color` — self-service color roles. `/color list`, `/color set <name>`, `/color hex <#code>`, and `/color clear` for everyone; `/color add` / `/color remove` for mods to manage the palette.
- AutoMod now detects and removes **crypto/giveaway scams** (free-nitro bait, airdrop/giveaway lures, wallet-drainer links), escalating repeat offenders like other automod offenses.

### Fixed
- A mod or admin posting `@everyone` (or pinging a role the bot has) no longer makes Pokedex think it was mentioned and start triage. Only a direct `@Pokedex` ping creates an issue.
```

- [ ] **Step 3: Add the `changelog.js` array entry**

In `src/commands/changelog.js`, add this object as the **first** element of the `CHANGELOG` array (before the `2.11.0` entry):

```js
  {
    version: '2.12.0',
    date: '2026-06-04',
    headline: 'Server lockdown, mute/unmute, scam blocking, and color roles.',
    sections: {
      new: [
        '`/lockall now` and `/unlockall` — lock or unlock every text channel at once. `/lockall exclude add` skips channels you choose, and `/unlockall` only re-opens channels this lockdown actually locked (anything locked beforehand stays locked)',
        '`/mute` and `/unmute` — friendly wrappers over Discord timeouts',
        '`/color` — pick a name color. `list` / `set` / `hex` / `clear` for everyone; `add` / `remove` for mods to manage the palette',
        'AutoMod now removes **crypto/giveaway scams** (free-nitro bait, airdrop/giveaway lures, wallet-drainer links) and escalates repeat offenders',
      ],
      fixed: [
        'A mod or admin posting `@everyone` (or pinging a role Pokedex has) no longer triggers triage — only a direct `@Pokedex` ping creates an issue',
      ],
    },
  },
```

- [ ] **Step 4: Verify changelog.js still loads and parses**

Run: `node --check src/commands/changelog.js && node -e "require('./src/commands/changelog.js'); console.log('ok')"`
Expected: prints `ok`.

- [ ] **Step 5: Commit**

```bash
git add package.json CHANGELOG.md src/commands/changelog.js
git commit -m "chore: release 2.12.0 — changelog and version bump"
```

---

## Task 11: Full verification + PR

- [ ] **Step 1: Run the entire test suite**

Run: `npm test`
Expected: all tests PASS, including the four new files (`cryptoScam`, `lockdownPlan`, `mentionGuard`, `colorRoles`).

- [ ] **Step 2: Syntax-check the whole `src` tree**

Run: `for f in $(git ls-files 'src/**/*.js'); do node --check "$f" || echo "BAD: $f"; done; echo done`
Expected: prints only `done` (no `BAD:` lines).

- [ ] **Step 3: Push the branch and open a PR**

```bash
git push -u origin feat/triage-numbers-and-addcontext
gh pr create --title "feat: server lockdown, mute/unmute, scam blocking, color roles (v2.12.0)" --body "$(cat <<'EOF'
## Summary
- `/lockall` + `/unlockall` — server-wide channel lockdown that only restores channels it locked (channels locked beforehand stay locked)
- `/mute` + `/unmute` — friendly wrappers over Discord timeouts
- AutoMod crypto/giveaway scam detection (delete + escalate)
- Fix: `@everyone`/role pings no longer trigger Pokedex triage
- `/color` — self-service color roles (presets + custom hex)
- v2.12.0: CHANGELOG.md, in-bot /changelog, package.json bumped

## Testing
- `npm test` — new pure-logic unit tests for scam detection, lockdown planning, the mention guard, and color helpers

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

Expected: PR URL printed.

---

## Self-Review notes

- **Spec coverage:** lockall/unlockall (Tasks 2–4), mute/unmute (Task 5), crypto-scam (Task 1), `@everyone` fix (Task 6), color roles (Tasks 7–8), wiring (Task 9), ship process (Task 10), tests + PR (Task 11). All five spec features + ship steps covered.
- **"Remember what was already locked":** Task 2's `planLockdown` excludes already-locked channels from the record; Task 4 records only the channels it actually edited; Task 4's `/unlockall` (Task 4 step 2) restores only recorded channels. Verified consistent.
- **Type/name consistency:** `planLockdown`/`planUnlock`, `recordLockdown`/`getLockdown`/`clearLockdown`, `getExcludedChannels`/`addExcludedChannel`/`removeExcludedChannel`, `normalizeHex`/`rolesToStrip`/`allColorRoleIds`/`getPalette`/`setPaletteEntry`/`deletePaletteEntry`/`getCustomMap`/`setCustomEntry`, `containsCryptoScam`, `mentionsBotDirectly` — names used identically across definition and call sites.
- **Note on `setCustomEntry` key:** custom hex keys are stored with `.`/`#` replaced by `_` (Firestore map keys can't contain `.`); `/color hex` uses the same `key = hex.replace(/[.#]/g, '_')` when reading, so reads and writes match.
