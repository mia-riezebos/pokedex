const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const { buildIssueEmbed } = require('../src/services/triage');

describe('buildIssueEmbed title', () => {
  test('leads with #number when issue.number is set', () => {
    const embed = buildIssueEmbed(
      { summary: 'Calendar not syncing', number: 1234, priority: 'high', category: 'bug' },
      'abc123',
    );
    assert.equal(embed.data.title, '#1234 — Calendar not syncing');
  });

  test('keeps Issue ID in the footer alongside the ticket #', () => {
    const embed = buildIssueEmbed(
      { summary: 's', number: 42, priority: 'low' },
      'doc-id-xyz',
    );
    assert.equal(embed.data.footer.text, 'Ticket #42 | Issue ID: doc-id-xyz');
  });

  test('falls back to plain summary when number is missing', () => {
    const embed = buildIssueEmbed(
      { summary: 'no number yet', priority: 'medium' },
      'doc-id',
    );
    assert.equal(embed.data.title, 'no number yet');
    assert.equal(embed.data.footer.text, 'Issue ID: doc-id');
  });

  test('preserves the [Pokedex self] prefix when target is pokedex_bot', () => {
    const embed = buildIssueEmbed(
      { summary: 'bot broke', number: 7, target: 'pokedex_bot' },
      'id',
    );
    assert.equal(embed.data.title, '#7 — [Pokedex self] bot broke');
  });

  test('renders an Additional Context field when issue.additionalContext is non-empty', () => {
    const embed = buildIssueEmbed(
      {
        summary: 's',
        number: 1,
        additionalContext: [
          { text: 'first add', authorName: 'alice', addedAt: '2026-05-25T10:00:00Z' },
          { text: 'second add', authorName: 'bob', addedAt: '2026-05-25T10:05:00Z' },
        ],
      },
      'id',
    );
    const field = embed.data.fields.find(f => f.name === '📝 Additional Context');
    assert.ok(field, 'expected an Additional Context field');
    assert.match(field.value, /alice/);
    assert.match(field.value, /first add/);
    assert.match(field.value, /bob/);
    assert.match(field.value, /second add/);
  });
});
