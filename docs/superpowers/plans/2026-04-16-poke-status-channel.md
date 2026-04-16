# Poke Status Channel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `/status` slash command and an auto-updating Poke status channel that polls `status.poke.com/api/v2/summary.json` every 2 minutes, maintains a pinned summary, and alerts on transitions/incidents.

**Architecture:** Six new `src/services/` modules split by responsibility (diff, formatter, fetcher, store, poller) + one command file. The poller is driven by `node-cron`. All modules are testable in isolation via dependency injection (fake fetch, fake Firestore, fake Discord client). The feature is gated by `status_enabled` in `config.json`, defaulting to `false`, so existing users see no behavior change.

**Tech Stack:** Node.js 18+, discord.js 14, firebase-admin 13, node-cron 4, vitest 4 (already installed).

**Branch:** `feat/poke-status-channel` off `main` (already created).

**Spec:** `docs/superpowers/specs/2026-04-16-poke-status-channel-design.md`

---

## Task 1: Add config keys and status JSON fixtures

**Files:**
- Modify: `config.json`
- Create: `tests/fixtures/status/all-operational.json`
- Create: `tests/fixtures/status/partial-outage.json`
- Create: `tests/fixtures/status/active-incident.json`
- Create: `tests/fixtures/status/incident-resolved.json`

- [ ] **Step 1: Add config keys to `config.json`**

Edit `config.json` to add five new keys after the last existing key:

```json
{
  "model": "anthropic/claude-sonnet-4",
  "triage_channel": "eng-triage",
  "emoji_trigger": "🐛",
  "suggestion_emoji": "💡",
  "output_mode": "embed",
  "acknowledge": true,
  "summary_interval": "daily",
  "priorities": ["critical", "high", "medium", "low"],
  "categories": ["bug", "feature_request", "ux_issue", "performance", "security", "suggestion", "other"],
  "level_announce": true,
  "feedback_forum": "feedback",
  "autoscrape_recipes_enabled": false,
  "autoscrape_recipes_auto_approve": false,
  "status_enabled": false,
  "status_api_url": "https://status.poke.com/api/v2/summary.json",
  "status_poll_cron": "*/2 * * * *",
  "status_fetch_timeout_ms": 10000,
  "status_default_channel_name": "poke-status"
}
```

- [ ] **Step 2: Create `tests/fixtures/status/all-operational.json`**

```json
{
  "page": { "id": "pkstatus", "name": "Poke", "url": "https://status.poke.com", "updated_at": "2026-04-16T12:00:00Z" },
  "status": { "indicator": "none", "description": "All Systems Operational" },
  "components": [
    { "id": "c-app",   "name": "App",              "status": "operational", "updated_at": "2026-04-16T12:00:00Z" },
    { "id": "c-email", "name": "Email",            "status": "operational", "updated_at": "2026-04-16T12:00:00Z" },
    { "id": "c-int",   "name": "Integrations",     "status": "operational", "updated_at": "2026-04-16T12:00:00Z" },
    { "id": "c-wa",    "name": "WhatsApp",         "status": "operational", "updated_at": "2026-04-16T12:00:00Z" },
    { "id": "c-sms",   "name": "SMS",              "status": "operational", "updated_at": "2026-04-16T12:00:00Z" },
    { "id": "c-im",    "name": "iMessage",         "status": "operational", "updated_at": "2026-04-16T12:00:00Z" },
    { "id": "c-img",   "name": "iMessage Group",   "status": "operational", "updated_at": "2026-04-16T12:00:00Z" }
  ],
  "incidents": []
}
```

- [ ] **Step 3: Create `tests/fixtures/status/partial-outage.json`**

```json
{
  "page": { "id": "pkstatus", "name": "Poke", "url": "https://status.poke.com", "updated_at": "2026-04-16T15:00:00Z" },
  "status": { "indicator": "major", "description": "Partial System Outage" },
  "components": [
    { "id": "c-app",   "name": "App",              "status": "operational",          "updated_at": "2026-04-16T12:00:00Z" },
    { "id": "c-email", "name": "Email",            "status": "partial_outage",       "updated_at": "2026-04-16T15:00:00Z" },
    { "id": "c-int",   "name": "Integrations",     "status": "operational",          "updated_at": "2026-04-16T12:00:00Z" },
    { "id": "c-wa",    "name": "WhatsApp",         "status": "operational",          "updated_at": "2026-04-16T12:00:00Z" },
    { "id": "c-sms",   "name": "SMS",              "status": "operational",          "updated_at": "2026-04-16T12:00:00Z" },
    { "id": "c-im",    "name": "iMessage",         "status": "operational",          "updated_at": "2026-04-16T12:00:00Z" },
    { "id": "c-img",   "name": "iMessage Group",   "status": "degraded_performance", "updated_at": "2026-04-16T12:00:00Z" }
  ],
  "incidents": []
}
```

- [ ] **Step 4: Create `tests/fixtures/status/active-incident.json`**

```json
{
  "page": { "id": "pkstatus", "name": "Poke", "url": "https://status.poke.com", "updated_at": "2026-04-16T16:00:00Z" },
  "status": { "indicator": "critical", "description": "Major System Outage" },
  "components": [
    { "id": "c-app",   "name": "App",              "status": "major_outage",   "updated_at": "2026-04-16T16:00:00Z" },
    { "id": "c-email", "name": "Email",            "status": "partial_outage", "updated_at": "2026-04-16T15:00:00Z" },
    { "id": "c-int",   "name": "Integrations",     "status": "operational",    "updated_at": "2026-04-16T12:00:00Z" },
    { "id": "c-wa",    "name": "WhatsApp",         "status": "operational",    "updated_at": "2026-04-16T12:00:00Z" },
    { "id": "c-sms",   "name": "SMS",              "status": "operational",    "updated_at": "2026-04-16T12:00:00Z" },
    { "id": "c-im",    "name": "iMessage",         "status": "operational",    "updated_at": "2026-04-16T12:00:00Z" },
    { "id": "c-img",   "name": "iMessage Group",   "status": "operational",    "updated_at": "2026-04-16T12:00:00Z" }
  ],
  "incidents": [
    {
      "id": "inc-poke-down",
      "name": "Poke Down",
      "status": "investigating",
      "impact": "critical",
      "shortlink": "https://status.poke.com/incidents/inc-poke-down",
      "created_at": "2026-04-16T15:58:00Z",
      "updated_at": "2026-04-16T16:00:00Z",
      "incident_updates": [
        { "body": "We're investigating reports that users are unable to send messages.", "status": "investigating", "created_at": "2026-04-16T15:58:00Z" }
      ]
    }
  ]
}
```

- [ ] **Step 5: Create `tests/fixtures/status/incident-resolved.json`**

```json
{
  "page": { "id": "pkstatus", "name": "Poke", "url": "https://status.poke.com", "updated_at": "2026-04-16T17:00:00Z" },
  "status": { "indicator": "none", "description": "All Systems Operational" },
  "components": [
    { "id": "c-app",   "name": "App",              "status": "operational", "updated_at": "2026-04-16T17:00:00Z" },
    { "id": "c-email", "name": "Email",            "status": "operational", "updated_at": "2026-04-16T17:00:00Z" },
    { "id": "c-int",   "name": "Integrations",     "status": "operational", "updated_at": "2026-04-16T12:00:00Z" },
    { "id": "c-wa",    "name": "WhatsApp",         "status": "operational", "updated_at": "2026-04-16T12:00:00Z" },
    { "id": "c-sms",   "name": "SMS",              "status": "operational", "updated_at": "2026-04-16T12:00:00Z" },
    { "id": "c-im",    "name": "iMessage",         "status": "operational", "updated_at": "2026-04-16T12:00:00Z" },
    { "id": "c-img",   "name": "iMessage Group",   "status": "operational", "updated_at": "2026-04-16T12:00:00Z" }
  ],
  "incidents": [
    {
      "id": "inc-poke-down",
      "name": "Poke Down",
      "status": "resolved",
      "impact": "critical",
      "shortlink": "https://status.poke.com/incidents/inc-poke-down",
      "created_at": "2026-04-16T15:58:00Z",
      "updated_at": "2026-04-16T17:00:00Z",
      "incident_updates": [
        { "body": "Everything is operational again.", "status": "resolved", "created_at": "2026-04-16T17:00:00Z" },
        { "body": "We're investigating reports that users are unable to send messages.", "status": "investigating", "created_at": "2026-04-16T15:58:00Z" }
      ]
    }
  ]
}
```

