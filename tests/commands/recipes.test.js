import { describe, it, expect } from 'vitest';
import extractorsModule from '../../src/recipes/extractors.js';

const { extractTags, inferSource } = extractorsModule;

describe('extractTags', () => {
  it('returns empty array for empty or nullish input', () => {
    expect(extractTags('')).toEqual([]);
    expect(extractTags(null)).toEqual([]);
    expect(extractTags(undefined)).toEqual([]);
  });

  it('matches single-word keywords with word boundaries', () => {
    expect(extractTags('this is an OU team')).toContain('ou');
    expect(extractTags('VGC reg g sun team')).toEqual(
      expect.arrayContaining(['vgc', 'reg g', 'sun team'])
    );
  });

  it('does NOT match substrings of unrelated words', () => {
    // "about", "cloud", "round", "out" should NOT produce "ou"
    expect(extractTags('I was thinking about using this cloud build')).not.toContain('ou');
    expect(extractTags('out of nowhere')).not.toContain('ou');
    // "popular", "push", "cup" should NOT produce "pu"
    expect(extractTags('a popular strategy')).not.toContain('pu');
    expect(extractTags('push through')).not.toContain('pu');
    // "training", "rain-check" should NOT produce "rain team"
    expect(extractTags('training montage')).not.toContain('rain team');
    // "install", "installation" should NOT produce "stall"
    expect(extractTags('install this update')).not.toContain('stall');
    // "sunday" should NOT produce "sun team"
    expect(extractTags('sunday tournament')).not.toContain('sun team');
  });

  it('still matches legitimate multi-word phrases via substring', () => {
    expect(extractTags('this is a trick room build')).toContain('trick room');
    expect(extractTags('hyper offense core')).toContain('hyper offense');
    expect(extractTags('gen 9 ou analysis')).toEqual(
      expect.arrayContaining(['gen 9', 'ou'])
    );
  });

  it('deduplicates tags', () => {
    const result = extractTags('ou ou ou OU');
    expect(result.filter((t) => t === 'ou')).toHaveLength(1);
  });
});

describe('inferSource', () => {
  it('returns canonical name for known hostnames', () => {
    expect(inferSource('https://poke.com/r/ABC123')).toBe('Poke');
    expect(inferSource('https://pokepast.es/xyz')).toBe('Pokepaste');
    expect(inferSource('https://play.pokemonshowdown.com/x')).toBe('Showdown');
    expect(inferSource('https://github.com/user/repo')).toBe('GitHub');
    expect(inferSource('https://www.smogon.com/forums/threads/xyz')).toBe('Smogon');
    expect(inferSource('https://www.youtube.com/watch?v=123')).toBe('YouTube');
    expect(inferSource('https://youtu.be/123')).toBe('YouTube');
  });

  it('returns null for unknown hostnames (no domain-prefix fallback)', () => {
    expect(inferSource('https://ogeneo.foo.com/x')).toBeNull();
    expect(inferSource('https://pearmcp.bar.dev/y')).toBeNull();
    expect(inferSource('https://petrol.xyz/z')).toBeNull();
    expect(inferSource('https://random-site.example')).toBeNull();
  });

  it('returns null for unparseable URLs', () => {
    expect(inferSource('not a url')).toBeNull();
    expect(inferSource('')).toBeNull();
  });
});
