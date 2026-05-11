'use client';

import { useRouter } from 'next/navigation';
import { Composer } from '@/components/post/Composer';

export function ReplyForm({
  threadId,
  initialBody = '',
  replyToPostId = null,
}: {
  threadId: string;
  initialBody?: string;
  replyToPostId?: string | null;
}) {
  const router = useRouter();
  return (
    <Composer
      initialBody={initialBody}
      submitLabel="Post reply"
      onSubmit={async ({ body }) => {
        const res = await fetch(`/api/threads/${threadId}/posts`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            body_md: body,
            ...(replyToPostId ? { reply_to_post_id: replyToPostId } : {}),
          }),
        });
        const json = (await res.json()) as {
          post?: { id: string; post_number: number };
          error?: string;
        };
        if (!res.ok) return { error: json.error ?? 'Something went wrong' };
        router.refresh();
        return {
          redirectTo: json.post
            ? `/t/${threadId}?page=${Math.ceil(json.post.post_number / 20)}#post-${json.post.post_number}`
            : `/t/${threadId}`,
        };
      }}
    />
  );
}
