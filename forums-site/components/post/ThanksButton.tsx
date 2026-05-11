'use client';

import { useState } from 'react';

export function ThanksButton({
  postId,
  initialCount,
  initialThanked,
  canThank,
  disabledReason = 'Cannot thank',
}: {
  postId: string;
  initialCount: number;
  initialThanked: boolean;
  canThank: boolean;
  disabledReason?: string;
}) {
  const [count, setCount] = useState(initialCount);
  const [thanked, setThanked] = useState(initialThanked);
  const [busy, setBusy] = useState(false);

  async function toggle() {
    if (!canThank || busy) return;
    setBusy(true);

    const wasThanked = thanked;
    const previousCount = count;
    // Optimistic update
    setThanked(!wasThanked);
    setCount(count + (wasThanked ? -1 : 1));

    try {
      const res = await fetch(`/api/posts/${postId}/thanks`, {
        method: wasThanked ? 'DELETE' : 'POST',
      });
      if (!res.ok) {
        // Server rejected — revert
        setThanked(wasThanked);
        setCount(previousCount);
      }
    } catch {
      // Network error — revert
      setThanked(wasThanked);
      setCount(previousCount);
    } finally {
      setBusy(false);
    }
  }

  const label = thanked ? '♥' : '♡';
  const title = !canThank
    ? disabledReason
    : thanked
      ? 'Remove thanks'
      : 'Thanks';

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={!canThank || busy}
      title={title}
      aria-label={title}
      aria-pressed={thanked}
      className={`font-mono text-[11px] ${
        thanked ? 'text-[var(--accent)]' : 'text-[var(--fg-muted)] hover:text-[var(--fg)]'
      } ${!canThank ? 'cursor-not-allowed opacity-60' : ''} disabled:opacity-50`}
    >
      {label} {count}
    </button>
  );
}
