import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createPoller } from '../../src/services/statusPoller.js';

const fixture = (name) =>
  JSON.parse(readFileSync(join(__dirname, '../fixtures/status/', name), 'utf-8'));

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
    expect(stored.lastSummary).toBeTruthy();
  });

  it('edits the pinned message on subsequent tick and posts transition alerts', async () => {
    const channel = makeFakeChannel();
    channel.messages.fetch = vi.fn(async () => ({ id: 'msg-existing', edit: vi.fn(async () => {}) }));
    const client = makeFakeClient({ fetchChannel: vi.fn(async () => channel) });

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

    expect(channel.send).toHaveBeenCalledTimes(2);
    expect(channel.messages.fetch).toHaveBeenCalled();
  });

  it('posts an incident alert with role ping when alertRoleId is set', async () => {
    const channel = makeFakeChannel();
    const client = makeFakeClient({ fetchChannel: vi.fn(async () => channel) });
    const store = makeFakeStore({
      g1: {
        enabled: true, channelId: 'ch1', pinnedMessageId: 'msg-existing',
        alertRoleId: 'role123',
        lastSummary: fixture('all-operational.json'),
      },
    });
    channel.messages.fetch = vi.fn(async () => ({ id: 'msg-existing', edit: vi.fn(async () => {}) }));

    const fetcher = { fetchSummary: vi.fn(async () => fixture('active-incident.json')) };
    const poller = createPoller({
      client, fetcher, store,
      config: { getConfig: () => 'https://status.poke.com' },
      logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
    });

    await poller.runTick();

    const roleMention = channel.send.mock.calls.find(c =>
      typeof c[0]?.content === 'string' && c[0].content.includes('<@&role123>')
    );
    expect(roleMention).toBeTruthy();
  });

  it('clears pinnedMessageId when the pinned message was deleted (10008)', async () => {
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
    expect(saved.pinnedMessageId).toMatch(/^msg-/);
    expect(saved.pinnedMessageId).not.toBe('msg-gone');
  });

  it('disables a guild when the channel was deleted (10003)', async () => {
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
