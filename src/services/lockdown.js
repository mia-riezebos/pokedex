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

// --- Firestore state ---
// Read helpers swallow errors and return safe defaults (a failed read should not
// block a lockdown). Write helpers intentionally let Firestore errors propagate so
// the calling command can report the failure to the moderator.

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

// Accumulates (unions) newly-locked channel IDs into the active record rather than
// overwriting it. This protects the "only unlock what we locked" guarantee when
// /lockall is run more than once before /unlockall: a second run that locks nothing
// new (because everything is already locked) must NOT wipe the first run's record.
// clearLockdown() resets the list, so a fresh lockdown after /unlockall starts clean.
async function recordLockdown({ channelIds, lockedBy, reason }) {
  const data = {
    lockedBy,
    reason: reason || null,
    lockedAt: admin.firestore.FieldValue.serverTimestamp(),
  };
  if (channelIds.length > 0) {
    data.lockedChannelIds = admin.firestore.FieldValue.arrayUnion(...channelIds);
  }
  await DOC().set(data, { merge: true });
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

// Drop specific channel IDs from the record (e.g. the ones /unlockall actually restored),
// leaving any that failed so the lockdown can be retried. No-op for an empty list.
async function removeLockedChannels(ids) {
  if (!ids || ids.length === 0) return;
  await DOC().set(
    { lockedChannelIds: admin.firestore.FieldValue.arrayRemove(...ids) },
    { merge: true },
  );
}

module.exports = {
  planLockdown,
  planUnlock,
  getExcludedChannels,
  addExcludedChannel,
  removeExcludedChannel,
  recordLockdown,
  getLockdown,
  clearLockdown,
  removeLockedChannels,
};
