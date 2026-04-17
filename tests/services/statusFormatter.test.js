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
    expect(description).toContain('🟢  **App**');
    expect(description).toContain('🟠  **Email**');
    expect(description).toContain('Partial Outage');
    expect(description).toContain('🟡  **iMessage Group**');
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
