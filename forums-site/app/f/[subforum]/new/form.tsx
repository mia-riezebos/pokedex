'use client';

import { Composer } from '@/components/post/Composer';

export function NewThreadForm({
  subforumId,
}: {
  subforumId: number;
}) {
  return (
    <Composer
      showTitle
      submitLabel="Create thread"
      onSubmit={async ({ title, body }) => {
        const res = await fetch('/api/threads', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ subforum_id: subforumId, title, body_md: body }),
        });
        const json = (await res.json()) as { thread_id?: string; error?: string };
        if (!res.ok) return { error: json.error ?? 'Something went wrong' };
        return { redirectTo: `/t/${json.thread_id}` };
      }}
    />
  );
}
