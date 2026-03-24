const admin = require('firebase-admin');

let db;

function init() {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    }),
  });
  db = admin.firestore();
}

async function isDuplicate(messageId) {
  const snapshot = await db.collection('issues')
    .where('messageId', '==', messageId)
    .limit(1)
    .get();
  return !snapshot.empty;
}

async function saveIssue(issueData) {
  const docRef = await db.collection('issues').add({
    ...issueData,
    status: 'open',
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });
  return docRef.id;
}

async function getIssuesSince(since) {
  const snapshot = await db.collection('issues')
    .where('createdAt', '>=', since)
    .orderBy('createdAt', 'desc')
    .get();
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

async function getAllConfigOverrides() {
  const snapshot = await db.collection('config').get();
  const overrides = {};
  snapshot.forEach(doc => {
    const data = doc.data();
    overrides[data.key] = data.value;
  });
  return overrides;
}

async function setConfigOverride(key, value, userId) {
  await db.collection('config').doc(key).set({
    key,
    value,
    updatedBy: userId,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });
}

async function deleteConfigOverride(key) {
  await db.collection('config').doc(key).delete();
}

async function updateIssueTriageMessageId(issueId, triageMessageId) {
  await db.collection('issues').doc(issueId).update({ triageMessageId });
}

async function updateIssueThreadId(issueId, threadId) {
  await db.collection('issues').doc(issueId).update({ threadId });
}

async function getIssueByThreadId(threadId) {
  const snapshot = await db.collection('issues')
    .where('threadId', '==', threadId)
    .limit(1)
    .get();
  if (snapshot.empty) return null;
  const doc = snapshot.docs[0];
  return { id: doc.id, ...doc.data() };
}

async function appendThreadContext(issueId, newText) {
  const doc = await db.collection('issues').doc(issueId).get();
  if (!doc.exists) return null;
  const data = doc.data();
  const existingContext = data.threadContext || [];
  existingContext.push({ text: newText, addedAt: new Date().toISOString() });
  await db.collection('issues').doc(issueId).update({ threadContext: existingContext });
  return { id: doc.id, ...data, threadContext: existingContext };
}

async function updateIssueClassification(issueId, classification) {
  await db.collection('issues').doc(issueId).update({
    priority: classification.priority,
    category: classification.category,
    summary: classification.summary,
    reasoning: classification.reasoning,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });
}

async function getIssueById(issueId) {
  const doc = await db.collection('issues').doc(issueId).get();
  if (!doc.exists) return null;
  return { id: doc.id, ...doc.data() };
}

async function updateIssueStatus(issueId, status, closedBy) {
  const update = {
    status,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  };
  if (status === 'closed') {
    update.closedBy = closedBy;
    update.closedAt = admin.firestore.FieldValue.serverTimestamp();
  }
  await db.collection('issues').doc(issueId).update(update);
}

async function getOpenIssues(limit = 25) {
  const snapshot = await db.collection('issues')
    .where('status', '==', 'open')
    .orderBy('createdAt', 'desc')
    .limit(limit)
    .get();
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

async function getIssueCounts() {
  const openSnap = await db.collection('issues').where('status', '==', 'open').get();
  const closedSnap = await db.collection('issues').where('status', '==', 'closed').get();
  const open = openSnap.size;
  const closed = closedSnap.size;

  // Count by priority
  const byPriority = {};
  openSnap.forEach(doc => {
    const p = doc.data().priority || 'unclassified';
    byPriority[p] = (byPriority[p] || 0) + 1;
  });

  return { open, closed, total: open + closed, byPriority };
}

async function getAllIssues(limit = 500) {
  const snapshot = await db.collection('issues')
    .orderBy('createdAt', 'desc')
    .limit(limit)
    .get();
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

async function getRecentIssuesByReporter(reporterId, options = {}) {
  const { status = 'all', limit = 10 } = options;
  const issues = await getAllIssues(500);

  return issues
    .filter(issue => issue.reporterId === reporterId)
    .filter(issue => status === 'all' ? true : (issue.status || 'open') === status)
    .slice(0, limit);
}

async function searchIssues(query, options = {}) {
  const { status = 'all', limit = 10 } = options;
  const terms = String(query || '')
    .toLowerCase()
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (terms.length === 0) return [];

  const issues = await getAllIssues(500);

  return issues
    .map(issue => {
      const summary = String(issue.summary || '').toLowerCase();
      const text = String(issue.text || '').toLowerCase();
      const category = String(issue.category || '').toLowerCase();
      const reporter = String(issue.reporterName || '').toLowerCase();
      let score = 0;

      for (const term of terms) {
        if (summary.includes(term)) score += 3;
        if (text.includes(term)) score += 2;
        if (category.includes(term)) score += 1;
        if (reporter.includes(term)) score += 1;
      }

      return { issue, score };
    })
    .filter(({ issue, score }) => score > 0 && (status === 'all' ? true : (issue.status || 'open') === status))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ issue }) => issue);
}

async function assignIssue(issueId, assignment) {
  await db.collection('issues').doc(issueId).update({
    assigneeId: assignment.assigneeId,
    assigneeName: assignment.assigneeName,
    assignedBy: assignment.assignedBy,
    assignedAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });
}

async function addIssueNote(issueId, note) {
  const docRef = db.collection('issues').doc(issueId);
  const doc = await docRef.get();
  if (!doc.exists) return null;

  const data = doc.data();
  const notes = Array.isArray(data.notes) ? [...data.notes] : [];
  const storedNote = {
    text: note.text,
    authorId: note.authorId,
    authorName: note.authorName,
    createdAt: new Date().toISOString(),
  };

  notes.push(storedNote);

  await docRef.update({
    notes,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  return storedNote;
}

module.exports = {
  init,
  isDuplicate,
  saveIssue,
  getIssuesSince,
  getAllConfigOverrides,
  setConfigOverride,
  deleteConfigOverride,
  updateIssueTriageMessageId,
  updateIssueThreadId,
  getIssueByThreadId,
  appendThreadContext,
  updateIssueClassification,
  getIssueById,
  updateIssueStatus,
  getOpenIssues,
  getIssueCounts,
  getAllIssues,
  getRecentIssuesByReporter,
  searchIssues,
  assignIssue,
  addIssueNote,
};
