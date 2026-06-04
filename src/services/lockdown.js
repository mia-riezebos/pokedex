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
