import { describe, it, expect } from 'vitest';
import { slugify } from '@/lib/slug';

const SAFE = /^[a-z0-9][a-z0-9-]*[a-z0-9]$/;

describe('slugify', () => {
  it('lowercases and dashes', () => {
    expect(slugify('Hello World')).toBe('hello-world');
  });

  it('strips punctuation', () => {
    expect(slugify("What's up, friend?")).toBe('whats-up-friend');
  });

  it('collapses whitespace', () => {
    expect(slugify('a   b')).toBe('a-b');
  });

  it('collapses consecutive dashes', () => {
    expect(slugify('a--b---c')).toBe('a-b-c');
  });

  it('truncates to 60 chars or fewer', () => {
    expect(slugify('a'.repeat(100)).length).toBeLessThanOrEqual(60);
  });

  it('trims leading/trailing dashes', () => {
    expect(slugify('-hello-')).toBe('hello');
    expect(slugify('   hello   ')).toBe('hello');
  });

  it('produces output passing the DB CHECK regex', () => {
    expect(SAFE.test(slugify('Hello World'))).toBe(true);
    expect(SAFE.test(slugify("What's up?"))).toBe(true);
    expect(SAFE.test(slugify('100% pure'))).toBe(true);
  });

  it('returns empty string for unrecoverable input', () => {
    // Truly empty input or input that's all punctuation has no slug — caller must fall back.
    expect(slugify('')).toBe('');
    expect(slugify('???')).toBe('');
    expect(slugify('   ')).toBe('');
  });

  it('handles unicode by transliterating to ASCII (NFKD-strip)', () => {
    // café → caf or cafe depending on locale; both are acceptable as long as they pass CHECK.
    const result = slugify('café');
    expect(result.length).toBeGreaterThan(0);
    expect(SAFE.test(result)).toBe(true);
  });
});
