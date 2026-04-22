import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import pingCommand from '../../src/commands/ping.js';

function makeInteraction(overrides = {}) {
  return {
    createdTimestamp: 1_000_000,
    client: {
      ws: { ping: 42 },
      guilds: { cache: { size: 3 } },
    },
    deferReply: vi.fn(() => Promise.resolve()),
    editReply: vi.fn(() => Promise.resolve()),
    ...overrides,
  };
}

describe('/ping command', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(1_000_250));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('calls deferReply WITHOUT the deprecated `fetchReply` option', async () => {
    const interaction = makeInteraction();

    await pingCommand.execute(interaction);

    expect(interaction.deferReply).toHaveBeenCalledTimes(1);
    const arg = interaction.deferReply.mock.calls[0][0];
    // Either called with no args, or with an options object that has no
    // `fetchReply` key (deprecated since discord.js v14.17 / removed v15).
    if (arg !== undefined) {
      expect(arg).not.toHaveProperty('fetchReply');
    }
  });

  it('computes roundtrip from current time minus interaction.createdTimestamp', async () => {
    const interaction = makeInteraction({ createdTimestamp: 1_000_000 });

    await pingCommand.execute(interaction);

    const { embeds } = interaction.editReply.mock.calls[0][0];
    const roundtripField = embeds[0].data.fields.find(f => f.name.includes('Roundtrip'));
    expect(roundtripField.value).toBe('250ms');
  });

  it('sends an embed with pong title, ws ping, and guild count', async () => {
    const interaction = makeInteraction();

    await pingCommand.execute(interaction);

    expect(interaction.editReply).toHaveBeenCalledTimes(1);
    const { embeds, components } = interaction.editReply.mock.calls[0][0];
    expect(embeds).toHaveLength(1);
    expect(embeds[0].data.title).toBe('🏓 Pong!');
    const wsField = embeds[0].data.fields.find(f => f.name.includes('WebSocket'));
    expect(wsField.value).toBe('42ms');
    const serversField = embeds[0].data.fields.find(f => f.name.includes('Servers'));
    expect(serversField.value).toBe('3');
    expect(components).toHaveLength(1);
  });
});