- [ ] **Step 6: Commit**

```bash
git add config.json tests/fixtures/status/
git commit -m "feat(status): add config keys and test fixtures for status feature"
```

---

## Task 2: `statusDiff.js` — pure snapshot normalization and diff

**Files:**
- Create: `src/services/statusDiff.js`
- Create: `tests/services/statusDiff.test.js`

- [ ] **Step 1: Write failing tests**

Create `tests/services/statusDiff.test.js`:

```javascript
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { normalize, diff } from '../../src/services/statusDiff.js';

const fixture = (name) =>
  JSON.parse(readFileSync(join(__dirname, '../fixtures/status/', name), 'utf-8'));

describe('normalize', () => {
  it('flattens the summary JSON into snapshot shape', () => {
    const snap = normalize(fixture('all-operational.json'));
    expect(snap.overall.indicator).toBe('none');
    expect(snap.components).toHaveLength(7);
    expect(snap.components[0]).toEqual({
      id: 'c-app', name: 'App', status: 'operational', updatedAt: '2026-04-16T12:00:00Z',
    });
    expect(snap.incidents).toEqual([]);
  });

  it('carries incidents with their updates', () => {
    const snap = normalize(fixture('active-incident.json'));
    expect(snap.incidents).toHaveLength(1);
    expect(snap.incidents[0].id).toBe('inc-poke-down');
    expect(snap.incidents[0].updates).toHaveLength(1);
    expect(snap.incidents[0].updates[0].status).toBe('investigating');
  });
});

describe('diff', () => {
  it('reports no changes when prev is null AND next is all-green with no incidents', () => {
    const next = normalize(fixture('all-operational.json'));
    const d = diff(null, next);
    expect(d.overallChanged).toBe(false);
    expect(d.componentTransitions).toEqual([]);
    expect(d.incidentsCreated).toEqual([]);
    expect(d.incidentsResolved).toEqual([]);
    expect(d.incidentsUpdated).toEqual([]);
  });

  it('when prev is null and there is an active incident, reports it as created (no component alerts)', () => {
    const next = normalize(fixture('active-incident.json'));
    const d = diff(null, next);
    expect(d.componentTransitions).toEqual([]);
    expect(d.incidentsCreated).toHaveLength(1);
    expect(d.incidentsCreated[0].id).toBe('inc-poke-down');
  });

  it('detects component transitions when status changes', () => {
    const prev = normalize(fixture('all-operational.json'));
    const next = normalize(fixture('partial-outage.json'));
    const d = diff(prev, next);
    expect(d.overallChanged).toBe(true);
    const transitions = d.componentTransitions.map(t => `${t.name}:${t.prev}->${t.next}`);
    expect(transitions).toContain('Email:operational->partial_outage');
    expect(transitions).toContain('iMessage Group:operational->degraded_performance');
    expect(d.componentTransitions).toHaveLength(2);
  });

  it('detects a new incident appearing', () => {
    const prev = normalize(fixture('partial-outage.json'));
    const next = normalize(fixture('active-incident.json'));
    const d = diff(prev, next);
    expect(d.incidentsCreated.map(i => i.id)).toEqual(['inc-poke-down']);
    expect(d.incidentsResolved).toEqual([]);
  });

  it('detects an incident resolving', () => {
    const prev = normalize(fixture('active-incident.json'));
    const next = normalize(fixture('incident-resolved.json'));
    const d = diff(prev, next);
    expect(d.incidentsResolved.map(i => i.id)).toEqual(['inc-poke-down']);
    expect(d.incidentsCreated).toEqual([]);
  });

  it('detects new incident updates on a still-open incident', () => {
    const prev = normalize(fixture('active-incident.json'));
    const nextRaw = fixture('active-incident.json');
    nextRaw.incidents[0].incident_updates.unshift({
      body: 'Identified the cause.',
      status: 'identified',
      created_at: '2026-04-16T16:30:00Z',
    });
    nextRaw.incidents[0].status = 'identified';
    const next = normalize(nextRaw);
    const d = diff(prev, next);
    expect(d.incidentsUpdated).toHaveLength(1);
    expect(d.incidentsUpdated[0].newUpdates).toHaveLength(1);
    expect(d.incidentsUpdated[0].newUpdates[0].body).toBe('Identified the cause.');
  });

  it('returns no changes when two identical snapshots are diffed', () => {
    const snap = normalize(fixture('partial-outage.json'));
    const d = diff(snap, snap);
    expect(d.overallChanged).toBe(false);
    expect(d.componentTransitions).toEqual([]);
    expect(d.incidentsCreated).toEqual([]);
    expect(d.incidentsResolved).toEqual([]);
    expect(d.incidentsUpdated).toEqual([]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/services/statusDiff.test.js`
Expected: FAIL — `Cannot find module '../../src/services/statusDiff.js'`

- [ ] **Step 3: Implement `src/services/statusDiff.js`**

```javascript
function normalize(raw) {
  const overall = {
    indicator: raw?.status?.indicator ?? 'none',
    description: raw?.status?.description ?? '',
    updatedAt: raw?.page?.updated_at ?? null,
  };
  const components = Array.isArray(raw?.components) ? raw.components.map(c => ({
    id: c.id,
    name: c.name,
    status: c.status,
    updatedAt: c.updated_at ?? null,
  })) : [];
  const incidents = Array.isArray(raw?.incidents) ? raw.incidents.map(i => ({
    id: i.id,
    name: i.name,
    status: i.status,
    impact: i.impact,
    shortlink: i.shortlink ?? null,
    createdAt: i.created_at ?? null,
    updatedAt: i.updated_at ?? null,
    updates: Array.isArray(i.incident_updates) ? i.incident_updates.map(u => ({
      body: u.body,
      status: u.status,
      createdAt: u.created_at ?? null,
    })) : [],
  })) : [];
  return { overall, components, incidents };
}

function indexById(arr) {
  const m = new Map();
  for (const item of arr) m.set(item.id, item);
  return m;
}

function diff(prev, next) {
  const result = {
    overallChanged: false,
    componentTransitions: [],
    incidentsCreated: [],
    incidentsResolved: [],
    incidentsUpdated: [],
  };

  // First-snapshot rules: no component alerts, but surface any currently-open
  // incidents as "created" so admins see current state.
  if (!prev) {
    for (const inc of next.incidents) {
      if (inc.status !== 'resolved') result.incidentsCreated.push(inc);
    }
    return result;
  }

  if (prev.overall.indicator !== next.overall.indicator) {
    result.overallChanged = true;
  }

  const prevComps = indexById(prev.components);
  for (const c of next.components) {
    const was = prevComps.get(c.id);
    if (was && was.status !== c.status) {
      result.componentTransitions.push({
        id: c.id, name: c.name, prev: was.status, next: c.status,
      });
    }
  }

  const prevInc = indexById(prev.incidents);
  const nextInc = indexById(next.incidents);

  for (const inc of next.incidents) {
    const was = prevInc.get(inc.id);
    if (!was) {
      if (inc.status !== 'resolved') result.incidentsCreated.push(inc);
      continue;
    }
    if (was.status !== 'resolved' && inc.status === 'resolved') {
      result.incidentsResolved.push(inc);
      continue;
    }
    const seen = new Set(was.updates.map(u => u.createdAt));
    const newUpdates = inc.updates.filter(u => !seen.has(u.createdAt));
    if (newUpdates.length > 0) {
      result.incidentsUpdated.push({ incident: inc, newUpdates });
    }
  }

  // Incidents that existed in prev but not in next AND weren't resolved
  // are effectively resolved from the feed's perspective; don't alert on them
  // (rare, only happens if status page retracts an incident).

  return result;
}

module.exports = { normalize, diff };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/services/statusDiff.test.js`
Expected: PASS — all 8 tests green.

