'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/Button';
import { relativeTime } from '@/lib/time';

interface ReportRowProps {
  report: {
    id: string;
    reason: string;
    note: string | null;
    created_at: string;
    post: {
      id: string;
      post_number: number;
      body_md: string;
      thread_id: string;
      is_hidden: boolean;
      is_deleted: boolean;
      author: { username: string } | null;
      thread: { title: string } | null;
    } | null;
    reporter: { username: string } | null;
  };
}

export function ReportRow({ report: r }: ReportRowProps) {
  const router = useRouter();
  const [busy, setBusy] = useState<'resolve' | 'dismiss' | 'hide' | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function act(action: 'resolve' | 'dismiss' | 'hide') {
    setErr(null);
    setBusy(action);
    try {
      const res = await fetch(`/api/admin/reports/${r.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setErr(json.error ?? `Failed (HTTP ${res.status})`);
      } else {
        router.refresh();
      }
    } catch {
      setErr('Network error');
    } finally {
      setBusy(null);
    }
  }

  return (
    <li className="rounded border border-[var(--border)] p-3 bg-[var(--bg-elev-1)] space-y-2">
      <div className="flex items-baseline justify-between gap-2">
        <div className="text-xs font-mono text-[var(--fg-muted)]">
          {r.reason} · reported {relativeTime(r.created_at)}
          {r.reporter && <> · by {r.reporter.username}</>}
          {r.post?.is_hidden && <span className="ml-2 text-[var(--warn)]">[already hidden]</span>}
          {r.post?.is_deleted && <span className="ml-2 text-[var(--danger)]">[deleted]</span>}
        </div>
      </div>
      {r.post && (
        <>
          <div className="text-sm">
            <Link
              href={`/t/${r.post.thread_id}?page=${Math.ceil(r.post.post_number / 20)}#post-${r.post.post_number}`}
              className="text-[var(--accent)] hover:underline"
            >
              {r.post.thread?.title ?? '(thread)'} — #post-{r.post.post_number}
            </Link>
            {r.post.author && <> by <span className="font-mono">{r.post.author.username}</span></>}
          </div>
          <p className="text-sm whitespace-pre-wrap text-[var(--fg-muted)] line-clamp-3">{r.post.body_md.slice(0, 280)}{r.post.body_md.length > 280 ? '…' : ''}</p>
        </>
      )}
      {r.note && (
        <p className="text-xs text-[var(--fg-muted)] italic">Reporter note: {r.note}</p>
      )}
      {err && <p className="text-xs text-[var(--danger)]">{err}</p>}
      <div className="flex gap-2">
        {r.post && !r.post.is_hidden && !r.post.is_deleted && (
          <Button type="button" variant="secondary" disabled={busy !== null} onClick={() => act('hide')}>
            {busy === 'hide' ? '…' : 'Hide post'}
          </Button>
        )}
        <Button type="button" disabled={busy !== null} onClick={() => act('resolve')}>
          {busy === 'resolve' ? '…' : 'Resolve'}
        </Button>
        <Button type="button" variant="ghost" disabled={busy !== null} onClick={() => act('dismiss')}>
          {busy === 'dismiss' ? '…' : 'Dismiss'}
        </Button>
      </div>
    </li>
  );
}
