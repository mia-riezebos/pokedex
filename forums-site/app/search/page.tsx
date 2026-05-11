import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { Container } from '@/components/chrome/Container';
import { UserChip } from '@/components/user/UserChip';
import { relativeTime } from '@/lib/time';
import { SearchForm } from './SearchForm';

export const dynamic = 'force-dynamic';

interface AuthorRef {
  username: string;
  role: 'user' | 'mod' | 'admin';
  avatar_url: string | null;
}

interface ThreadHit {
  kind: 'thread';
  id: string;
  title: string;
  created_at: string;
  author: AuthorRef | null;
  subforum: { slug: string; name: string } | null;
}

interface PostHit {
  kind: 'post';
  id: string;
  post_number: number;
  thread_id: string;
  body_md: string;
  created_at: string;
  author: AuthorRef | null;
  thread: { title: string; subforum: { slug: string; name: string } | null } | null;
}

type Hit = ThreadHit | PostHit;

const LIMIT = 25;
const SNIPPET_LEN = 200;

function buildTsQuery(input: string): string | null {
  const tokens = input
    .trim()
    .split(/\s+/)
    .map((t) => t.replace(/[^a-zA-Z0-9_]/g, ''))
    .filter((t) => t.length >= 2);
  if (tokens.length === 0) return null;
  // AND all tokens with prefix-match suffix (':*') for partial words
  return tokens.map((t) => `${t}:*`).join(' & ');
}

function snippet(body: string, max = SNIPPET_LEN): string {
  if (body.length <= max) return body;
  return body.slice(0, max).trimEnd() + '…';
}

export default async function SearchPage({
  searchParams,
}: {
  searchParams: { q?: string };
}) {
  const rawQuery = (searchParams.q ?? '').trim();
  const tsQuery = buildTsQuery(rawQuery);

  let hits: Hit[] = [];
  let count = 0;
  let hasMore = false;

  if (tsQuery) {
    const supabase = createClient();

    const [threadsRes, postsRes] = await Promise.all([
      supabase
        .from('threads')
        .select(
          `id, title, created_at,
           author:users!threads_author_id_fkey(username, role, avatar_url),
           subforum:subforums(slug, name)`,
        )
        .eq('is_deleted', false)
        .textSearch('tsv', tsQuery, { config: 'simple' })
        .order('created_at', { ascending: false })
        .limit(LIMIT),
      supabase
        .from('posts')
        .select(
          `id, post_number, thread_id, body_md, created_at,
           author:users!posts_author_id_fkey(username, role, avatar_url),
           thread:threads(title, subforum:subforums(slug, name))`,
        )
        .eq('is_deleted', false)
        .eq('is_hidden', false)
        .textSearch('tsv', tsQuery, { config: 'simple' })
        .order('created_at', { ascending: false })
        .limit(LIMIT),
    ]);

    if (threadsRes.error) {
      console.error('[search] threads query failed:', threadsRes.error.message);
    }
    if (postsRes.error) {
      console.error('[search] posts query failed:', postsRes.error.message);
    }

    const threadHits: ThreadHit[] = ((threadsRes.data ?? []) as unknown as Omit<ThreadHit, 'kind'>[])
      .map((t) => ({ ...t, kind: 'thread' as const }));
    const postHits: PostHit[] = ((postsRes.data ?? []) as unknown as Omit<PostHit, 'kind'>[])
      .map((p) => ({ ...p, kind: 'post' as const }));

    const all: Hit[] = [...threadHits, ...postHits];
    all.sort((a, b) => b.created_at.localeCompare(a.created_at));
    hits = all.slice(0, LIMIT);
    hasMore = all.length > LIMIT;
    count = hits.length;
  }

  return (
    <Container>
      <div className="py-6 space-y-6">
        <div>
          <h1 className="text-xl font-semibold">Search</h1>
          <div className="title-rule mt-2" />
        </div>

        <SearchForm initial={rawQuery} />

        {rawQuery && tsQuery === null && (
          <p className="text-sm text-[var(--fg-muted)]">
            Add a query with at least one 2-character word.
          </p>
        )}

        {tsQuery && (
          <>
            <p className="text-xs font-mono text-[var(--fg-muted)]">
              {count === 0
                ? 'No results.'
                : `${count} result${count === 1 ? '' : 's'} for "${rawQuery.slice(0, 80)}${rawQuery.length > 80 ? '…' : ''}"${hasMore ? ' (more available — refine your query)' : ''}`}
            </p>

            <ul className="space-y-3">
              {hits.map((h) =>
                h.kind === 'thread' ? (
                  <li key={`t-${h.id}`} className="rounded border border-[var(--border)] p-3 bg-[var(--bg-elev-1)]">
                    <div className="flex items-baseline justify-between gap-2">
                      <Link href={`/t/${h.id}`} className="font-medium hover:underline">
                        {h.title}
                      </Link>
                      <span className="font-mono text-[10px] uppercase text-[var(--fg-muted)]">thread</span>
                    </div>
                    <div className="mt-1 text-xs text-[var(--fg-muted)] flex items-center gap-2 flex-wrap">
                      {h.subforum && (
                        <Link href={`/f/${h.subforum.slug}`} className="text-[var(--accent)]">
                          {h.subforum.name}
                        </Link>
                      )}
                      {h.author && (
                        <>
                          <span>· by</span>
                          <UserChip
                            username={h.author.username}
                            role={h.author.role}
                            avatarUrl={h.author.avatar_url}
                            size={16}
                          />
                        </>
                      )}
                      <span>· <span className="font-mono">{relativeTime(h.created_at)}</span></span>
                    </div>
                  </li>
                ) : (
                  <li key={`p-${h.id}`} className="rounded border border-[var(--border)] p-3 bg-[var(--bg-elev-1)]">
                    <div className="flex items-baseline justify-between gap-2">
                      <Link
                        href={`/t/${h.thread_id}?page=${Math.ceil(h.post_number / 20)}#post-${h.post_number}`}
                        className="font-medium hover:underline truncate"
                      >
                        {h.thread?.title ?? '(thread)'} — #post-{h.post_number}
                      </Link>
                      <span className="font-mono text-[10px] uppercase text-[var(--fg-muted)]">post</span>
                    </div>
                    <p className="mt-2 text-sm text-[var(--fg)] whitespace-pre-wrap break-words">
                      {snippet(h.body_md)}
                    </p>
                    <div className="mt-2 text-xs text-[var(--fg-muted)] flex items-center gap-2 flex-wrap">
                      {h.thread?.subforum && (
                        <Link href={`/f/${h.thread.subforum.slug}`} className="text-[var(--accent)]">
                          {h.thread.subforum.name}
                        </Link>
                      )}
                      {h.author && (
                        <>
                          <span>· by</span>
                          <UserChip
                            username={h.author.username}
                            role={h.author.role}
                            avatarUrl={h.author.avatar_url}
                            size={16}
                          />
                        </>
                      )}
                      <span>· <span className="font-mono">{relativeTime(h.created_at)}</span></span>
                    </div>
                  </li>
                ),
              )}
            </ul>
          </>
        )}
      </div>
    </Container>
  );
}
