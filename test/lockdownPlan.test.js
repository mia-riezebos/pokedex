const { test } = require('node:test');
const assert = require('node:assert/strict');
const { ChannelType } = require('discord.js');
const { planLockdown, planUnlock, lockOverwrite, unlockOverwrite, primaryLockFlag } = require('../src/services/lockdown');
const { PermissionFlagsBits } = require('discord.js');

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

test('planUnlock keeps the { id, prior } record shape for existing channels', () => {
  const recorded = [
    { id: 'a', prior: 'allow' },
    { id: 'c', prior: 'neutral' },
    { id: 'z', prior: 'neutral' }, // deleted since
  ];
  const existing = ['a', 'b', 'c'];
  assert.deepEqual(planUnlock(recorded, existing), [
    { id: 'a', prior: 'allow' },
    { id: 'c', prior: 'neutral' },
  ]);
});

test('lockOverwrite denies the right permission per channel type', () => {
  assert.deepEqual(lockOverwrite(ChannelType.GuildText), { SendMessages: false });
  assert.deepEqual(lockOverwrite(ChannelType.GuildAnnouncement), { SendMessages: false });
  assert.deepEqual(lockOverwrite(ChannelType.GuildForum), { CreatePublicThreads: false, SendMessagesInThreads: false });
});

test('unlockOverwrite restores an explicit allow, else clears to inherit', () => {
  assert.deepEqual(unlockOverwrite(ChannelType.GuildText, 'allow'), { SendMessages: true });
  assert.deepEqual(unlockOverwrite(ChannelType.GuildText, 'neutral'), { SendMessages: null });
  assert.deepEqual(unlockOverwrite(ChannelType.GuildForum, 'allow'), { CreatePublicThreads: true, SendMessagesInThreads: null });
  assert.deepEqual(unlockOverwrite(ChannelType.GuildForum, 'neutral'), { CreatePublicThreads: null, SendMessagesInThreads: null });
});

test('primaryLockFlag matches the channel type', () => {
  assert.equal(primaryLockFlag(ChannelType.GuildText), PermissionFlagsBits.SendMessages);
  assert.equal(primaryLockFlag(ChannelType.GuildForum), PermissionFlagsBits.CreatePublicThreads);
});
