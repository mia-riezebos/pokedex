import { notFound } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { Container } from '@/components/chrome/Container';
import { PostCard, type PostCardData } from '@/components/post/PostCard';
import { getCurrentUser } from '@/lib/auth';
import { ReplyForm } from './reply';
import { ThreadModActions } from '@/components/thread/ThreadModActions';

const PAGE_SIZE = 20;
export const dynamic = 'force-dynamic';

export default async function ThreadPage({
  params,
  searchParams,
}: {
  params: { thread: string };
  searchParams: { page?: string; quote?: string };
}) {
  const supabase = createClient();
  const me = await getCurrentUser();
  const page = Math.max(1, parseInt(searchParams.page ?? '1', 10) || 1);

  const { data: thread } = await supabase
    .from('threads')
    .select(
      'id, title, is_pinned, is_locked, is_deleted, post_count, subforum:subforums(name, slug)',
    )
    .eq('id', params.thread)
    .maybeSingle();
  if (!thread || thread.is_deleted) notFound();

  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  const { data: posts } = await supabase
    .from('posts')
    .select(
      `id, post_number, body_md, is_deleted, is_hidden, edited_at, created_at, author_id, thread_id,
       author:users!posts_author_id_fkey(username, role, avatar_url, post_count, created_at, signature_md),
       thanks_count:thanks(count)`,
    )
    .eq('thread_id', thread.id)
    .order('post_number')
    .range(from, to);

  const postIds = (posts ?? []).map((p) => p.id);
  let thankedSet = new Set<string>();
  if (me && postIds.length > 0) {
    const { data: viewerThanks } = await supabase
      .from('thanks')
      .select('post_id')
      .eq('user_id', me.id)
      .in('post_id', postIds);
    thankedSet = new Set((viewerThanks ?? []).map((t) => t.post_id));
  }

  type RawPostRow = Omit<PostCardData, 'thanks_count' | 'viewer_thanked'> & {
    thanks_count: { count: number }[] | null;
  };

  const rawPosts = (posts ?? []) as unknown as RawPostRow[];
  const enrichedPosts: PostCardData[] = rawPosts.map((p) => ({
    ...p,
    thanks_count:
      Array.isArray(p.thanks_count) && p.thanks_count[0] != null
        ? Number(p.thanks_count[0].count)
        : 0,
    viewer_thanked: thankedSet.has(p.id),
  }));

  let initialReplyBody = '';
  let replyToPostId: string | null = null;
  if (searchParams.quote && me && !thread.is_locked) {
    // Fetch the quoted post for prefill. Must be in this thread + not deleted/hidden.
    const { data: quoted } = await supabase
      .from('posts')
      .select('id, body_md, is_deleted, is_hidden, author:users!posts_author_id_fkey(username)')
      .eq('id', searchParams.quote)
      .eq('thread_id', thread.id)
      .maybeSingle();

    if (quoted && !quoted.is_deleted && !quoted.is_hidden) {
      const author = (quoted.author as unknown as { username: string } | null)?.username ?? '?';
      const quotedBody = quoted.body_md
        .split('\n')
        .map((line) => `> ${line}`)
        .join('\n');
      initialReplyBody = `> @${author} said:\n${quotedBody}\n\n`;
      replyToPostId = quoted.id;
    }
  }

  const totalPages = Math.max(1, Math.ceil(thread.post_count / PAGE_SIZE));
  const subforum = thread.subforum as unknown as { name: string; slug: string } | null;
  const viewerIsMod = me?.role === 'mod' || me?.role === 'admin';

  return (
    <Container>
      <div className="py-6 space-y-4">
        <div>
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              {subforum && (
                <p className="text-xs text-[var(--fg-muted)]">
                  in{' '}
                  <Link href={`/f/${subforum.slug}`} className="text-[var(--accent)]">
                    {subforum.name}
                  </Link>
                </p>
              )}
              <h1 className="text-xl font-semibold mt-1">
                {thread.is_pinned && <span role="img" aria-label="pinned" className="mr-1">📌</span>}
                {thread.is_locked && <span role="img" aria-label="locked" className="mr-1">🔒</span>}
                {thread.title}
              </h1>
            </div>
            {viewerIsMod && (
              <ThreadModActions
                threadId={thread.id}
                initialPinned={thread.is_pinned}
                initialLocked={thread.is_locked}
              />
            )}
          </div>
          <div className="title-rule mt-2" />
        </div>

        <div className="space-y-4">
          {enrichedPosts.map((p) => (
            <PostCard
              key={p.id}
              post={p}
              viewerIsMod={viewerIsMod}
              viewerId={me?.id ?? null}
              threadIsLocked={thread.is_locked}
            />
          ))}
        </div>

        {totalPages > 1 && (
          <div className="flex justify-center gap-2 font-mono text-xs">
            {Array.from({ length: totalPages }, (_, i) => i + 1).map((n) => (
              <Link
                key={n}
                href={`/t/${thread.id}?page=${n}`}
                className={
                  n === page ? 'text-[var(--accent)]' : 'text-[var(--fg-muted)] hover:text-[var(--fg)]'
                }
              >
                [{n}]
              </Link>
            ))}
          </div>
        )}

        {!thread.is_locked && me && (
          <div id="reply" className="scroll-mt-20">
            <ReplyForm
              threadId={thread.id}
              initialBody={initialReplyBody}
              replyToPostId={replyToPostId}
            />
          </div>
        )}
        {!me && !thread.is_locked && (
          <p className="text-sm text-[var(--fg-muted)] text-center py-4">
            <Link href={`/login?next=/t/${thread.id}`} className="text-[var(--accent)]">
              Sign in
            </Link>{' '}
            to reply.
          </p>
        )}

        {thread.is_locked && (
          <p className="text-sm text-[var(--fg-muted)] text-center py-4">Thread locked.</p>
        )}
      </div>
    </Container>
  );
}
