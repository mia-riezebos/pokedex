'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export function SubforumLockToggle({ id, isLocked: initial }: { id: number; isLocked: boolean }) {
  const router = useRouter();
  const [isLocked, setIsLocked] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function toggle() {
    setBusy(true);
    setErr(null);
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
        const json = (await res.json().catch(() => ({}))) as { error?: string };
        setErr(json.error ?? 'Toggle failed');
      } else {
        router.refresh();
      }
    } catch {
      setIsLocked(!next);
      setErr('Network error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="shrink-0 flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={toggle}
        disabled={busy}
        className="text-xs px-3 py-1 rounded border border-[var(--border)] hover:bg-[var(--bg-elev-2)] disabled:opacity-50"
      >
        {isLocked ? 'Unlock' : 'Lock'}
      </button>
      {err && <span className="text-[10px] text-[var(--danger)]">{err}</span>}
    </div>
  );
}
