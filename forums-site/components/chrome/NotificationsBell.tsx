'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';

interface NotificationData {
  id: string;
  type: 'reply' | 'quote' | 'mention' | 'thanks';
  read_at: string | null;
  created_at: string;
  source_post: {
    id: string;
    post_number: number;
    thread_id: string;
    body_md: string;
    threads: { title: string } | null;
  } | null;
  source_user: { username: string; role: string; avatar_url: string | null } | null;
}

const TYPE_LABEL: Record<NotificationData['type'], string> = {
  reply: 'replied in your thread',
  quote: 'quoted your post',
  mention: 'mentioned you',
  thanks: 'thanked your post',
};

export function NotificationsBell() {
  const [open, setOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState<number | null>(null);
  const [items, setItems] = useState<NotificationData[]>([]);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/notifications?limit=10');
      if (!res.ok) return;
      const json = (await res.json()) as { notifications: NotificationData[]; unread_count: number };
      setItems(json.notifications);
      setUnreadCount(json.unread_count);
    } catch {
      // swallow — bell is non-critical
    }
  }, []);

  useEffect(() => {
    void refresh();
    // Refresh every 60s while page is open
    const id = setInterval(() => void refresh(), 60_000);
    return () => clearInterval(id);
  }, [refresh]);

  async function markAllRead() {
    setLoading(true);
    try {
      await fetch('/api/notifications', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ mark_all_read: true }),
      });
      await refresh();
    } finally {
      setLoading(false);
    }
  }

  const hasUnread = (unreadCount ?? 0) > 0;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="relative text-sm text-[var(--fg-muted)] hover:text-[var(--fg)]"
        aria-label="Notifications"
      >
        🔔
        {hasUnread && (
          <span className="absolute -top-1 -right-2 inline-flex items-center justify-center min-w-[16px] h-4 px-1 text-[10px] font-mono rounded-full bg-[var(--accent)] text-white">
            {unreadCount! > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-2 z-50 w-80 max-h-96 overflow-auto rounded border border-[var(--border)] bg-[var(--bg-elev-1)] shadow-lg">
            <div className="flex items-center justify-between p-3 border-b border-[var(--border)]">
              <span className="text-sm font-semibold">Notifications</span>
              <div className="flex gap-2 items-center">
                {hasUnread && (
                  <button
                    type="button"
                    onClick={markAllRead}
                    disabled={loading}
                    className="text-[11px] font-mono text-[var(--fg-muted)] hover:text-[var(--fg)] disabled:opacity-50"
                  >
                    Mark all read
                  </button>
                )}
                <Link href="/notifications" className="text-[11px] font-mono text-[var(--accent)]" onClick={() => setOpen(false)}>
                  See all
                </Link>
              </div>
            </div>
            {items.length === 0 ? (
              <div className="p-4 text-sm text-[var(--fg-muted)] text-center">No notifications yet.</div>
            ) : (
              <ul className="divide-y divide-[var(--border)]">
                {items.map((n) => (
                  <li key={n.id} className={`p-3 ${n.read_at == null ? 'bg-[var(--bg-elev-2)]' : ''}`}>
                    <Link
                      href={
                        n.source_post
                          ? `/t/${n.source_post.thread_id}?page=${Math.ceil(n.source_post.post_number / 20)}#post-${n.source_post.post_number}`
                          : '#'
                      }
                      onClick={() => setOpen(false)}
                      className="block"
                    >
                      <div className="text-xs">
                        <span className="font-mono text-[var(--fg)]">
                          {n.source_user?.username ?? 'someone'}
                        </span>{' '}
                        <span className="text-[var(--fg-muted)]">{TYPE_LABEL[n.type]}</span>
                      </div>
                      {n.source_post?.threads?.title && (
                        <div className="text-[11px] text-[var(--fg-subtle)] mt-1 truncate">
                          in &quot;{n.source_post.threads.title}&quot;
                        </div>
                      )}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </div>
  );
}
