import { identiconCells } from '@/lib/identicon';

export function Identicon({ seed, size = 64 }: { seed: string; size?: number }) {
  const cells = identiconCells(seed);
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 5 5"
      className="rounded"
      role="img"
      aria-label="avatar"
    >
      <rect width="5" height="5" fill="var(--bg-elev-2)" />
      {cells.map((row, r) =>
        row.map(
          (on, c) =>
            on && (
              <rect key={`${r}-${c}`} x={c} y={r} width={1} height={1} fill="var(--accent)" />
            ),
        ),
      )}
    </svg>
  );
}
