'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export function ThreadModActions({
  threadId,
  initialPinned,
  initialLocked,
}: {
  threadId: string;
  initialPinned: boolean;
  initialLocked: boolean;
}) {
  const router = useRouter();
  const [pinned, setPinned] = useState(initialPinned);
  const [locked, setLocked] = useState(initialLocked);
  const [busy, setBusy] = useState<'pin' | 'lock' | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function toggle(field: 'is_pinned' | 'is_locked', next: boolean) {
    setErr(null);
    const which = field === 'is_pinned' ? 'pin' : 'lock';
    setBusy(which);

    // Optimistic
    if (field === 'is_pinned') setPinned(next);
    else setLocked(next);

    try {
      const res = await fetch(`/api/threads/${threadId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ [field]: next }),
      });
      if (!res.ok) {
        const json = (await res.json().catch(() => ({}))) as { error?: string };
        setErr(json.error ?? `Failed (HTTP ${res.status})`);
        // Revert
        if (field === 'is_pinned') setPinned(!next);
        else setLocked(!next);
      } else {
        router.refresh();
      }
    } catch {
      setErr('Network error');
      if (field === 'is_pinned') setPinned(!next);
      else setLocked(!next);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => toggle('is_pinned', !pinned)}
          disabled={busy === 'pin'}
          className="text-xs px-2 py-1 rounded border border-[var(--border)] hover:bg-[var(--bg-elev-2)] disabled:opacity-50"
        >
          {pinned ? 'Unpin' : 'Pin'}
        </button>
        <button
          type="button"
          onClick={() => toggle('is_locked', !locked)}
          disabled={busy === 'lock'}
          className="text-xs px-2 py-1 rounded border border-[var(--border)] hover:bg-[var(--bg-elev-2)] disabled:opacity-50"
        >
          {locked ? 'Unlock' : 'Lock'}
        </button>
      </div>
      {err && <span className="text-[10px] text-[var(--danger)]">{err}</span>}
    </div>
  );
}
