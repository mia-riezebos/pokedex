const admin = require('firebase-admin');

function getApp() {
  if (admin.apps.length) return admin.apps[0];

  let privateKey = process.env.FIREBASE_PRIVATE_KEY || '';
  if (privateKey.includes('\\n')) {
    privateKey = privateKey.replace(/\\n/g, '\n');
  }

  return admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey,
    }),
  });
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Admin-Key');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // Simple admin key check
  const adminKey = req.headers['x-admin-key'];
  if (adminKey !== process.env.ADMIN_SECRET) {
    return res.status(403).json({ error: 'Unauthorized' });
  }

  try {
    getApp();
    const db = admin.firestore();
    const { ids, deleteAll } = req.body;

    if (deleteAll) {
      const snapshot = await db.collection('issues').get();
      const batch = db.batch();
      snapshot.docs.forEach(doc => batch.delete(doc.ref));
      await batch.commit();
      return res.json({ deleted: snapshot.size, message: 'All issues deleted' });
    }

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: 'Provide ids array or deleteAll: true' });
    }

    const batch = db.batch();
    for (const id of ids) {
      batch.delete(db.collection('issues').doc(id));
    }
    await batch.commit();

    res.json({ deleted: ids.length, message: `Deleted ${ids.length} issues` });
  } catch (err) {
    console.error('Delete error:', err);
    res.status(500).json({ error: err.message });
  }
};