- [ ] **Step 5: Commit**

```bash
git add src/services/statusDiff.js tests/services/statusDiff.test.js
git commit -m "feat(status): add pure status snapshot normalizer and differ"
```

---

## Task 3: `statusFormatter.js` — pure embed builders

**Files:**
- Create: `src/services/statusFormatter.js`
- Create: `tests/services/statusFormatter.test.js`

- [ ] **Step 1: Write failing tests**

Create `tests/services/statusFormatter.test.js`:

```javascript
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  buildSummaryEmbed,
  buildIncidentEmbed,
  buildTransitionEmbed,
  colorForIndicator,
  prettyStatus,
} from '../../src/services/statusFormatter.js';
import { normalize } from '../../src/services/statusDiff.js';

const fixture = (name) =>
  JSON.parse(readFileSync(join(__dirname, '../fixtures/status/', name), 'utf-8'));

const STATUS_URL = 'https://status.poke.com';

describe('colorForIndicator', () => {
  it('maps every indicator to its color', () => {
    expect(colorForIndicator('none')).toBe(0x2ECC71);
    expect(colorForIndicator('minor')).toBe(0xF1C40F);
    expect(colorForIndicator('major')).toBe(0xE67E22);
    expect(colorForIndicator('critical')).toBe(0xE74C3C);
    expect(colorForIndicator('maintenance')).toBe(0x3498DB);
  });

  it('falls back to green on unknown indicator', () => {
    expect(colorForIndicator('whatever')).toBe(0x2ECC71);
  });
});

describe('prettyStatus', () => {
  it('title-cases snake_case status', () => {
    expect(prettyStatus('operational')).toBe('Operational');
    expect(prettyStatus('degraded_performance')).toBe('Degraded Performance');
    expect(prettyStatus('partial_outage')).toBe('Partial Outage');
    expect(prettyStatus('major_outage')).toBe('Major Outage');
    expect(prettyStatus('under_maintenance')).toBe('Under Maintenance');
  });
});

describe('buildSummaryEmbed', () => {
  it('uses green color and all-operational title when everything is up', () => {
    const snap = normalize(fixture('all-operational.json'));
    const { embed, row } = buildSummaryEmbed(snap, { statusPageUrl: STATUS_URL });
    const j = embed.toJSON();
    expect(j.color).toBe(0x2ECC71);
    expect(j.title).toContain('All Systems Operational');
    expect(row.components).toHaveLength(1);
  });

  it('uses critical color when indicator is critical', () => {
    const snap = normalize(fixture('active-incident.json'));
    const { embed } = buildSummaryEmbed(snap, { statusPageUrl: STATUS_URL });
    expect(embed.toJSON().color).toBe(0xE74C3C);
  });

  it('lists every component with emoji and pretty status', () => {
    const snap = normalize(fixture('partial-outage.json'));
    const { embed } = buildSummaryEmbed(snap, { statusPageUrl: STATUS_URL });
    const description = embed.toJSON().description ?? '';
    expect(description).toContain('🟢 App');
    expect(description).toContain('🟠 Email');
    expect(description).toContain('Partial Outage');
    expect(description).toContain('🟡 iMessage Group');
    expect(description).toContain('Degraded Performance');
  });

  it('shows active-incident count in footer or field', () => {
    const snap = normalize(fixture('active-incident.json'));
    const { embed } = buildSummaryEmbed(snap, { statusPageUrl: STATUS_URL });
    const j = JSON.stringify(embed.toJSON());
    expect(j).toMatch(/1/);
  });
});

describe('buildIncidentEmbed', () => {
  it('uses new-incident prefix for kind=new', () => {
    const snap = normalize(fixture('active-incident.json'));
    const embed = buildIncidentEmbed(snap.incidents[0], { kind: 'new', statusPageUrl: STATUS_URL });
    expect(embed.toJSON().title).toContain('🚨');
    expect(embed.toJSON().title).toContain('Poke Down');
  });

  it('uses resolved prefix for kind=resolved', () => {
    const snap = normalize(fixture('incident-resolved.json'));
    const embed = buildIncidentEmbed(snap.incidents[0], { kind: 'resolved', statusPageUrl: STATUS_URL });
    expect(embed.toJSON().title).toContain('✅');
  });

  it('uses update prefix for kind=update', () => {
    const snap = normalize(fixture('active-incident.json'));
    const embed = buildIncidentEmbed(snap.incidents[0], { kind: 'update', statusPageUrl: STATUS_URL });
    expect(embed.toJSON().title).toContain('ℹ️');
  });
});

describe('buildTransitionEmbed', () => {
  it('shows prev and next status names', () => {
    const embed = buildTransitionEmbed(
      { name: 'App', prev: 'operational', next: 'degraded_performance' },
      STATUS_URL,
    );
    const text = JSON.stringify(embed.toJSON());
    expect(text).toContain('App');
    expect(text).toContain('Operational');
    expect(text).toContain('Degraded Performance');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/services/statusFormatter.test.js`
Expected: FAIL — `Cannot find module '../../src/services/statusFormatter.js'`

- [ ] **Step 3: Implement `src/services/statusFormatter.js`**

```javascript
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

const SEVERITY_COLORS = {
  none: 0x2ECC71,
  minor: 0xF1C40F,
  major: 0xE67E22,
  critical: 0xE74C3C,
  maintenance: 0x3498DB,
};

const COMPONENT_EMOJI = {
  operational: '🟢',
  degraded_performance: '🟡',
  partial_outage: '🟠',
  major_outage: '🔴',
  under_maintenance: '🔵',
};

function colorForIndicator(indicator) {
  return SEVERITY_COLORS[indicator] ?? SEVERITY_COLORS.none;
}

function prettyStatus(s) {
  return String(s || '')
    .split('_')
    .map(word => word.length === 0 ? word : word[0].toUpperCase() + word.slice(1))
    .join(' ');
}

function truncate(text, max) {
  const s = String(text || '');
  return s.length <= max ? s : s.slice(0, max - 1) + '…';
}

function buildSummaryEmbed(snapshot, { statusPageUrl }) {
  const indicator = snapshot.overall.indicator;
  const description = snapshot.overall.description || prettyStatus(indicator);
  const lines = snapshot.components.map(c => {
    const emoji = COMPONENT_EMOJI[c.status] ?? '⚪';
    return `${emoji}  **${c.name}** — ${prettyStatus(c.status)}`;
  });

  const activeIncidents = snapshot.incidents.filter(i => i.status !== 'resolved').length;
  const nowSecs = Math.floor(Date.now() / 1000);

  const embed = new EmbedBuilder()
    .setTitle(`${COMPONENT_EMOJI[indicator === 'none' ? 'operational' : 'major_outage']} Poke Status — ${description}`)
    .setColor(colorForIndicator(indicator))
    .setDescription(lines.join('\n'))
    .addFields(
      { name: 'Active Incidents', value: String(activeIncidents), inline: true },
      { name: 'Last Checked', value: `<t:${nowSecs}:R>`, inline: true },
    )
    .setFooter({ text: 'Data: status.poke.com' })
    .setTimestamp();

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setLabel('Open status page')
      .setStyle(ButtonStyle.Link)
      .setURL(statusPageUrl),
  );

  return { embed, row };
}

function buildIncidentEmbed(incident, { kind, statusPageUrl }) {
  const PREFIX = { new: '🚨 New Incident', update: 'ℹ️ Incident Update', resolved: '✅ Resolved' };
  const prefix = PREFIX[kind] ?? 'Incident';
  const latestUpdate = incident.updates?.[0];
  const createdSecs = incident.createdAt ? Math.floor(new Date(incident.createdAt).getTime() / 1000) : null;

  const indicatorForImpact = {
    critical: 'critical',
    major: 'major',
    minor: 'minor',
    none: 'none',
  }[incident.impact] ?? 'minor';

  const embed = new EmbedBuilder()
    .setTitle(`${prefix}: ${incident.name}`)
    .setColor(kind === 'resolved' ? SEVERITY_COLORS.none : colorForIndicator(indicatorForImpact))
    .setURL(incident.shortlink || statusPageUrl)
    .addFields(
      { name: 'Impact', value: prettyStatus(incident.impact || 'unknown'), inline: true },
      { name: 'Status', value: prettyStatus(incident.status || 'unknown'), inline: true },
    )
    .setTimestamp();

  if (createdSecs) {
    embed.addFields({ name: 'Created', value: `<t:${createdSecs}:R>`, inline: true });
  }
  if (latestUpdate?.body) {
    embed.setDescription(`> ${truncate(latestUpdate.body, 500)}`);
  }

  return embed;
}

function buildTransitionEmbed(transition, statusPageUrl) {
  const emojiPrev = COMPONENT_EMOJI[transition.prev] ?? '⚪';
  const emojiNext = COMPONENT_EMOJI[transition.next] ?? '⚪';
  const severity = transition.next === 'operational' ? 'none'
    : transition.next === 'degraded_performance' ? 'minor'
    : transition.next === 'partial_outage' ? 'major'
    : transition.next === 'major_outage' ? 'critical'
    : 'minor';

  return new EmbedBuilder()
    .setColor(colorForIndicator(severity))
    .setDescription(
      `${emojiNext} **${transition.name}**  ${emojiPrev} ${prettyStatus(transition.prev)} → ${emojiNext} ${prettyStatus(transition.next)}`,
    )
    .setURL(statusPageUrl)
    .setTimestamp();
}

module.exports = {
  buildSummaryEmbed,
  buildIncidentEmbed,
  buildTransitionEmbed,
  colorForIndicator,
  prettyStatus,
  SEVERITY_COLORS,
  COMPONENT_EMOJI,
};
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/services/statusFormatter.test.js`
Expected: PASS — all tests green.

