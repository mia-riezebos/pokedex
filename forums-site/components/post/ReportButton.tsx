'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Textarea } from '@/components/ui/Textarea';
import { FormError } from '@/components/ui/FormError';

type Reason = 'spam' | 'harassment' | 'off_topic' | 'other';

const LABELS: Record<Reason, string> = {
  spam: 'Spam',
  harassment: 'Harassment',
  off_topic: 'Off-topic',
  other: 'Other (specify)',
};

export function ReportButton({ postId, disabled }: { postId: string; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<Reason>('spam');
  const [note, setNote] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    try {
      const res = await fetch('/api/reports', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ post_id: postId, reason, note: note.trim() || null }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setErr(json.error ?? `Failed (HTTP ${res.status})`);
        return;
      }
      setDone(true);
    } catch {
      setErr('Network error');
    } finally {
      setBusy(false);
    }
  }

  if (disabled) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="font-mono text-[11px] text-[var(--fg-muted)] hover:text-[var(--danger)]"
        title="Report this post to mods"
      >
        [report]
      </button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={() => !busy && setOpen(false)}>
          <div className="max-w-md w-full mx-4 rounded border border-[var(--border)] bg-[var(--bg-elev-1)] p-5 space-y-4" onClick={(e) => e.stopPropagation()}>
            {done ? (
              <>
                <p className="text-sm">Thanks. A moderator will review this.</p>
                <div className="flex justify-end"><Button type="button" onClick={() => { setOpen(false); setDone(false); setReason('spam'); setNote(''); }}>Close</Button></div>
              </>
            ) : (
              <form onSubmit={submit} className="space-y-3">
                <h2 className="text-base font-semibold">Report post</h2>
                <label className="block">
                  <span className="block text-xs text-[var(--fg-muted)] mb-1">Reason</span>
                  <select
                    value={reason}
                    onChange={(e) => setReason(e.target.value as Reason)}
                    className="w-full px-3 py-2 rounded bg-[var(--bg-elev-2)] border border-[var(--border)] text-[var(--fg)] outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-glow)]"
                  >
                    {(Object.keys(LABELS) as Reason[]).map((r) => (
                      <option key={r} value={r}>{LABELS[r]}</option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="block text-xs text-[var(--fg-muted)] mb-1">Note (optional)</span>
                  <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} maxLength={500} placeholder="Anything mods should know" />
                </label>
                <FormError message={err} />
                <div className="flex justify-end gap-2">
                  <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={busy}>Cancel</Button>
                  <Button type="submit" disabled={busy}>{busy ? 'Submitting…' : 'Submit report'}</Button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  );
}
