function hash(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function identiconCells(seed: string): boolean[][] {
  const grid: boolean[][] = [];
  let h = hash(seed);
  for (let r = 0; r < 5; r++) {
    const row: boolean[] = [];
    for (let c = 0; c < 3; c++) {
      h = Math.imul(h, 16777619) ^ (r * 5 + c);
      row.push((h & 1) === 1);
    }
    grid.push([row[0], row[1], row[2], row[1], row[0]]);
  }
  return grid;
}
