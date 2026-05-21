const { describe, test, before } = require('node:test');
const assert = require('node:assert/strict');
const { ActionRowBuilder } = require('discord.js');
const config = require('../src/config/config');
const { buildApprovedTriagePayload } = require('../src/services/mcpApproval');

describe('mcpApproval buildApprovedTriagePayload', () => {
  before(async () => {
    // Load config.json defaults without Firestore.
    config.setFirestoreService({ getAllConfigOverrides: async () => ({}) });
    await config.init();
  });

  const issue = {
    summary: 'iMessage replies arrive twice',
    priority: 'high',
    category: 'bug',
    reporterName: 'alice',
    reasoning: 'Reported via Pokedex MCP agent integration',
    source: 'mcp',
  };

  // Regression: components used to be `[buildTriageButtons(id)]`, which nests an
  // array inside the components array. Discord then can't serialize it and the
  // approve handler throws "Failed to process MCP issue." instead of posting.
  test('components is a flat array of ActionRowBuilder, not double-nested', () => {
    const payload = buildApprovedTriagePayload(issue, 'issue123', 'mod');

    assert.ok(Array.isArray(payload.components), 'components must be an array');
    assert.ok(payload.components.length > 0, 'expected at least one action row');
    for (const row of payload.components) {
      assert.ok(
        row instanceof ActionRowBuilder,
        'each component must be an ActionRowBuilder, not a nested array',
      );
    }
  });

  test('includes a single embed with the approval field', () => {
    const payload = buildApprovedTriagePayload(issue, 'issue123', 'mod');

    assert.equal(payload.embeds.length, 1);
    const json = payload.embeds[0].toJSON();
    assert.ok(json.fields.some(f => f.name === '✅ Approved'), 'expected an Approved field');
  });
});
