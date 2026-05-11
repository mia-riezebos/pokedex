'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Textarea } from '@/components/ui/Textarea';

export function PostActions({
  postId,
  initialBody,
}: {
  postId: string;
  initialBody: string;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [body, setBody] = useState(initialBody);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setErr(null);
    const res = await fetch(`/api/posts/${postId}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ body_md: body }),
    });
    setBusy(false);
    if (!res.ok) {
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      setErr(json.error ?? 'Edit failed');
      return;
    }
    setEditing(false);
    router.refresh();
  }

  async function del() {
    if (!confirm('Delete this post?')) return;
    setBusy(true);
    const res = await fetch(`/api/posts/${postId}`, { method: 'DELETE' });
    setBusy(false);
    if (!res.ok) {
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      setErr(json.error ?? 'Delete failed');
      return;
    }
    router.refresh();
  }

  if (editing) {
    return (
      <div className="space-y-2">
        <Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={6} />
        {err && <p className="text-xs text-[var(--danger)]">{err}</p>}
        <div className="flex gap-2 text-xs">
          <button
            type="button"
            onClick={save}
            disabled={busy}
            className="px-2 py-1 rounded bg-[var(--accent)] text-white disabled:opacity-50"
          >
            {busy ? 'Saving…' : 'Save'}
          </button>
          <button
            type="button"
            onClick={() => {
              setEditing(false);
              setErr(null);
            }}
            className="px-2 py-1 text-[var(--fg-muted)] hover:text-[var(--fg)]"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex gap-2 text-[11px] font-mono text-[var(--fg-muted)]">
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="hover:text-[var(--fg)]"
      >
        [edit]
      </button>
      <button
        type="button"
        onClick={del}
        disabled={busy}
        className="hover:text-[var(--danger)] disabled:opacity-50"
      >
        [delete]
      </button>
      {err && <span className="text-[var(--danger)]">{err}</span>}
    </div>
  );
}