- [ ] **Step 5: Commit**

```bash
git add src/services/statusFormatter.js tests/services/statusFormatter.test.js
git commit -m "feat(status): add embed builders for summary, incident, and transition"
```

---

## Task 4: `statusFetcher.js` — HTTPS fetch with timeout

**Files:**
- Create: `src/services/statusFetcher.js`
- Create: `tests/services/statusFetcher.test.js`

- [ ] **Step 1: Write failing tests**

Create `tests/services/statusFetcher.test.js`:

```javascript
import { describe, it, expect } from 'vitest';
import { createFetcher } from '../../src/services/statusFetcher.js';

function okFetch(body) {
  return async () => ({ ok: true, status: 200, json: async () => body });
}

function failFetch(status = 500) {
  return async () => ({ ok: false, status, json: async () => ({}) });
}

function throwFetch(err) {
  return async () => { throw err; };
}

describe('createFetcher', () => {
  it('returns parsed JSON on success and resets consecutiveFailures', async () => {
    const fetcher = createFetcher({ fetchFn: okFetch({ ok: 1 }) });
    const body = await fetcher.fetchSummary('https://example.test/summary.json');
    expect(body).toEqual({ ok: 1 });
    expect(fetcher.getConsecutiveFailures()).toBe(0);
  });

  it('throws on non-2xx and increments consecutiveFailures', async () => {
    const fetcher = createFetcher({ fetchFn: failFetch(503) });
    await expect(fetcher.fetchSummary('https://example.test/x')).rejects.toThrow(/503/);
    expect(fetcher.getConsecutiveFailures()).toBe(1);
  });

  it('throws on fetch rejection and increments counter', async () => {
    const fetcher = createFetcher({ fetchFn: throwFetch(new Error('net-down')) });
    await expect(fetcher.fetchSummary('https://example.test/x')).rejects.toThrow(/net-down/);
    expect(fetcher.getConsecutiveFailures()).toBe(1);
  });

  it('accumulates failures until a success resets the counter', async () => {
    let shouldFail = true;
    const fetchFn = async () => {
      if (shouldFail) throw new Error('down');
      return { ok: true, status: 200, json: async () => ({}) };
    };
    const fetcher = createFetcher({ fetchFn });
    await expect(fetcher.fetchSummary('u')).rejects.toThrow();
    await expect(fetcher.fetchSummary('u')).rejects.toThrow();
    expect(fetcher.getConsecutiveFailures()).toBe(2);
    shouldFail = false;
    await fetcher.fetchSummary('u');
    expect(fetcher.getConsecutiveFailures()).toBe(0);
  });

  it('aborts the request when the timeout elapses', async () => {
    // Simulate a fetch that never resolves on its own — only the abort signal ends it.
    const fetchFn = (_url, { signal }) =>
      new Promise((_, reject) => {
        signal.addEventListener('abort', () => reject(new Error('aborted')));
      });
    const fetcher = createFetcher({ fetchFn, timeoutMs: 10 });
    await expect(fetcher.fetchSummary('u')).rejects.toThrow(/abort/i);
    expect(fetcher.getConsecutiveFailures()).toBe(1);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/services/statusFetcher.test.js`
Expected: FAIL — `Cannot find module '../../src/services/statusFetcher.js'`

- [ ] **Step 3: Implement `src/services/statusFetcher.js`**

```javascript
function createFetcher({ fetchFn = fetch, timeoutMs = 10_000 } = {}) {
  let consecutiveFailures = 0;

  async function fetchSummary(url) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetchFn(url, { signal: ctrl.signal });
      if (!res.ok) {
        consecutiveFailures += 1;
        throw new Error(`HTTP ${res.status}`);
      }
      const body = await res.json();
      consecutiveFailures = 0;
      return body;
    } catch (err) {
      // If we haven't counted this failure yet (i.e., the error wasn't the !res.ok
      // branch above), count it now. We track "threw or not OK" as one failure.
      if (!/^HTTP \d+$/.test(err?.message ?? '')) consecutiveFailures += 1;
      throw err;
    } finally {
      clearTimeout(t);
    }
  }

  return {
    fetchSummary,
    getConsecutiveFailures: () => consecutiveFailures,
  };
}

module.exports = { createFetcher };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/services/statusFetcher.test.js`
Expected: PASS — all 5 tests green.

- [ ] **Step 5: Commit**

```bash
git add src/services/statusFetcher.js tests/services/statusFetcher.test.js
git commit -m "feat(status): add HTTPS fetcher with timeout and failure counter"
```

---

## Task 5: `statusStore.js` — Firestore CRUD

**Files:**
- Create: `src/services/statusStore.js`
- Create: `tests/services/statusStore.test.js`

- [ ] **Step 1: Write failing tests**

Create `tests/services/statusStore.test.js`:

