import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { renderMarkdown } from '@/lib/markdown';
import { slugify } from '@/lib/slug';
import { limits } from '@/lib/rate-limit';

export const runtime = 'nodejs';

const Body = z.object({
  subforum_id: z.number().int().positive(),
  title: z.string().min(3).max(200),
  body_md: z.string().min(1).max(50_000),
});

export async function POST(req: Request) {
  let parsed;
  try {
    parsed = Body.safeParse(await req.json());
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input' }, { status: 400 });
  }

  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const rl = await limits.postCreate(user.id);
  if (!rl.success) {
    return NextResponse.json({ error: 'Rate limited. Slow down.' }, { status: 429 });
  }

  const { subforum_id, title, body_md } = parsed.data;

  // Whitespace-only title is caught by DB CHECK but we can short-circuit:
  if (title.trim().length < 3) {
    return NextResponse.json({ error: 'Title must be at least 3 non-whitespace characters' }, { status: 400 });
  }

  // Generate slug. slugify may return '' for punctuation-only titles — fall back.
  const baseSlug = slugify(title) || `thread`;
  // Append timestamp suffix for uniqueness within subforum (also satisfies the DB CHECK
  // because timestamp chars are all [a-z0-9]).
  const slug = `${baseSlug}-${Date.now().toString(36)}`.slice(0, 60);

  const body_html = await renderMarkdown(body_md);

  const { data: thread, error: threadErr } = await supabase
    .from('threads')
    .insert({ subforum_id, author_id: user.id, title, slug })
    .select('id')
    .single();
  if (threadErr || !thread) {
    return NextResponse.json(
      { error: threadErr?.message ?? 'Failed to create thread' },
      { status: 400 },
    );
  }

  const { error: postErr } = await supabase.from('posts').insert({
    thread_id: thread.id,
    author_id: user.id,
    body_md,
    body_html,
    post_number: 0, // trigger overrides — required by TS Insert type
  });
  if (postErr) {
    // Best-effort cleanup (no transaction across these inserts).
    const admin = createAdminClient();
    await admin.from('threads').delete().eq('id', thread.id);
    return NextResponse.json({ error: postErr.message }, { status: 400 });
  }

  return NextResponse.json({ thread_id: thread.id });
}
