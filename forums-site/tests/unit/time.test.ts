import { describe, it, expect } from 'vitest';
import { relativeTime } from '@/lib/time';

describe('relativeTime', () => {
  const now = new Date('2026-05-08T12:00:00Z');

  it('< 60s returns "just now"', () => {
    expect(relativeTime(new Date('2026-05-08T11:59:30Z'), now)).toBe('just now');
  });

  it('< 60m returns "Nm ago"', () => {
    expect(relativeTime(new Date('2026-05-08T11:55:00Z'), now)).toBe('5m ago');
  });

  it('< 24h returns "Nh ago"', () => {
    expect(relativeTime(new Date('2026-05-08T09:00:00Z'), now)).toBe('3h ago');
  });

  it('< 30d returns "Nd ago"', () => {
    expect(relativeTime(new Date('2026-05-05T12:00:00Z'), now)).toBe('3d ago');
  });

  it('older returns ISO date (YYYY-MM-DD)', () => {
    expect(relativeTime(new Date('2025-11-01T12:00:00Z'), now)).toBe('2025-11-01');
  });

  it('accepts ISO string input', () => {
    expect(relativeTime('2026-05-08T11:55:00Z', now)).toBe('5m ago');
  });

  it('handles future dates (clamps to "just now")', () => {
    expect(relativeTime(new Date('2026-05-08T12:05:00Z'), now)).toBe('just now');
  });
});
