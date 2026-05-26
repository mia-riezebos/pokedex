const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const { normalizeAdditionalContextText, buildTriageRefreshPayload } = require('../src/services/addContext');

describe('normalizeAdditionalContextText', () => {
  test('trims whitespace', () => {
    assert.equal(normalizeAdditionalContextText('  hi  '), 'hi');
  });

  test('returns null for empty input', () => {
    assert.equal(normalizeAdditionalContextText(''), null);
    assert.equal(normalizeAdditionalContextText('   '), null);
    assert.equal(normalizeAdditionalContextText(undefined), null);
  });

  test('caps very long input at 1024 chars', () => {
    const huge = 'x'.repeat(2000);
    const out = normalizeAdditionalContextText(huge);
    assert.ok(out.length <= 1024);
    assert.ok(out.endsWith('…'));
  });
});

describe('buildTriageRefreshPayload', () => {
  test('returns the embed array for editing a triage message', () => {
    const issue = {
      summary: 's', number: 7, priority: 'low', category: 'bug',
      additionalContext: [{ text: 'note', authorName: 'alice', addedAt: '2026-05-25T10:00:00Z' }],
    };
    const payload = buildTriageRefreshPayload(issue, 'docid');
    assert.equal(payload.embeds.length, 1);
    const embed = payload.embeds[0];
    assert.equal(embed.data.title, '#7 — s');
    const field = embed.data.fields.find(f => f.name === '📝 Additional Context');
    assert.ok(field, 'embed must render the Additional Context field');
  });
});