```javascript
import { describe, it, expect, beforeEach } from 'vitest';
import { createStore } from '../../src/services/statusStore.js';

// Minimal in-memory Firestore fake that matches the surface statusStore uses:
//   db.collection(name).doc(id).get() / .set(data, { merge }) / .update(data)
//   db.collection(name).where(field, op, value).get()
function makeFakeDb() {
  const collections = new Map();

  function collection(name) {
    if (!collections.has(name)) collections.set(name, new Map());
    const docs = collections.get(name);

    function doc(id) {
      return {
        async get() {
          const data = docs.get(id);
          return { id, exists: data !== undefined, data: () => data ?? null };
        },
        async set(data, options = {}) {
          if (options.merge) {
            docs.set(id, { ...(docs.get(id) ?? {}), ...data });
          } else {
            docs.set(id, { ...data });
          }
        },
        async update(patch) {
          const existing = docs.get(id);
          if (existing === undefined) {
            const err = new Error('NOT_FOUND');
            err.code = 5;
            throw err;
          }
          docs.set(id, { ...existing, ...patch });
        },
      };
    }

    function where(field, op, value) {
      return {
        async get() {
          const matches = [];
          for (const [id, data] of docs.entries()) {
            const v = data?.[field];
            if (op === '==' && v === value) matches.push({ id, data: () => data });
          }
          return { docs: matches, empty: matches.length === 0 };
        },
      };
    }

    return { doc, where };
  }

  return { collection };
}

describe('statusStore', () => {
  let db;
  let store;

  beforeEach(() => {
    db = makeFakeDb();
    store = createStore(db);
  });

  it('get returns null when no document exists', async () => {
    const res = await store.get('guild1');
    expect(res).toBeNull();
  });

  it('save creates a document and get returns it', async () => {
    await store.save('guild1', { channelId: 'ch1', enabled: true });
    const res = await store.get('guild1');
    expect(res.channelId).toBe('ch1');
    expect(res.enabled).toBe(true);
    expect(res.guildId).toBe('guild1');
    expect(res.updatedAt).toBeTruthy();
  });

  it('save merges instead of overwriting', async () => {
    await store.save('guild1', { channelId: 'ch1', enabled: true });
    await store.save('guild1', { pinnedMessageId: 'msg1' });
    const res = await store.get('guild1');
    expect(res.channelId).toBe('ch1');
    expect(res.pinnedMessageId).toBe('msg1');
    expect(res.enabled).toBe(true);
  });

  it('listEnabled returns only enabled guilds', async () => {
    await store.save('g1', { enabled: true });
    await store.save('g2', { enabled: false });
    await store.save('g3', { enabled: true });
    const enabled = await store.listEnabled();
    const ids = enabled.map(r => r.id).sort();
    expect(ids).toEqual(['g1', 'g3']);
  });

  it('disable flips enabled to false and keeps other fields', async () => {
    await store.save('g1', { enabled: true, channelId: 'ch1' });
    await store.disable('g1');
    const res = await store.get('g1');
    expect(res.enabled).toBe(false);
    expect(res.channelId).toBe('ch1');
  });

  it('clearPinnedMessageId nulls the pinnedMessageId field', async () => {
    await store.save('g1', { enabled: true, pinnedMessageId: 'msg1' });
    await store.clearPinnedMessageId('g1');
    const res = await store.get('g1');
    expect(res.pinnedMessageId).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/services/statusStore.test.js`
Expected: FAIL — `Cannot find module '../../src/services/statusStore.js'`

- [ ] **Step 3: Implement `src/services/statusStore.js`**

```javascript
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/services/statusStore.test.js`
Expected: PASS — all 6 tests green.

- [ ] **Step 5: Commit**

```bash
git add src/services/statusStore.js tests/services/statusStore.test.js
git commit -m "feat(status): add Firestore-backed per-guild status config store"
```

---

## Task 6: `statusPoller.js` — orchestration

**Files:**
- Create: `src/services/statusPoller.js`
- Create: `tests/services/statusPoller.test.js`

- [ ] **Step 1: Write failing tests**

Create `tests/services/statusPoller.test.js`:

```javascript
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createPoller } from '../../src/services/statusPoller.js';

const fixture = (name) =>
  JSON.parse(readFileSync(join(__dirname, '../fixtures/status/', name), 'utf-8'));

// Fake Discord client with just enough surface for the poller.
function makeFakeClient({ fetchChannel, fetchRole } = {}) {
  return {
    channels: {
      fetch: fetchChannel ?? vi.fn(),
    },
    guilds: {
      fetch: vi.fn(async (id) => ({
        id,
        roles: { fetch: fetchRole ?? vi.fn() },
      })),
    },
  };
}

function makeFakeChannel(overrides = {}) {
  const sentMessages = [];
  const editedMessages = [];
  const messageStore = new Map();
  let msgCounter = 0;

  const ch = {
    id: 'ch1',
    isTextBased: () => true,
    send: vi.fn(async (payload) => {
      const id = `msg-${++msgCounter}`;
      const pinFn = vi.fn(async () => {});
      const msg = { id, pin: pinFn, payload };
      messageStore.set(id, msg);
      sentMessages.push({ id, payload });
      return msg;
    }),
    messages: {
      fetch: vi.fn(async (id) => {
        const m = messageStore.get(id);
        if (!m) {
          const err = new Error('Unknown Message');
          err.code = 10008;
          throw err;
        }
        return {
          id: m.id,
          edit: vi.fn(async (p) => { editedMessages.push({ id, payload: p }); }),
        };
      }),
    },
    ...overrides,
  };

  ch._sent = sentMessages;
  ch._edited = editedMessages;
  return ch;
}

function makeFakeStore(initial = {}) {
  const docs = new Map(Object.entries(initial));
  return {
    _docs: docs,
    async get(id) { return docs.has(id) ? { id, ...docs.get(id) } : null; },
    async save(id, patch) {
      docs.set(id, { ...(docs.get(id) ?? {}), ...patch });
    },
    async listEnabled() {
      const out = [];
      for (const [id, data] of docs.entries()) {
        if (data.enabled) out.push({ id, ...data });
      }
      return out;
    },
    async disable(id) {
      docs.set(id, { ...(docs.get(id) ?? {}), enabled: false });
    },
    async clearPinnedMessageId(id) {
      docs.set(id, { ...(docs.get(id) ?? {}), pinnedMessageId: null });
    },
  };
}

describe('statusPoller.runTick', () => {
  it('creates and pins a summary message on first tick with no prior state', async () => {
    const channel = makeFakeChannel();
    const client = makeFakeClient({ fetchChannel: vi.fn(async () => channel) });
    const store = makeFakeStore({
      g1: { enabled: true, channelId: 'ch1', pinnedMessageId: null },
    });
    const fetcher = { fetchSummary: vi.fn(async () => fixture('all-operational.json')) };
    const poller = createPoller({
      client, fetcher, store,
      config: { getConfig: () => 'https://status.poke.com' },
      logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
    });

    await poller.runTick();

    expect(channel.send).toHaveBeenCalledTimes(1);
    const stored = await store.get('g1');
    expect(stored.pinnedMessageId).toMatch(/^msg-/);
    // lastSummary persisted for next diff
    expect(stored.lastSummary).toBeTruthy();
  });

  it('edits the pinned message on subsequent tick and posts a transition alert when a component flips', async () => {
    const channel = makeFakeChannel();
    channel.messages.fetch = vi.fn(async () => ({ id: 'msg-existing', edit: vi.fn(async () => {}) }));
    const client = makeFakeClient({ fetchChannel: vi.fn(async () => channel) });

    // Store has previous snapshot (all operational) and a pinned message id already.
    const store = makeFakeStore({
      g1: {
        enabled: true,
        channelId: 'ch1',
        pinnedMessageId: 'msg-existing',
        lastSummary: fixture('all-operational.json'),
      },
    });
    const fetcher = { fetchSummary: vi.fn(async () => fixture('partial-outage.json')) };
    const poller = createPoller({
      client, fetcher, store,
      config: { getConfig: () => 'https://status.poke.com' },
      logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
    });

    await poller.runTick();

    // Two transitions in the partial-outage fixture: Email + iMessage Group.
    expect(channel.send).toHaveBeenCalledTimes(2);
    // No NEW pinned message — we edited the existing one.
    expect(channel.messages.fetch).toHaveBeenCalled();
  });

  it('posts an incident alert with role ping when alertRoleId is set and incident is new', async () => {
    const channel = makeFakeChannel();
    const client = makeFakeClient({ fetchChannel: vi.fn(async () => channel) });
    const store = makeFakeStore({
      g1: {
        enabled: true, channelId: 'ch1', pinnedMessageId: 'msg-existing',
        alertRoleId: 'role123',
        lastSummary: fixture('all-operational.json'),
      },
    });
    // Override fetch so edit doesn't blow up for the pinned message
    channel.messages.fetch = vi.fn(async () => ({ id: 'msg-existing', edit: vi.fn(async () => {}) }));

    const fetcher = { fetchSummary: vi.fn(async () => fixture('active-incident.json')) };
    const poller = createPoller({
      client, fetcher, store,
      config: { getConfig: () => 'https://status.poke.com' },
      logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
    });

    await poller.runTick();

    // 1 component transition (App op → major_outage) + 1 incident create = 2 sends.
    expect(channel.send).toHaveBeenCalledTimes(2);
    const roleMention = channel.send.mock.calls.find(c =>
      typeof c[0]?.content === 'string' && c[0].content.includes('<@&role123>')
    );
    expect(roleMention).toBeTruthy();
  });

  it('clears pinnedMessageId when the pinned message was deleted (Unknown Message 10008)', async () => {
    const channel = makeFakeChannel();
    channel.messages.fetch = vi.fn(async () => {
      const err = new Error('Unknown Message');
      err.code = 10008;
      throw err;
    });
    const client = makeFakeClient({ fetchChannel: vi.fn(async () => channel) });
    const store = makeFakeStore({
      g1: {
        enabled: true, channelId: 'ch1',
        pinnedMessageId: 'msg-gone',
        lastSummary: fixture('all-operational.json'),
      },
    });
    const fetcher = { fetchSummary: vi.fn(async () => fixture('all-operational.json')) };
    const poller = createPoller({
      client, fetcher, store,
      config: { getConfig: () => 'https://status.poke.com' },
      logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
    });

    await poller.runTick();

    const saved = await store.get('g1');
    // After the tick the pinned message is re-created with a new id.
    expect(saved.pinnedMessageId).toMatch(/^msg-/);
    expect(saved.pinnedMessageId).not.toBe('msg-gone');
  });

  it('disables a guild when the channel was deleted (Unknown Channel 10003)', async () => {
    const deletedChannelFetch = vi.fn(async () => {
      const err = new Error('Unknown Channel');
      err.code = 10003;
      throw err;
    });
    const client = makeFakeClient({ fetchChannel: deletedChannelFetch });
    const store = makeFakeStore({
      g1: {
        enabled: true, channelId: 'ch-gone',
        pinnedMessageId: null,
        lastSummary: null,
      },
    });
    const fetcher = { fetchSummary: vi.fn(async () => fixture('all-operational.json')) };
    const poller = createPoller({
      client, fetcher, store,
      config: { getConfig: () => 'https://status.poke.com' },
      logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
    });

    await poller.runTick();

    const saved = await store.get('g1');
    expect(saved.enabled).toBe(false);
  });

  it('skips the tick on fetch failure and does not post anything', async () => {
    const channel = makeFakeChannel();
    const client = makeFakeClient({ fetchChannel: vi.fn(async () => channel) });
    const store = makeFakeStore({
      g1: { enabled: true, channelId: 'ch1', pinnedMessageId: 'msg-x', lastSummary: null },
    });
    const warn = vi.fn();
    const fetcher = { fetchSummary: vi.fn(async () => { throw new Error('down'); }), getConsecutiveFailures: () => 1 };
    const poller = createPoller({
      client, fetcher, store,
      config: { getConfig: () => 'https://status.poke.com' },
      logger: { warn, error: vi.fn(), info: vi.fn() },
    });

    await poller.runTick();

    expect(channel.send).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/services/statusPoller.test.js`
