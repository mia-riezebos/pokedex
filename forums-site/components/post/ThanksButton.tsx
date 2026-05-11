'use client';

import { useState } from 'react';

export function ThanksButton({
  postId,
  initialCount,
  initialThanked,
  canThank,
}: {
  postId: string;
  initialCount: number;
  initialThanked: boolean;
  canThank: boolean;
}) {
  const [count, setCount] = useState(initialCount);
  const [thanked, setThanked] = useState(initialThanked);
  const [busy, setBusy] = useState(false);

  async function toggle() {
    if (!canThank || busy) return;
    setBusy(true);

    // Optimistic update
    const wasThanked = thanked;
    setThanked(!wasThanked);
    setCount(count + (wasThanked ? -1 : 1));

    const res = await fetch(`/api/posts/${postId}/thanks`, {
      method: wasThanked ? 'DELETE' : 'POST',
    });

    if (!res.ok) {
      // Revert optimistic update
      setThanked(wasThanked);
      setCount(count);
    }
    setBusy(false);
  }

  const label = thanked ? '♥' : '♡';
  const title = !canThank
    ? 'Sign in to thank'
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
