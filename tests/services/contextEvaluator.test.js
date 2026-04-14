import { describe, it, expect } from 'vitest';
import { buildConversationHistory } from '../../src/services/contextEvaluator.js';

describe('buildConversationHistory', () => {
  it('returns an empty array for an empty input', () => {
    expect(buildConversationHistory([])).toEqual([]);
  });

  it('maps a typical Discord message into the expected shape', () => {
    const createdAt = new Date('2026-01-15T12:34:56.000Z');
    const messages = [
      {
        author: { username: 'alice', bot: false },
        content: 'gmail sync broke',
        attachments: new Map(),
        createdAt,
      },
    ];
    expect(buildConversationHistory(messages)).toEqual([
      {
        author: 'alice',
        isBot: false,
        content: 'gmail sync broke',
        attachments: [],
        createdAt: '2026-01-15T12:34:56.000Z',
      },
    ]);
  });

  it('flags bot messages', () => {
    const messages = [
      {
        author: { username: 'pokedex', bot: true },
        content: 'acknowledged',
        attachments: new Map(),
        createdAt: new Date('2026-01-15T12:34:56.000Z'),
      },
    ];
    const [msg] = buildConversationHistory(messages);
    expect(msg.isBot).toBe(true);
  });

  it('extracts attachment url and name', () => {
    const attachments = new Map();
    attachments.set('1', { url: 'https://cdn.example.com/a.png', name: 'a.png', extra: 'ignored' });
    attachments.set('2', { url: 'https://cdn.example.com/b.log', name: 'b.log' });
    const messages = [
      {
        author: { username: 'alice', bot: false },
        content: 'see files',
        attachments,
        createdAt: new Date('2026-01-15T12:34:56.000Z'),
      },
    ];
    const [msg] = buildConversationHistory(messages);
    expect(msg.attachments).toEqual([
      { url: 'https://cdn.example.com/a.png', name: 'a.png' },
      { url: 'https://cdn.example.com/b.log', name: 'b.log' },
    ]);
  });

  it('falls back to "unknown" when author is missing', () => {
    const messages = [
      {
        content: 'anonymous',
        attachments: new Map(),
        createdAt: new Date('2026-01-15T12:34:56.000Z'),
      },
    ];
    const [msg] = buildConversationHistory(messages);
    expect(msg.author).toBe('unknown');
    expect(msg.isBot).toBe(false);
  });

  it('falls back to empty string when content is missing', () => {
    const messages = [
      {
        author: { username: 'alice', bot: false },
        attachments: new Map(),
        createdAt: new Date('2026-01-15T12:34:56.000Z'),
      },
    ];
    const [msg] = buildConversationHistory(messages);
    expect(msg.content).toBe('');
  });

  it('falls back to current time when createdAt is missing', () => {
    const before = Date.now();
    const messages = [
      {
        author: { username: 'alice', bot: false },
        content: 'hi',
        attachments: new Map(),
      },
    ];
    const [msg] = buildConversationHistory(messages);
    const parsed = Date.parse(msg.createdAt);
    expect(parsed).toBeGreaterThanOrEqual(before);
    expect(parsed).toBeLessThanOrEqual(Date.now());
  });

  it('handles missing attachments collection', () => {
    const messages = [
      {
        author: { username: 'alice', bot: false },
        content: 'hi',
        createdAt: new Date('2026-01-15T12:34:56.000Z'),
      },
    ];
    const [msg] = buildConversationHistory(messages);
    expect(msg.attachments).toEqual([]);
  });
});
