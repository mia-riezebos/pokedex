'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export function SubforumLockToggle({ id, isLocked: initial }: { id: number; isLocked: boolean }) {
  const router = useRouter();
  const [isLocked, setIsLocked] = useState(initial);
  const [busy, setBusy] = useState(false);

  async function toggle() {
    setBusy(true);
    const next = !isLocked;
    setIsLocked(next);
    try {
      const res = await fetch(`/api/admin/subforums/${id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ is_locked: next }),
      });
      if (!res.ok) {
        setIsLocked(!next);
      } else {
        router.refresh();
      }
    } catch {
      setIsLocked(!next);
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={busy}
      className="shrink-0 text-xs px-3 py-1 rounded border border-[var(--border)] hover:bg-[var(--bg-elev-2)] disabled:opacity-50"
    >
      {isLocked ? 'Unlock' : 'Lock'}
    </button>
  );
}