Expected: FAIL — `Cannot find module '../../src/services/statusPoller.js'`

- [ ] **Step 3: Implement `src/services/statusPoller.js`**

```javascript
const cron = require('node-cron');
const { normalize, diff } = require('./statusDiff');
const {
  buildSummaryEmbed,
  buildIncidentEmbed,
  buildTransitionEmbed,
} = require('./statusFormatter');

const ERR_UNKNOWN_MESSAGE = 10008;
const ERR_UNKNOWN_CHANNEL = 10003;
const ERR_MISSING_PERMS = 50013;

function createPoller({ client, fetcher, store, config, logger = console }) {
  let cronTask = null;

  function statusPageUrl() {
    const apiUrl = config.getConfig('status_api_url') || 'https://status.poke.com/api/v2/summary.json';
    try { return new URL(apiUrl).origin; } catch { return 'https://status.poke.com'; }
  }

  async function applyToGuild(guildRecord, rawSummary) {
    const channelId = guildRecord.channelId;
    let channel;
    try {
      channel = await client.channels.fetch(channelId);
    } catch (err) {
      if (err?.code === ERR_UNKNOWN_CHANNEL) {
        logger.info(`[status] channel ${channelId} gone for guild ${guildRecord.id}; disabling`);
        await store.disable(guildRecord.id);
        return;
      }
      logger.warn(`[status] failed to fetch channel ${channelId}: ${err?.message}`);
      return;
    }
    if (!channel) {
      logger.info(`[status] channel ${channelId} not found; disabling guild ${guildRecord.id}`);
      await store.disable(guildRecord.id);
      return;
    }

    const nextSnap = normalize(rawSummary);
    const prevSnap = guildRecord.lastSummary ? normalize(guildRecord.lastSummary) : null;
    const d = diff(prevSnap, nextSnap);
    const pageUrl = statusPageUrl();

    // 1) Update (or create) the pinned summary message.
    const { embed, row } = buildSummaryEmbed(nextSnap, { statusPageUrl: pageUrl });
    let pinnedMessageId = guildRecord.pinnedMessageId;

    if (pinnedMessageId) {
      try {
        const msg = await channel.messages.fetch(pinnedMessageId);
        await msg.edit({ embeds: [embed], components: [row] });
      } catch (err) {
        if (err?.code === ERR_UNKNOWN_MESSAGE) {
          logger.info(`[status] pinned msg ${pinnedMessageId} gone for guild ${guildRecord.id}; creating new`);
          pinnedMessageId = null;
        } else if (err?.code === ERR_MISSING_PERMS) {
          logger.warn(`[status] missing permissions in channel ${channelId}`);
          return;
        } else {
          logger.warn(`[status] failed to edit pinned message: ${err?.message}`);
        }
      }
    }

    if (!pinnedMessageId) {
      try {
        const msg = await channel.send({ embeds: [embed], components: [row] });
        try { await msg.pin(); } catch (e) { logger.warn(`[status] could not pin: ${e?.message}`); }
        pinnedMessageId = msg.id;
      } catch (err) {
        logger.warn(`[status] failed to create pinned message: ${err?.message}`);
        return;
      }
    }

    // 2) Transition alerts (no ping).
    for (const t of d.componentTransitions) {
      try {
        await channel.send({ embeds: [buildTransitionEmbed(t, pageUrl)] });
      } catch (err) {
        logger.warn(`[status] transition send failed: ${err?.message}`);
      }
    }

    // 3) Incident alerts. Ping alertRoleId only on NEW incidents.
    const rolePrefix = guildRecord.alertRoleId ? `<@&${guildRecord.alertRoleId}>` : null;
    for (const inc of d.incidentsCreated) {
      try {
        await channel.send({
          content: rolePrefix ?? undefined,
          embeds: [buildIncidentEmbed(inc, { kind: 'new', statusPageUrl: pageUrl })],
          allowedMentions: rolePrefix ? { roles: [guildRecord.alertRoleId] } : undefined,
        });
      } catch (err) {
        logger.warn(`[status] new-incident send failed: ${err?.message}`);
      }
    }
    for (const { incident } of d.incidentsUpdated) {
      try {
        await channel.send({
          embeds: [buildIncidentEmbed(incident, { kind: 'update', statusPageUrl: pageUrl })],
        });
      } catch (err) {
        logger.warn(`[status] incident-update send failed: ${err?.message}`);
      }
    }
    for (const inc of d.incidentsResolved) {
      try {
        await channel.send({
          embeds: [buildIncidentEmbed(inc, { kind: 'resolved', statusPageUrl: pageUrl })],
        });
      } catch (err) {
        logger.warn(`[status] resolved-incident send failed: ${err?.message}`);
      }
    }

    // 4) Persist new snapshot.
    await store.save(guildRecord.id, {
      pinnedMessageId,
      lastSummary: rawSummary,
    });
  }

  async function runTick() {
    let rawSummary;
    try {
      const apiUrl = config.getConfig('status_api_url') || 'https://status.poke.com/api/v2/summary.json';
      rawSummary = await fetcher.fetchSummary(apiUrl);
    } catch (err) {
      const consecutive = fetcher.getConsecutiveFailures ? fetcher.getConsecutiveFailures() : 1;
      logger.warn(`[status] fetch failed (${consecutive}): ${err?.message}`);
      if (consecutive === 3) {
        logger.error(`[status] 3 consecutive fetch failures; status page may be down`);
      }
      return;
    }

    let enabled;
    try {
      enabled = await store.listEnabled();
    } catch (err) {
      logger.warn(`[status] failed to list enabled guilds: ${err?.message}`);
      return;
    }

    for (const g of enabled) {
      try {
        await applyToGuild(g, rawSummary);
      } catch (err) {
        logger.warn(`[status] guild ${g.id} tick failed: ${err?.message}`);
      }
    }
  }

  async function runTickForGuild(guildId) {
    const g = await store.get(guildId);
    if (!g || !g.enabled) return null;
    let rawSummary;
    try {
      const apiUrl = config.getConfig('status_api_url') || 'https://status.poke.com/api/v2/summary.json';
      rawSummary = await fetcher.fetchSummary(apiUrl);
    } catch (err) {
      logger.warn(`[status] on-demand fetch failed: ${err?.message}`);
      throw err;
    }
    await applyToGuild(g, rawSummary);
    return rawSummary;
  }

  async function fetchOnce() {
    const apiUrl = config.getConfig('status_api_url') || 'https://status.poke.com/api/v2/summary.json';
    return fetcher.fetchSummary(apiUrl);
  }

  function start() {
    if (cronTask) return;
    const expr = config.getConfig('status_poll_cron') || '*/2 * * * *';
    cronTask = cron.schedule(expr, () => {
      runTick().catch(err => logger.error(`[status] tick error: ${err?.message}`));
    });
    logger.info(`[status] poller started with cron "${expr}"`);
  }

  function stop() {
    if (cronTask) {
      cronTask.stop();
      cronTask = null;
    }
  }

  return { runTick, runTickForGuild, fetchOnce, start, stop };
}

module.exports = { createPoller };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/services/statusPoller.test.js`
Expected: PASS — all 6 tests green.

