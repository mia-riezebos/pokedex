const express = require('express');
const path = require('path');
const firestore = require('../services/firestore');

const app = express();
const PORT = process.env.DASHBOARD_PORT || 3000;

// Serve static frontend
app.use(express.static(path.join(__dirname, 'public')));

// API: Get all issues
app.get('/api/issues', async (req, res) => {
  try {
    const { status, priority, category, limit: limitParam } = req.query;
    let issues = await firestore.getAllIssues(parseInt(limitParam) || 500);

    if (status) issues = issues.filter(i => i.status === status);
    if (priority) issues = issues.filter(i => i.priority === priority);
    if (category) issues = issues.filter(i => i.category === category);

    // Convert Firestore timestamps to ISO strings
    issues = issues.map(i => ({
      ...i,
      createdAt: i.createdAt?.toDate?.()?.toISOString() || null,
      closedAt: i.closedAt?.toDate?.()?.toISOString() || null,
      updatedAt: i.updatedAt?.toDate?.()?.toISOString() || null,
    }));

    res.json({ issues, total: issues.length });
  } catch (err) {
    console.error('Dashboard API error:', err);
    res.status(500).json({ error: 'Failed to fetch issues' });
  }
});

// API: Get stats
app.get('/api/stats', async (req, res) => {
  try {
    const counts = await firestore.getIssueCounts();
    res.json(counts);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

// API: Get single issue
app.get('/api/issues/:id', async (req, res) => {
  try {
    const issue = await firestore.getIssueById(req.params.id);
    if (!issue) return res.status(404).json({ error: 'Issue not found' });

    res.json({
      ...issue,
      createdAt: issue.createdAt?.toDate?.()?.toISOString() || null,
      closedAt: issue.closedAt?.toDate?.()?.toISOString() || null,
      updatedAt: issue.updatedAt?.toDate?.()?.toISOString() || null,
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch issue' });
  }
});

// Catch-all: serve frontend for SPA routing
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

function startDashboard() {
  app.listen(PORT, () => {
    console.log(`Dashboard running at http://localhost:${PORT}`);
  });
}

module.exports = { startDashboard };
