import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { Container } from '@/components/chrome/Container';
import { Avatar } from '@/components/user/Avatar';
import { RoleBadge } from '@/components/user/RoleBadge';
import { relativeTime } from '@/lib/time';
import { Markdown } from '@/components/ui/Markdown';

export const dynamic = 'force-dynamic';

interface RecentPost {
  id: string;
  post_number: number;
  thread_id: string;
  created_at: string;
  threads: { title: string } | null;
}

export default async function ProfilePage({ params }: { params: { username: string } }) {
  const supabase = createClient();

  const { data: user } = await supabase
    .from('users')
    .select(
      'id, username, role, avatar_url, post_count, created_at, last_seen_at, signature_md, bio',
    )
    .eq('username', params.username)
    .maybeSingle();
  if (!user) notFound();

  const { data: recent } = await supabase
    .from('posts')
    .select('id, post_number, thread_id, created_at, threads(title)')
    .eq('author_id', user.id)
    .eq('is_deleted', false)
    .eq('is_hidden', false)
    .order('created_at', { ascending: false })
    .limit(10);

  const recentRows = (recent ?? []) as unknown as RecentPost[];

  return (
    <Container>
      <div className="py-6 grid grid-cols-1 sm:grid-cols-[200px_1fr] gap-8">
        <div className="space-y-3 text-center">
          <div className="flex justify-center">
            <Avatar userId={user.username} url={user.avatar_url} size={120} />
          </div>
          <div>
            <div className="font-medium">{user.username}</div>
            <RoleBadge role={user.role} />
          </div>
          <div className="font-mono text-xs text-[var(--fg-muted)] space-y-0.5">
            <div>posts: {user.post_count}</div>
            <div>joined: {new Date(user.created_at).toISOString().slice(0, 7)}</div>
            <div>last seen: {relativeTime(user.last_seen_at)}</div>
          </div>
        </div>
        <div>
          {user.bio && (
            <div className="mb-6">
              <Markdown source={user.bio} />
            </div>
          )}
          <h2 className="text-sm font-semibold mb-2">Recent posts</h2>
          <ul className="space-y-1">
            {recentRows.map((p) => (
              <li key={p.id} className="text-sm">
                <Link
                  href={`/t/${p.thread_id}#post-${p.post_number}`}
                  className="hover:underline"
                >
                  {p.threads?.title ?? '(thread deleted)'}
                </Link>
                <span className="font-mono text-xs text-[var(--fg-muted)]">
                  {' · '}
                  {relativeTime(p.created_at)}
                </span>
              </li>
            ))}
            {recentRows.length === 0 && (
              <li className="text-sm text-[var(--fg-muted)]">No posts yet.</li>
            )}
          </ul>
        </div>
      </div>
    </Container>
  );
}
