import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { renderMarkdown } from '@/lib/markdown';
import { limits } from '@/lib/rate-limit';

export const runtime = 'nodejs';

const Body = z.object({
  body_md: z.string().min(1).max(50_000),
  reply_to_post_id: z.string().uuid().optional(),
});

export async function POST(
  req: Request,
  { params }: { params: { id: string } },
) {
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

  const body_html = await renderMarkdown(parsed.data.body_md);

  const { data: post, error } = await supabase
    .from('posts')
    .insert({
      thread_id: params.id,
      author_id: user.id,
      body_md: parsed.data.body_md,
      body_html,
      post_number: 0, // trigger overrides
      reply_to_post_id: parsed.data.reply_to_post_id ?? null,
    })
    .select('id, post_number')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ post });
}