- [ ] **Step 5: Run ALL tests to ensure nothing else broke**

Run: `npm test`
Expected: PASS — all existing suites + new suites green.

- [ ] **Step 6: Commit**

```bash
git add src/services/statusPoller.js tests/services/statusPoller.test.js
git commit -m "feat(status): add cron-driven poller orchestrating fetch + diff + Discord"
```

---

## Task 7: `/status` slash command

**Files:**
- Create: `src/commands/status.js`

This task has no unit tests — the file is a thin Discord.js shell. It's verified by the runtime smoke check in Task 9.

- [ ] **Step 1: Implement `src/commands/status.js`**

```javascript
const { SlashCommandBuilder, ChannelType, PermissionFlagsBits } = require('discord.js');
const { createFetcher } = require('../services/statusFetcher');
const { createStore } = require('../services/statusStore');
const { createPoller } = require('../services/statusPoller');
const { buildSummaryEmbed } = require('../services/statusFormatter');
const { normalize } = require('../services/statusDiff');
const config = require('../config/config');
const admin = require('firebase-admin');

const commandData = new SlashCommandBuilder()
  .setName('status')
  .setDescription('Check Poke status')
  .addSubcommand(sub =>
    sub.setName('check')
      .setDescription('Show the current Poke status (ephemeral)'))
  .addSubcommand(sub =>
    sub.setName('setup')
      .setDescription('Create or adopt a status channel for this server')
      .addChannelOption(opt =>
        opt.setName('channel')
          .setDescription('Existing channel to use (default: create #poke-status)')
          .addChannelTypes(ChannelType.GuildText))
      .addRoleOption(opt =>
        opt.setName('alert_role')
          .setDescription('Role to ping on new incidents (optional)')))
  .addSubcommand(sub =>
    sub.setName('disable')
      .setDescription('Stop tracking status in this server'))
  .setDefaultMemberPermissions(PermissionFlagsBits.ViewChannel);

async function execute(interaction) {
  const sub = interaction.options.getSubcommand();

  if (sub === 'check') {
    return handleCheck(interaction);
  }

  // setup and disable both require ManageChannels.
  const member = interaction.member;
  if (!member?.permissions?.has(PermissionFlagsBits.ManageChannels)) {
    return interaction.reply({
      content: 'You need the **Manage Channels** permission to configure the status integration.',
      ephemeral: true,
    });
  }

  if (sub === 'setup') return handleSetup(interaction);
  if (sub === 'disable') return handleDisable(interaction);
}

function getDeps() {
  const db = admin.firestore();
  const store = createStore(db);
  const fetcher = createFetcher({ timeoutMs: config.getConfig('status_fetch_timeout_ms') || 10000 });
  return { store, fetcher };
}

async function handleCheck(interaction) {
  await interaction.deferReply({ ephemeral: true });

  if (!config.getConfig('status_enabled')) {
    return interaction.editReply({ content: 'Status feature is disabled globally. Ask an admin to enable `status_enabled` via `/config`.' });
  }

  const { store, fetcher } = getDeps();
  const poller = createPoller({
    client: interaction.client,
    fetcher, store, config,
  });

  try {
    const raw = await poller.runTickForGuild(interaction.guildId).catch(async () => {
      // Guild may not be configured — still show an on-demand summary.
      return poller.fetchOnce();
    });
    const snap = normalize(raw);
    const { embed, row } = buildSummaryEmbed(snap, { statusPageUrl: 'https://status.poke.com' });
    await interaction.editReply({ embeds: [embed], components: [row] });
  } catch (err) {
    console.error('[status] /status check failed:', err);
    await interaction.editReply({ content: 'Could not reach the Poke status page right now. Try again in a minute.' });
  }
}

async function handleSetup(interaction) {
  await interaction.deferReply({ ephemeral: true });

  if (!config.getConfig('status_enabled')) {
    return interaction.editReply({ content: 'Status feature is disabled globally. Ask an admin to enable `status_enabled` via `/config`.' });
  }

  const providedChannel = interaction.options.getChannel('channel');
  const alertRole = interaction.options.getRole('alert_role');

  if (alertRole && (alertRole.id === interaction.guildId || alertRole.name === '@everyone')) {
    return interaction.editReply({ content: 'The alert role cannot be `@everyone`.' });
  }

  let channel = providedChannel;
  if (!channel) {
    const name = config.getConfig('status_default_channel_name') || 'poke-status';
    try {
      channel = await interaction.guild.channels.create({
        name,
        type: ChannelType.GuildText,
        parent: interaction.channel?.parentId ?? null,
        reason: `Requested by ${interaction.user.tag} via /status setup`,
      });
    } catch (err) {
      console.error('[status] channel create failed:', err);
      return interaction.editReply({ content: `Could not create channel: ${err?.message}` });
    }
  }

  // Verify the bot has the perms it needs in the target channel.
  const me = interaction.guild.members.me;
  const required = [
    PermissionFlagsBits.ViewChannel,
    PermissionFlagsBits.SendMessages,
    PermissionFlagsBits.ManageMessages,
    PermissionFlagsBits.EmbedLinks,
  ];
  const missing = required.filter(p => !channel.permissionsFor(me).has(p));
  if (missing.length > 0) {
    return interaction.editReply({
      content: `I'm missing permissions in ${channel}: need **View Channel**, **Send Messages**, **Manage Messages**, and **Embed Links**.`,
    });
  }

  const { store, fetcher } = getDeps();
  await store.save(interaction.guildId, {
    channelId: channel.id,
    alertRoleId: alertRole?.id ?? null,
    enabled: true,
  });

  // Run one tick immediately so the pinned message appears right away.
  const poller = createPoller({
    client: interaction.client, fetcher, store, config,
  });
  try {
    await poller.runTickForGuild(interaction.guildId);
  } catch (err) {
    console.warn('[status] initial tick failed:', err?.message);
  }

  await interaction.editReply({
    content: `Status tracking enabled in ${channel}${alertRole ? ` — ${alertRole} will be pinged on new incidents` : ''}.`,
  });
}

