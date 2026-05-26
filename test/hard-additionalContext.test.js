'use strict';

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const {
  normalizeAdditionalContextText,
  buildTriageRefreshPayload,
  MAX_LEN,
} = require('../src/services/addContext');
const { buildIssueEmbed } = require('../src/services/triage');

describe('normalizeAdditionalContextText — boundaries', () => {
  test('exactly MAX_LEN chars is returned unchanged', () => {
    const exact = 'a'.repeat(MAX_LEN);
    const out = normalizeAdditionalContextText(exact);
    assert.equal(out, exact);
    assert.equal(out.length, MAX_LEN);
    assert.ok(!out.endsWith('…'), 'must not append ellipsis at the boundary');
  });

  test('MAX_LEN + 1 chars is sliced and ellipsised to exactly MAX_LEN', () => {
    const over = 'a'.repeat(MAX_LEN + 1);
    const out = normalizeAdditionalContextText(over);
    assert.equal(out.length, MAX_LEN);
    assert.ok(out.endsWith('…'));
  });

  test('whitespace-only inputs collapse to null', () => {
    for (const input of ['', ' ', '\n', '\t', '\r\n\t  ']) {
      assert.equal(normalizeAdditionalContextText(input), null, `expected null for ${JSON.stringify(input)}`);
    }
  });

  test('null and undefined produce null without throwing', () => {
    assert.equal(normalizeAdditionalContextText(null), null);
    assert.equal(normalizeAdditionalContextText(undefined), null);
  });

  test('coerces non-string inputs via String()', () => {
    assert.equal(normalizeAdditionalContextText(42), '42');
    assert.equal(normalizeAdditionalContextText(true), 'true');
  });

  test('preserves multi-byte unicode under the cap', () => {
    const emoji = '🐛🔥✨';
    assert.equal(normalizeAdditionalContextText(emoji), emoji);
  });

  test('preserves embedded newlines and tabs in the middle', () => {
    const mixed = 'line one\nline two\tcol';
    assert.equal(normalizeAdditionalContextText(mixed), mixed);
  });
});

describe('Additional Context embed field — adversarial inputs', () => {
  test('omits the field entirely when additionalContext is missing, null, or empty', () => {
    for (const additionalContext of [undefined, null, []]) {
      const embed = buildIssueEmbed({ summary: 's', number: 1, additionalContext }, 'id');
      const field = embed.data.fields.find(f => f.name === '📝 Additional Context');
      assert.equal(field, undefined, `field should not exist for ${JSON.stringify(additionalContext)}`);
    }
  });

  test('renders 50 entries truncated to <= 1024 chars with ellipsis', () => {
    const additionalContext = Array.from({ length: 50 }, (_, i) => ({
      text: `entry number ${i} with a fair amount of body text so we exceed the cap`,
      authorName: `user${i}`,
      addedAt: '2026-05-25T10:00:00Z',
    }));
    const embed = buildIssueEmbed({ summary: 's', number: 1, additionalContext }, 'id');
    const field = embed.data.fields.find(f => f.name === '📝 Additional Context');
    assert.ok(field, 'field must exist');
    assert.ok(field.value.length <= 1024, `value length ${field.value.length} exceeds Discord cap`);
    assert.ok(field.value.endsWith('…'), 'truncated value must end with ellipsis');
  });

  test('most-recent entry appears first in rendered value', () => {
    const additionalContext = [
      { text: 'OLDEST', authorName: 'a', addedAt: '2026-05-25T10:00:00Z' },
      { text: 'MIDDLE', authorName: 'b', addedAt: '2026-05-25T10:05:00Z' },
      { text: 'NEWEST', authorName: 'c', addedAt: '2026-05-25T10:10:00Z' },
    ];
    const embed = buildIssueEmbed({ summary: 's', number: 1, additionalContext }, 'id');
    const field = embed.data.fields.find(f => f.name === '📝 Additional Context');
    const newestIdx = field.value.indexOf('NEWEST');
    const middleIdx = field.value.indexOf('MIDDLE');
    const oldestIdx = field.value.indexOf('OLDEST');
    assert.ok(newestIdx < middleIdx && middleIdx < oldestIdx, 'order should be newest → oldest');
  });

  test('rendering does NOT mutate the caller-provided additionalContext array', () => {
    const additionalContext = [
      { text: 'first', authorName: 'a' },
      { text: 'second', authorName: 'b' },
    ];
    const snapshot = JSON.stringify(additionalContext);
    buildIssueEmbed({ summary: 's', number: 1, additionalContext }, 'id');
    assert.equal(JSON.stringify(additionalContext), snapshot, 'caller array must be unchanged');
  });

  test('falls back to _someone_ when authorName is missing/empty', () => {
    for (const authorName of [undefined, null, '']) {
      const embed = buildIssueEmbed(
        { summary: 's', number: 1, additionalContext: [{ text: 'hi', authorName }] },
        'id',
      );
      const field = embed.data.fields.find(f => f.name === '📝 Additional Context');
      assert.ok(field.value.includes('_someone_'), `expected _someone_ fallback for ${JSON.stringify(authorName)}`);
    }
  });

  test('does not crash on a null or undefined entry inside the array', () => {
    const additionalContext = [
      null,
      undefined,
      { text: 'survivor', authorName: 'a' },
    ];
    let embed;
    assert.doesNotThrow(() => {
      embed = buildIssueEmbed({ summary: 's', number: 1, additionalContext }, 'id');
    });
    const field = embed.data.fields.find(f => f.name === '📝 Additional Context');
    assert.ok(field, 'field must still render');
    assert.match(field.value, /survivor/);
  });
});

describe('buildTriageRefreshPayload', () => {
  test('produces a payload Discord can pass to message.edit({embeds})', () => {
    const payload = buildTriageRefreshPayload({ summary: 's', number: 99 }, 'id');
    assert.ok(Array.isArray(payload.embeds));
    assert.equal(payload.embeds.length, 1);
    // EmbedBuilder instances expose toJSON() — sanity-check it serializes.
    assert.doesNotThrow(() => payload.embeds[0].toJSON());
  });
});
