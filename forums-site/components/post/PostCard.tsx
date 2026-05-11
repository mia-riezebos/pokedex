import Link from 'next/link';
import { Avatar } from '@/components/user/Avatar';
import { RoleBadge } from '@/components/user/RoleBadge';
import { PostBody } from './PostBody';
import { PostActions } from './PostActions';
import { relativeTime } from '@/lib/time';

export interface PostCardData {
  id: string;
  post_number: number;
  body_md: string;
  is_deleted: boolean;
  is_hidden: boolean;
  edited_at: string | null;
  created_at: string;
  author_id: string;
  author: {
    username: string;
    role: 'user' | 'mod' | 'admin';
    avatar_url: string | null;
    post_count: number;
    created_at: string;
    signature_md: string | null;
  };
}

export function PostCard({
  post,
  viewerIsMod = false,
  viewerId = null,
}: {
  post: PostCardData;
  viewerIsMod?: boolean;
  viewerId?: string | null;
}) {
  const hidden = (post.is_deleted || post.is_hidden) && !viewerIsMod;
  return (
    <article
      id={`post-${post.post_number}`}
      className="rounded border border-[var(--border)] bg-[var(--bg-elev-1)]"
    >
      <div className="grid grid-cols-[160px_1fr]">
        <div className="border-r border-[var(--border)] p-4 text-center space-y-2">
          <div className="flex justify-center">
            <Avatar userId={post.author.username} url={post.author.avatar_url} size={64} />
          </div>
          <Link
            href={`/u/${post.author.username}`}
            className="block font-medium hover:underline"
          >
            {post.author.username}
          </Link>
          <RoleBadge role={post.author.role} />
          <div className="font-mono text-[11px] text-[var(--fg-muted)] space-y-0.5">
            <div>posts: {post.author.post_count}</div>
            <div>joined: {new Date(post.author.created_at).toISOString().slice(0, 7)}</div>
          </div>
        </div>
        <div className="p-4">
          {hidden ? (
            <div className="text-sm italic text-[var(--fg-muted)]">[Hidden]</div>
          ) : (
            <PostBody md={post.body_md} />
          )}
          {post.author.signature_md && !hidden && (
            <div className="mt-6 pt-3 border-t border-[var(--border)] text-xs text-[var(--fg-muted)]">
              {post.author.signature_md}
            </div>
          )}
        </div>
      </div>
      <div className="border-t border-[var(--border)] px-4 py-2 flex items-center justify-between">
        <div className="font-mono text-[11px] text-[var(--fg-muted)]">
          <Link href={`#post-${post.post_number}`} className="hover:text-[var(--fg)]">
            #post-{post.post_number}
          </Link>
          <span> · {relativeTime(post.created_at)}</span>
          {post.edited_at && <span> · edited {relativeTime(post.edited_at)}</span>}
        </div>
        {viewerId === post.author_id && !post.is_deleted && (
          <PostActions postId={post.id} initialBody={post.body_md} />
        )}
      </div>
    </article>
  );
}
