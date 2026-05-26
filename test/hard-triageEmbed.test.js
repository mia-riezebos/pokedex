'use strict';

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const { buildIssueEmbed } = require('../src/services/triage');

describe('buildIssueEmbed — title composition', () => {
  test('number AND pokedex_bot target compose in the documented order', () => {
    // Order: #N — [Pokedex self] summary
    const embed = buildIssueEmbed(
      { summary: 'bot broke', number: 42, target: 'pokedex_bot' },
      'id',
    );
    assert.equal(embed.data.title, '#42 — [Pokedex self] bot broke');
  });

  test('only-number title prefix is exactly "#<n> — "', () => {
    const embed = buildIssueEmbed({ summary: 'x', number: 7 }, 'id');
    assert.equal(embed.data.title, '#7 — x');
  });

  test('number=0 is treated as a valid number (still prefixed) — guards against truthy-only checks', () => {
    const embed = buildIssueEmbed({ summary: 'x', number: 0 }, 'id');
    // We expect #0 to render — using `typeof === 'number'` not truthy check.
    assert.equal(embed.data.title, '#0 — x');
    assert.equal(embed.data.footer.text, 'Ticket #0 | Issue ID: id');
  });

  test('non-number values for issue.number (string, null) do NOT prefix the title', () => {
    for (const number of [undefined, null, '123', NaN]) {
      const embed = buildIssueEmbed({ summary: 's', number }, 'id');
      assert.equal(embed.data.title, 's', `should not prefix for ${String(number)}`);
      assert.equal(embed.data.footer.text, 'Issue ID: id', `footer should omit Ticket # for ${String(number)}`);
    }
  });

  test('missing summary falls back to "(no summary)" but still gets the # prefix', () => {
    const embed = buildIssueEmbed({ number: 99 }, 'id');
    assert.equal(embed.data.title, '#99 — (no summary)');
  });

  test('color matches the priority palette', () => {
    const high = buildIssueEmbed({ summary: 's', number: 1, priority: 'high' }, 'id');
    assert.equal(high.data.color, 0xff8c00);

    const critical = buildIssueEmbed({ summary: 's', number: 1, priority: 'critical' }, 'id');
    assert.equal(critical.data.color, 0xff0000);

    const unknown = buildIssueEmbed({ summary: 's', number: 1, priority: 'invented' }, 'id');
    assert.equal(unknown.data.color, 0x808080, 'unknown priority falls back to gray');
  });

  test('pokedex_bot target overrides the priority palette with purple', () => {
    const embed = buildIssueEmbed(
      { summary: 's', number: 1, priority: 'high', target: 'pokedex_bot' },
      'id',
    );
    assert.equal(embed.data.color, 0x8b5cf6);
  });
});

describe('buildIssueEmbed — combined fields', () => {
  test('all the optional fields combine without crashing or duplicating', () => {
    const issue = {
      summary: 'big issue',
      number: 1234,
      priority: 'high',
      category: 'ux_issue',
      reporterName: 'Alice',
      reasoning: 'looks like a regression',
      target: 'poke_product',
      contextComplete: true,
      assigneeName: 'Bob',
      guildId: 'g1', channelId: 'c1', messageId: 'm1',
      attachments: [
        { name: 'screenshot.png', url: 'https://cdn/example/s.png', isImage: true, size: 12345 },
        { name: 'log.txt', url: 'https://cdn/example/l.txt', isImage: false, size: 7777 },
      ],
      additionalContext: [
        { text: 'follow-up note', authorName: 'Alice' },
      ],
    };
    const embed = buildIssueEmbed(issue, 'doc');
    const names = embed.data.fields.map(f => f.name);
    // Each label appears exactly once (no duplication).
    for (const required of ['Priority', 'Category', 'Reporter', 'Reasoning', 'Assigned To', 'Original Message', 'Attachments', '✅ Context Complete', '📝 Additional Context']) {
      assert.equal(names.filter(n => n === required).length, 1, `${required} must appear exactly once`);
    }
    // First image becomes embed.image
    assert.equal(embed.data.image.url, 'https://cdn/example/s.png');
    // Title and footer both carry the number; ID still in the footer
    assert.equal(embed.data.title, '#1234 — big issue');
    assert.equal(embed.data.footer.text, 'Ticket #1234 | Issue ID: doc');
  });

  test('MCP-source issue shows the MCP Source field instead of Original Message', () => {
    const embed = buildIssueEmbed(
      { summary: 's', number: 1, source: 'mcp', channelId: 'mcp', messageId: 'mcp-xyz' },
      'id',
    );
    const names = embed.data.fields.map(f => f.name);
    assert.ok(names.includes('Source'), 'MCP issues should label the Source field');
    assert.ok(!names.includes('Original Message'), 'must NOT render a jump link for MCP issues');
  });

  test('forum issue without contextComplete shows the Gathering Context badge', () => {
    const embed = buildIssueEmbed(
      { summary: 's', number: 1, source: 'forum', contextComplete: false },
      'id',
    );
    const field = embed.data.fields.find(f => f.name === '⏳ Gathering Context');
    assert.ok(field);
  });
});

describe('buildIssueEmbed — serialization', () => {
  test('the embed serializes to valid JSON Discord can accept', () => {
    const issue = {
      summary: 's', number: 1, priority: 'low', category: 'bug',
      additionalContext: [{ text: 'hi', authorName: 'x' }],
    };
    const embed = buildIssueEmbed(issue, 'id');
    const json = embed.toJSON();
    assert.ok(typeof json.title === 'string');
    assert.ok(Array.isArray(json.fields));
    // Every field value is non-empty and within Discord's 1024 char limit.
    for (const f of json.fields) {
      assert.ok(typeof f.value === 'string' && f.value.length > 0, `${f.name} has empty value`);
      assert.ok(f.value.length <= 1024, `${f.name} value length ${f.value.length} > 1024`);
    }
  });
});
