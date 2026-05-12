'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export function MarkAllReadButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function go() {
    setBusy(true);
    try {
      await fetch('/api/notifications', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ mark_all_read: true }),
      });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={go}
      disabled={busy}
      className="text-xs font-mono text-[var(--fg-muted)] hover:text-[var(--fg)] disabled:opacity-50"
    >
      {busy ? '…' : 'Mark all read'}
    </button>
  );
}
