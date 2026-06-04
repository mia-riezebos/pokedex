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
