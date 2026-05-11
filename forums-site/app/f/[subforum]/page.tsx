import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { Container } from '@/components/chrome/Container';
import { UserChip } from '@/components/user/UserChip';
import { relativeTime } from '@/lib/time';

const PAGE_SIZE = 25;
export const dynamic = 'force-dynamic';

interface AuthorRef {
  username: string;
  role: 'user' | 'mod' | 'admin';
  avatar_url: string | null;
}

interface ThreadRow {
  id: string;
  title: string;
  slug: string;
  post_count: number;
  last_post_at: string;
  is_pinned: boolean;
  is_locked: boolean;
  author: AuthorRef | null;
  last_user: AuthorRef | null;
}

export default async function SubforumPage({
  params,
  searchParams,
}: {
  params: { subforum: string };
  searchParams: { page?: string };
}) {
  const supabase = createClient();
  const page = Math.max(1, parseInt(searchParams.page ?? '1', 10) || 1);

  const { data: subforum } = await supabase
    .from('subforums')
    .select('id, name, description, is_locked')
    .eq('slug', params.subforum)
    .maybeSingle();
  if (!subforum) notFound();

  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  const { data: threads, count } = await supabase
    .from('threads')
    .select(
      `id, title, slug, post_count, last_post_at, is_pinned, is_locked,
       author:users!threads_author_id_fkey(username, role, avatar_url),
       last_user:users!threads_last_post_user_id_fkey(username, role, avatar_url)`,
      { count: 'exact' },
    )
    .eq('subforum_id', subforum.id)
    .eq('is_deleted', false)
    .order('is_pinned', { ascending: false })
    .order('last_post_at', { ascending: false })
    .range(from, to);

  const totalPages = Math.max(1, Math.ceil((count ?? 0) / PAGE_SIZE));
  const rows = (threads ?? []) as unknown as ThreadRow[];

  return (
    <Container>
      <div className="py-6 space-y-4">
        <div className="flex items-end justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-xl font-semibold">{subforum.name}</h1>
            {subforum.description && (
              <p className="text-sm text-[var(--fg-muted)]">{subforum.description}</p>
            )}
            <div className="title-rule mt-2" />
          </div>
          {!subforum.is_locked && (
            <Link
              href={`/f/${params.subforum}/new`}
              className="shrink-0 text-sm px-3 py-1.5 rounded bg-[var(--accent)] text-white"
            >
              New thread
            </Link>
          )}
        </div>

        <ul className="rounded border border-[var(--border)] divide-y divide-[var(--border)]">
          {rows.map((t) => (
            <li key={t.id} className="p-4 flex items-center justify-between gap-4">
              <div className="min-w-0">
                <Link href={`/t/${t.id}`} className="font-medium hover:underline">
                  {t.is_pinned && <span role="img" aria-label="pinned" className="mr-1">📌</span>}
                  {t.is_locked && <span role="img" aria-label="locked" className="mr-1">🔒</span>}
                  {t.title}
                </Link>
                {t.author && (
                  <div className="mt-1 text-xs text-[var(--fg-muted)] flex items-center gap-2">
                    <span>by</span>
                    <UserChip
                      username={t.author.username}
                      role={t.author.role}
                      avatarUrl={t.author.avatar_url}
                      size={16}
                    />
                  </div>
                )}
              </div>
              <div className="text-right shrink-0">
                <div className="font-mono text-xs text-[var(--fg-muted)]">
                  {t.post_count - 1} {t.post_count - 1 === 1 ? 'reply' : 'replies'}
                </div>
                <div className="text-xs text-[var(--fg-muted)] mt-1">
                  {t.last_user ? (
                    <>
                      last by <span className="text-[var(--fg)]">{t.last_user.username}</span> ·{' '}
                    </>
                  ) : (
                    'OP · '
                  )}
                  <span className="font-mono">{relativeTime(t.last_post_at)}</span>
                </div>
              </div>
            </li>
          ))}
          {rows.length === 0 && (
            <li className="p-8 text-center text-sm text-[var(--fg-muted)]">
              No threads yet. Be the first.
            </li>
          )}
        </ul>

        {totalPages > 1 && (
          <div className="flex justify-center gap-2 font-mono text-xs">
            {Array.from({ length: totalPages }, (_, i) => i + 1).map((n) => (
              <Link
                key={n}
                href={`/f/${params.subforum}?page=${n}`}
                className={
                  n === page
                    ? 'text-[var(--accent)]'
                    : 'text-[var(--fg-muted)] hover:text-[var(--fg)]'
                }
              >
                [{n}]
              </Link>
            ))}
          </div>
        )}
      </div>
    </Container>
  );
}
