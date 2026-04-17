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
