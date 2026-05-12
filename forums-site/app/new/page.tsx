import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getCurrentUser } from '@/lib/auth';
import { Container } from '@/components/chrome/Container';
import { UserChip } from '@/components/user/UserChip';
import { relativeTime } from '@/lib/time';

export const dynamic = 'force-dynamic';

interface ThreadRow {
  id: string;
  title: string;
  slug: string;
  post_count: number;
  last_post_at: string;
  is_pinned: boolean;
  is_locked: boolean;
  subforum: { name: string; slug: string } | null;
  last_user: { username: string; role: 'user' | 'mod' | 'admin'; avatar_url: string | null } | null;
}

const RECENT_LIMIT = 50;

export default async function NewPage() {
  const me = await getCurrentUser();
  if (!me) redirect('/login?next=/new');

  const supabase = createClient();

  // Fetch user's read map
  const { data: reads } = await supabase
    .from('thread_reads')
    .select('thread_id, last_read_at')
    .eq('user_id', me.id);
  const readMap = new Map<string, string>();
  for (const r of reads ?? []) {
    readMap.set(r.thread_id, r.last_read_at);
  }

  // Fetch top-N recent non-deleted threads, skipping user's own
  const { data: threadsData } = await supabase
    .from('threads')
    .select(
      `id, title, slug, post_count, last_post_at, is_pinned, is_locked,
       subforum:subforums(name, slug),
       last_user:users!threads_last_post_user_id_fkey(username, role, avatar_url)`,
    )
    .eq('is_deleted', false)
    .neq('author_id', me.id)
    .order('last_post_at', { ascending: false })
    .limit(RECENT_LIMIT);

  const rows = (threadsData ?? []) as unknown as ThreadRow[];

  const unreadThreads = rows.filter((t) => {
    const lastRead = readMap.get(t.id);
    if (!lastRead) return true; // never read
    return new Date(t.last_post_at) > new Date(lastRead);
  });

  // Group by subforum slug
  const groups = new Map<string, { subforumName: string; subforumSlug: string; threads: ThreadRow[] }>();
  for (const t of unreadThreads) {
    if (!t.subforum) continue;
    const key = t.subforum.slug;
    if (!groups.has(key)) {
      groups.set(key, {
        subforumName: t.subforum.name,
        subforumSlug: t.subforum.slug,
        threads: [],
      });
    }
    groups.get(key)!.threads.push(t);
  }

  return (
    <Container>
      <div className="py-8 space-y-6">
        <div>
          <h1 className="text-2xl font-semibold">What&apos;s new</h1>
          <p className="text-sm text-[var(--fg-muted)] mt-1">
            Threads with new posts since you last viewed them.
          </p>
          <div className="title-rule mt-2" />
        </div>

        {unreadThreads.length === 0 ? (
          <p className="text-sm text-[var(--fg-muted)] py-12 text-center">
            All caught up.
          </p>
        ) : (
          Array.from(groups.values()).map((g) => (
            <section key={g.subforumSlug} className="space-y-2">
              <h2 className="text-xs font-mono uppercase text-[var(--fg-muted)]">
                <Link href={`/f/${g.subforumSlug}`} className="hover:text-[var(--fg)]">
                  {g.subforumName}
                </Link>
              </h2>
              <ul className="rounded border border-[var(--border)] divide-y divide-[var(--border)]">
                {g.threads.map((t) => (
                  <li key={t.id} className="p-3 flex items-center justify-between gap-4">
                    <div className="min-w-0">
                      <Link href={`/t/${t.id}`} className="font-medium hover:underline">
                        {t.is_pinned && <span role="img" aria-label="pinned" className="mr-1">📌</span>}
                        {t.is_locked && <span role="img" aria-label="locked" className="mr-1">🔒</span>}
                        {t.title}
                      </Link>
                    </div>
                    <div className="text-right shrink-0 text-xs text-[var(--fg-muted)]">
                      {t.last_user ? (
                        <>
                          last by{' '}
                          <UserChip
                            username={t.last_user.username}
                            role={t.last_user.role}
                            avatarUrl={t.last_user.avatar_url}
                            size={16}
                          />
                          {' '}
                        </>
                      ) : null}
                      <span className="font-mono">{relativeTime(t.last_post_at)}</span>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ))
        )}
      </div>
    </Container>
  );
}
