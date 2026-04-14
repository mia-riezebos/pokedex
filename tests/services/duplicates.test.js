import { describe, it, expect } from 'vitest';
import { jaccardSimilarity, findDuplicate } from '../../src/services/duplicates.js';

describe('jaccardSimilarity', () => {
  it('returns 1 for identical strings', () => {
    expect(jaccardSimilarity('gmail sync is broken', 'gmail sync is broken')).toBe(1);
  });

  it('returns 0 for completely disjoint strings', () => {
    expect(jaccardSimilarity('gmail sync broken', 'payment invoice failed')).toBe(0);
  });

  it('returns 0 when one side is an empty string', () => {
    expect(jaccardSimilarity('gmail sync broken', '')).toBe(0);
    expect(jaccardSimilarity('', 'gmail sync broken')).toBe(0);
  });

  it('returns 0 when both sides are empty strings', () => {
    expect(jaccardSimilarity('', '')).toBe(0);
  });

  it('returns 0 when tokens are filtered out (all tokens ≤2 chars)', () => {
    // tokenize() drops words of length ≤ 2, so "a an to" → []
    expect(jaccardSimilarity('a an to', 'a an to')).toBe(0);
  });

  it('is case-insensitive', () => {
    expect(jaccardSimilarity('Gmail Sync Broken', 'gmail SYNC broken')).toBe(1);
  });

  it('ignores punctuation', () => {
    expect(jaccardSimilarity('gmail, sync. broken!', 'gmail sync broken')).toBe(1);
  });

  it('computes partial overlap correctly', () => {
    // tokens A: {gmail, sync, broken} (3)
    // tokens B: {gmail, sync, slow}   (3)
    // intersection: {gmail, sync} = 2; union: {gmail, sync, broken, slow} = 4
    // jaccard = 2/4 = 0.5
    expect(jaccardSimilarity('gmail sync broken', 'gmail sync slow')).toBe(0.5);
  });

  it('deduplicates repeated tokens within a single string', () => {
    // "gmail gmail gmail" → set {gmail} (1 token)
    // "gmail" → set {gmail} (1 token)
    // intersection 1, union 1 → 1
    expect(jaccardSimilarity('gmail gmail gmail', 'gmail')).toBe(1);
  });

  it('throws when passed null or undefined (documents current behavior)', () => {
    // tokenize() calls .toLowerCase() which throws on null/undefined.
    // This is documented behavior, not desirable — callers must pass strings.
    expect(() => jaccardSimilarity(null, 'x')).toThrow();
    expect(() => jaccardSimilarity('x', undefined)).toThrow();
  });

  it('handles unicode by dropping non-ASCII word characters', () => {
    // The regex [^a-z0-9\s] strips all non-ASCII letters, so "café" becomes "caf"
    // Note: "caf" is length 3, so it survives the length > 2 filter.
    expect(jaccardSimilarity('café', 'caf')).toBe(1);
    // Pure non-ASCII words get fully stripped
    expect(jaccardSimilarity('日本語', '日本語')).toBe(0);
  });
});

describe('findDuplicate', () => {
  const baseIssue = (id, summary, text) => ({ id, summary, text });

  it('returns null when there are no existing issues', () => {
    expect(findDuplicate('gmail broken', 'gmail is not working', [])).toBeNull();
  });

  it('returns null when nothing exceeds the threshold', () => {
    const existing = [baseIssue('a', 'payment failed', 'my payment failed')];
    expect(findDuplicate('gmail broken', 'gmail is not working', existing)).toBeNull();
  });

  it('returns the best match above threshold', () => {
    const existing = [
      baseIssue('a', 'gmail sync broken', 'gmail is not syncing at all'),
      baseIssue('b', 'payment failed', 'my card declined'),
    ];
    const match = findDuplicate('gmail sync broken', 'gmail not syncing', existing);
    expect(match).not.toBeNull();
    expect(match.issue.id).toBe('a');
    expect(match.score).toBeGreaterThanOrEqual(0.4);
    expect(match).toHaveProperty('summarySimilarity');
    expect(match).toHaveProperty('textSimilarity');
  });

  it('respects a custom threshold', () => {
    const existing = [baseIssue('a', 'gmail sync broken', 'unrelated text')];
    // Identical summary, unrelated text: score = 1.0*0.6 + 0*0.4 = 0.6
    expect(findDuplicate('gmail sync broken', 'different text', existing, 0.9)).toBeNull();
    expect(findDuplicate('gmail sync broken', 'different text', existing, 0.5)).not.toBeNull();
  });

  it('picks the highest-scoring issue when multiple exceed the threshold', () => {
    const existing = [
      baseIssue('weak', 'gmail problem', 'gmail having some trouble'),
      baseIssue('strong', 'gmail sync broken', 'gmail sync is completely broken'),
    ];
    const match = findDuplicate('gmail sync broken', 'gmail sync is completely broken', existing);
    expect(match.issue.id).toBe('strong');
  });

  it('treats missing summary/text fields on existing issues as empty', () => {
    const existing = [{ id: 'a' }]; // no summary, no text
    expect(findDuplicate('gmail broken', 'gmail is not working', existing)).toBeNull();
  });
});
