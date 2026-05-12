import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { getCurrentUser } from '@/lib/auth';
import { limits } from '@/lib/rate-limit';

export const runtime = 'nodejs';

const Body = z.object({
  post_id: z.string().uuid(),
  reason: z.enum(['spam', 'harassment', 'off_topic', 'other']),
  note: z.string().max(500).nullable().optional(),
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

  const me = await getCurrentUser();
  if (!me) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }
  if (me.is_banned) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const rl = await limits.reportCreate(me.id);
  if (!rl.success) {
    return NextResponse.json({ error: 'Rate limited.' }, { status: 429 });
  }

  const supabase = createClient();

  // Block self-report
  const { data: post } = await supabase
    .from('posts')
    .select('author_id')
    .eq('id', parsed.data.post_id)
    .maybeSingle();
  if (!post) {
    return NextResponse.json({ error: 'Post not found' }, { status: 404 });
  }
  if (post.author_id === me.id) {
    return NextResponse.json({ error: "Can't report your own post" }, { status: 400 });
  }

  const { error } = await supabase.from('reports').insert({
    post_id: parsed.data.post_id,
    reporter_id: me.id,
    reason: parsed.data.reason,
    note: parsed.data.note ?? null,
  });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
