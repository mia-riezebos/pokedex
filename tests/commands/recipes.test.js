import { describe, it, expect } from 'vitest';
import extractorsModule from '../../src/recipes/extractors.js';

const { extractTags, inferSource } = extractorsModule;

describe('extractTags', () => {
  it('returns empty array for empty or nullish input', () => {
    expect(extractTags('')).toEqual([]);
    expect(extractTags(null)).toEqual([]);
    expect(extractTags(undefined)).toEqual([]);
  });

  it('matches topic keywords with word boundaries', () => {
    expect(extractTags('track my flight on Tripit')).toEqual(
      expect.arrayContaining(['travel', 'tripit', 'tracker']),
    );
    expect(extractTags('summarize my Gmail inbox')).toEqual(
      expect.arrayContaining(['summarizer', 'gmail']),
    );
    expect(extractTags('a tax oracle assistant')).toEqual(
      expect.arrayContaining(['finance', 'assistant']),
    );
  });

  it('does NOT match substrings of unrelated words', () => {
    // "notify" must use word boundary, so "notified" should NOT trigger.
    expect(extractTags('I was notifying my team')).not.toContain('notify');
    // "code" is a common English word; the regex still fires, but
    // ensure we don't match inside "encoded" or "barcode".
    expect(extractTags('encoded data')).not.toContain('coding');
    expect(extractTags('barcode scanner')).not.toContain('coding');
  });

  it('matches multi-word phrase keywords', () => {
    expect(extractTags('this integrates with google calendar')).toContain('google-calendar');
    expect(extractTags('apple music playlist helper')).toEqual(
      expect.arrayContaining(['apple-music', 'music', 'assistant']),
    );
  });

  it('deduplicates tags', () => {
    const result = extractTags('travel travel travel TRAVEL');
    expect(result.filter((t) => t === 'travel')).toHaveLength(1);
  });
});

describe('inferSource', () => {
  it('returns canonical name for known hostnames', () => {
    expect(inferSource('https://poke.com/r/ABC123')).toBe('Poke');
    expect(inferSource('https://github.com/user/repo')).toBe('GitHub');
    expect(inferSource('https://docs.google.com/document/d/xyz')).toBe('Google Docs');
    expect(inferSource('https://www.youtube.com/watch?v=123')).toBe('YouTube');
    expect(inferSource('https://youtu.be/123')).toBe('YouTube');
    expect(inferSource('https://www.reddit.com/r/something')).toBe('Reddit');
    expect(inferSource('https://notion.so/some-page')).toBe('Notion');
    expect(inferSource('https://notion.site/public-page')).toBe('Notion');
  });

  it('returns null for unknown hostnames', () => {
    expect(inferSource('https://random-site.example/x')).toBeNull();
    expect(inferSource('https://ogeneo.foo.com/y')).toBeNull();
    expect(inferSource('https://pokepast.es/xyz')).toBeNull();  // dropped from whitelist
    expect(inferSource('https://www.smogon.com/forums/threads/xyz')).toBeNull(); // dropped
  });

  it('returns null for unparseable URLs', () => {
    expect(inferSource('not a url')).toBeNull();
    expect(inferSource('')).toBeNull();
  });
});
