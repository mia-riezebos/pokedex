const admin = require('firebase-admin');

function getApp() {
  if (admin.apps.length) return admin.apps[0];

  let privateKey = process.env.FIREBASE_PRIVATE_KEY || '';
  // Handle both escaped and real newlines
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

    const { status, priority, category } = req.query;
    const snapshot = await db.collection('issues')
      .orderBy('createdAt', 'desc')
      .limit(500)
      .get();

    let issues = snapshot.docs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        ...data,
        createdAt: data.createdAt?.toDate?.()?.toISOString() || null,
        closedAt: data.closedAt?.toDate?.()?.toISOString() || null,
        updatedAt: data.updatedAt?.toDate?.()?.toISOString() || null,
      };
    });

    if (status) issues = issues.filter(i => i.status === status);
    if (priority) issues = issues.filter(i => i.priority === priority);
    if (category) issues = issues.filter(i => i.category === category);

    res.json({ issues, total: issues.length });
  } catch (err) {
    console.error('Issues API error:', err);
    res.status(500).json({ error: err.message });
  }
};
