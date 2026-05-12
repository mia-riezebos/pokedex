import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { getCurrentUser } from '@/lib/auth';
import { Container } from '@/components/chrome/Container';
import { relativeTime } from '@/lib/time';
import { MarkAllReadButton } from './MarkAllReadButton';

export const dynamic = 'force-dynamic';

interface NotificationData {
  id: string;
  type: 'reply' | 'quote' | 'mention' | 'thanks';
  read_at: string | null;
  created_at: string;
  source_post: {
    id: string;
    post_number: number;
    thread_id: string;
    threads: { title: string } | null;
  } | null;
  source_user: { username: string; role: 'user' | 'mod' | 'admin'; avatar_url: string | null } | null;
}

const TYPE_LABEL: Record<NotificationData['type'], string> = {
  reply: 'replied in your thread',
  quote: 'quoted your post',
  mention: 'mentioned you',
  thanks: 'thanked your post',
};

export default async function NotificationsPage() {
  const me = await getCurrentUser();
  if (!me) redirect('/login?next=/notifications');

  const supabase = createClient();
  const { data } = await supabase
    .from('notifications')
    .select(
      `id, type, read_at, created_at,
       source_post:posts!source_post_id(id, post_number, thread_id, threads(title)),
       source_user:users!source_user_id(username, role, avatar_url)`,
    )
    .eq('user_id', me.id)
    .order('created_at', { ascending: false })
    .limit(100);

  const rows = (data ?? []) as unknown as NotificationData[];

  const { count: trueUnreadCount } = await supabase
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', me.id)
    .is('read_at', null);
  const unreadCount = trueUnreadCount ?? 0;

  return (
    <Container>
      <div className="py-8 space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold">Notifications</h1>
          {unreadCount > 0 && <MarkAllReadButton />}
        </div>
        <div className="title-rule" />

        {rows.length === 0 ? (
          <p className="text-sm text-[var(--fg-muted)] py-12 text-center">
            Nothing yet. When someone replies, quotes, or mentions you, it&apos;ll show up here.
          </p>
        ) : (
          <ul className="rounded border border-[var(--border)] divide-y divide-[var(--border)]">
            {rows.map((n) => (
              <li key={n.id} className={`p-3 ${n.read_at == null ? 'bg-[var(--bg-elev-2)]' : ''}`}>
                <Link
                  href={
                    n.source_post
                      ? `/t/${n.source_post.thread_id}?page=${Math.ceil(n.source_post.post_number / 20)}#post-${n.source_post.post_number}`
                      : '#'
                  }
                  className="block"
                >
                  <div className="text-sm">
                    <span className="font-mono">
                      {n.source_user?.username ?? 'someone'}
                    </span>{' '}
                    <span className="text-[var(--fg-muted)]">{TYPE_LABEL[n.type]}</span>
                  </div>
                  {n.source_post?.threads?.title && (
                    <div className="text-xs text-[var(--fg-muted)] mt-1">
                      in &quot;{n.source_post.threads.title}&quot;
                    </div>
                  )}
                  <div className="font-mono text-[10px] text-[var(--fg-subtle)] mt-1">
                    {relativeTime(n.created_at)}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Container>
  );
}
