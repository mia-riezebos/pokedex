'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export function MarkAllReadButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function go() {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch('/api/notifications', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ mark_all_read: true }),
      });
      if (!res.ok) {
        setErr(`Failed (HTTP ${res.status})`);
        return;
      }
      router.refresh();
    } catch {
      setErr('Network error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={go}
        disabled={busy}
        className="text-xs font-mono text-[var(--fg-muted)] hover:text-[var(--fg)] disabled:opacity-50"
      >
        {busy ? '…' : 'Mark all read'}
      </button>
      {err && <span className="text-xs text-[var(--danger)]">{err}</span>}
    </div>
  );
}
