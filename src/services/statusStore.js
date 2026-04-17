function createStore(db, { collectionName = 'status_config' } = {}) {
  const col = () => db.collection(collectionName);
  const now = () => new Date().toISOString();

  async function get(guildId) {
    const snap = await col().doc(guildId).get();
    if (!snap.exists) return null;
    return { id: snap.id, ...snap.data() };
  }

  async function save(guildId, patch) {
    await col().doc(guildId).set(
      { guildId, ...patch, updatedAt: now() },
      { merge: true },
    );
  }

  async function listEnabled() {
    const snap = await col().where('enabled', '==', true).get();
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  }

  async function disable(guildId) {
    await col().doc(guildId).update({ enabled: false, updatedAt: now() });
  }

  async function clearPinnedMessageId(guildId) {
    await col().doc(guildId).update({ pinnedMessageId: null, updatedAt: now() });
  }

  return { get, save, listEnabled, disable, clearPinnedMessageId };
}

module.exports = { createStore };