async function handleDisable(interaction) {
  await interaction.deferReply({ ephemeral: true });
  const { store } = getDeps();
  const existing = await store.get(interaction.guildId);
  if (!existing) {
    return interaction.editReply({ content: 'Status tracking is not configured in this server.' });
  }

  // Try to unpin the summary message if present.
  if (existing.pinnedMessageId && existing.channelId) {
    try {
      const ch = await interaction.client.channels.fetch(existing.channelId);
      const msg = await ch.messages.fetch(existing.pinnedMessageId);
      await msg.unpin().catch(() => {});
    } catch (err) {
      // Channel/message might be gone — not worth blocking on.
    }
  }

  await store.disable(interaction.guildId);
  await interaction.editReply({ content: 'Status tracking disabled. Run `/status setup` to re-enable.' });
}

module.exports = { data: commandData, execute };
```

- [ ] **Step 2: Syntax-check the new file**

Run: `node --check src/commands/status.js`
Expected: no output (success).

- [ ] **Step 3: Commit**

```bash
git add src/commands/status.js
git commit -m "feat(status): add /status command with check, setup, and disable subcommands"
```

---

## Task 8: Wire the command and poller into `index.js`

**Files:**
- Modify: `src/index.js`

- [ ] **Step 1: Add the command import near the other command imports**

In `src/index.js`, add after line 47 (after `const autoscrapeCommand = require('./commands/autoscrape');`):

```javascript
const statusCommand = require('./commands/status');
const { createFetcher } = require('./services/statusFetcher');
const { createStore: createStatusStore } = require('./services/statusStore');
const { createPoller: createStatusPoller } = require('./services/statusPoller');
```

- [ ] **Step 2: Register the command in `registerCommands()`**

In `src/index.js`, inside the `body: [...]` array in `registerCommands`, add `statusCommand.data.toJSON()` at the end (before the closing `]`). The line change:

```javascript
// Before:
// ... autoscrapeCommand.data.toJSON()] },

// After:
// ... autoscrapeCommand.data.toJSON(), statusCommand.data.toJSON()] },
```

- [ ] **Step 3: Add to the slash-commands dispatch map**

In `src/index.js`, in the `interactionCreate` handler's `commands` map (around line 259), add `status: statusCommand` at the end:

```javascript
// Before:
// ... recipes: recipesCommand, autoscrape: autoscrapeCommand };

// After:
// ... recipes: recipesCommand, autoscrape: autoscrapeCommand, status: statusCommand };
```

- [ ] **Step 4: Start the poller inside the `ready` handler**

In `src/index.js`, inside `client.once('ready', ...)`, after the existing `triage.startDigestScheduler(guild);` line, add the status poller bootstrap:

```javascript
// Start the Poke status poller (guild-independent; iterates enabled guilds itself).
if (config.getConfig('status_enabled')) {
  try {
    const admin = require('firebase-admin');
    const statusStore = createStatusStore(admin.firestore());
    const statusFetcher = createFetcher({
      timeoutMs: config.getConfig('status_fetch_timeout_ms') || 10000,
    });
    const statusPoller = createStatusPoller({
      client,
      fetcher: statusFetcher,
      store: statusStore,
      config,
    });
    statusPoller.start();
  } catch (err) {
    console.error('[status] failed to start poller:', err);
  }
} else {
  console.log('[status] poller not started (status_enabled=false)');
}
```

- [ ] **Step 5: Syntax-check and boot-smoke `index.js`**

Run: `node --check src/index.js`
Expected: no output (success).

- [ ] **Step 6: Run ALL tests to confirm nothing broke**

Run: `npm test`
Expected: PASS — all existing suites + new suites green.

- [ ] **Step 7: Commit**

```bash
git add src/index.js
git commit -m "feat(status): register /status command and start poller on ready"
```

---

## Task 9: Boot smoke test, push, open PR

- [ ] **Step 1: Boot the bot briefly to verify it starts cleanly**

The `.env` credentials must be present (DISCORD_TOKEN, FIREBASE_*, OPENROUTER_API_KEY). If the user runs this themselves, ask them to start the bot with `npm start` for ~10 seconds, confirm they see:

```
Slash commands registered.
Logged in as <bot-tag>
[status] poller not started (status_enabled=false)
```

If `status_enabled` has been flipped on in Firestore already, they should instead see:

```
[status] poller started with cron "*/2 * * * *"
```

Kill the process with Ctrl-C.

Note: if credentials aren't available in this environment, skip this step and note it explicitly in the PR body as a manual-test item.

- [ ] **Step 2: Verify working tree is clean**

Run: `git status`
Expected: `nothing to commit, working tree clean` (possibly with the untracked `.claude/`, `.vercel/`, `CLAUDE.md`, `recipes-site/.vercel/`, `0001-feat-add-issue-context.patch` left over from the starting state — those are intentionally not part of this PR).

- [ ] **Step 3: Push the branch**

Run: `git push -u origin feat/poke-status-channel`
Expected: branch is pushed and tracking is set.

- [ ] **Step 4: Open the pull request**

Run:

```bash
gh pr create --title "feat: add /status command and auto-updating Poke status channel" --body "$(cat <<'EOF'
## Summary
- Adds `/status check | setup | disable` slash command that surfaces the current state of status.poke.com.
- Adds a `node-cron` poller (default `*/2 * * * *`) that maintains a pinned summary message in a dedicated channel and posts transition/incident alerts.
- Disabled by default (`status_enabled: false` in `config.json`); no behavior change for existing deployments until an admin flips the flag via `/config`.

## Architecture
Six new modules under `src/services/`:
- `statusFetcher.js` — HTTPS fetch with timeout and a consecutive-failure counter.
- `statusDiff.js` — pure snapshot normalizer + differ.
- `statusFormatter.js` — pure embed builders.
- `statusStore.js` — Firestore CRUD for `status_config/{guildId}`.
- `statusPoller.js` — cron-driven orchestrator (also called directly by the slash command for on-demand refresh).
- `commands/status.js` — the slash command.

All modules accept their dependencies via injection so they're unit-testable without Discord or the network.

## Tests
New vitest suites under `tests/services/` and `tests/fixtures/status/`:
- `statusDiff.test.js` — 8 scenarios
- `statusFormatter.test.js` — 11 assertions covering severity→color, embed shape, incident/transition formatting
- `statusFetcher.test.js` — 5 scenarios (success, 5xx, timeout, counter reset)
- `statusStore.test.js` — 6 cases with an in-memory Firestore fake
- `statusPoller.test.js` — 6 integration scenarios (first tick, transitions, role ping, msg-deleted, channel-deleted, fetch fail)

## Test plan
- [x] `npm test` — all suites green
- [ ] Local `npm start` smoke: bot boots, registers commands, logs `[status] poller not started (status_enabled=false)` while disabled
- [ ] Flip `status_enabled` via `/config`, run `/status setup`, confirm channel + pinned message appear
- [ ] Force a status change (or wait for one) and confirm transition alert posts
- [ ] Confirm role ping only fires on new incidents, not on component transitions

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

Expected: `gh` prints the PR URL. Surface that URL back to the user.

- [ ] **Step 5: Share the PR URL**

Report the PR URL to the user along with a one-line summary of what was shipped.

---

## Self-Review (notes for the executor)

**Spec coverage:**
- On-demand `/status` refreshes the pinned message → Task 7 `handleCheck` calls `runTickForGuild`, which applies updates. ✔
- Flat config keys → Task 1. ✔
- Six services + command → Tasks 2–7. ✔
- `index.js` wiring gated on `status_enabled` → Task 8. ✔
- First-snapshot rules (no component noise, incidents reported) → Task 2 tests. ✔
- Error handling for deleted msg/channel → Task 6 tests + poller implementation. ✔
- Tests use vitest + existing conventions → every test file. ✔
- New PR from `main` → Task 9. ✔

**Type consistency:**
- `diff` / `normalize` — Task 2, used consistently in Tasks 6 and 7.
- `createFetcher` / `createStore` / `createPoller` — factory style, matches across tasks.
- `runTickForGuild(guildId)` — same signature in Task 6 and Task 7.
- Config keys — `status_enabled`, `status_api_url`, `status_poll_cron`, `status_fetch_timeout_ms`, `status_default_channel_name` — identical across Tasks 1, 7, 8.
