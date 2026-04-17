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

  return result;
}

module.exports = { normalize, diff };
