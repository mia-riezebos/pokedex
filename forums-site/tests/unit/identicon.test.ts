import { describe, it, expect } from 'vitest';
import { identiconCells } from '@/lib/identicon';

describe('identiconCells', () => {
  it('produces a deterministic 5x5 grid for the same input', () => {
    expect(identiconCells('alice')).toEqual(identiconCells('alice'));
  });

  it('is symmetric across the vertical axis', () => {
    const cells = identiconCells('bob');
    for (let r = 0; r < 5; r++) {
      expect(cells[r][0]).toBe(cells[r][4]);
      expect(cells[r][1]).toBe(cells[r][3]);
    }
  });

  it('produces different patterns for different inputs', () => {
    expect(identiconCells('alice')).not.toEqual(identiconCells('bob'));
  });

  it('returns a 5x5 grid', () => {
    const cells = identiconCells('test');
    expect(cells.length).toBe(5);
    cells.forEach((row) => expect(row.length).toBe(5));
  });
});
