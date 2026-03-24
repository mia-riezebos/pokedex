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

  try {
    getApp();
    const db = admin.firestore();

    const openSnap = await db.collection('issues').where('status', '==', 'open').get();
    const allSnap = await db.collection('issues').get();

    const open = openSnap.size;
    const total = allSnap.size;
    const closed = total - open;

    const byPriority = {};
    openSnap.forEach(doc => {
      const p = doc.data().priority || 'unclassified';
      byPriority[p] = (byPriority[p] || 0) + 1;
    });

    res.json({ open, closed, total, byPriority });
  } catch (err) {
    console.error('Stats API error:', err);
    res.status(500).json({ error: err.message });
  }
};
