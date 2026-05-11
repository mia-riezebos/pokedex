import { notFound } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { Container } from '@/components/chrome/Container';
import { PostCard, type PostCardData } from '@/components/post/PostCard';
import { getCurrentUser } from '@/lib/auth';
import { ReplyForm } from './reply';

const PAGE_SIZE = 20;
export const dynamic = 'force-dynamic';

export default async function ThreadPage({
  params,
  searchParams,
}: {
  params: { thread: string };
  searchParams: { page?: string };
}) {
  const supabase = createClient();
  const me = await getCurrentUser();
  const page = Math.max(1, parseInt(searchParams.page ?? '1', 10) || 1);

  const { data: thread } = await supabase
    .from('threads')
    .select(
      'id, title, is_locked, is_deleted, post_count, subforum:subforums(name, slug)',
    )
    .eq('id', params.thread)
    .maybeSingle();
  if (!thread || thread.is_deleted) notFound();

  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  const { data: posts } = await supabase
    .from('posts')
    .select(
      `id, post_number, body_md, is_deleted, is_hidden, edited_at, created_at,
       author:users!posts_author_id_fkey(username, role, avatar_url, post_count, created_at, signature_md)`,
    )
    .eq('thread_id', thread.id)
    .order('post_number')
    .range(from, to);

  const totalPages = Math.max(1, Math.ceil(thread.post_count / PAGE_SIZE));
  const subforum = thread.subforum as unknown as { name: string; slug: string } | null;
  const viewerIsMod = me?.role === 'mod' || me?.role === 'admin';

  return (
    <Container>
      <div className="py-6 space-y-4">
        <div>
          {subforum && (
            <p className="text-xs text-[var(--fg-muted)]">
              in{' '}
              <Link href={`/f/${subforum.slug}`} className="text-[var(--accent)]">
                {subforum.name}
              </Link>
            </p>
          )}
          <h1 className="text-xl font-semibold mt-1">{thread.title}</h1>
          <div className="title-rule mt-2" />
        </div>

        <div className="space-y-4">
          {((posts ?? []) as unknown as PostCardData[]).map((p) => (
            <PostCard key={p.id} post={p} viewerIsMod={viewerIsMod} />
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

        {!thread.is_locked && me && <ReplyForm threadId={thread.id} />}
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
