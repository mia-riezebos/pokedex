import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { renderMarkdown } from '@/lib/markdown';

export const runtime = 'nodejs';

const Patch = z.object({ body_md: z.string().min(1).max(50_000) });

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  let parsed;
  try {
    parsed = Patch.safeParse(await req.json());
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

  const { data: existing } = await supabase
    .from('posts')
    .select('author_id, body_md')
    .eq('id', params.id)
    .maybeSingle();
  if (!existing) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  if (existing.author_id !== user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // Snapshot the pre-edit state to post_edits BEFORE updating posts
  await supabase.from('post_edits').insert({
    post_id: params.id,
    body_md: existing.body_md,
    edited_by: user.id,
  });

  const body_html = await renderMarkdown(parsed.data.body_md);
  const { error } = await supabase
    .from('posts')
    .update({
      body_md: parsed.data.body_md,
      body_html,
      edited_at: new Date().toISOString(),
      edited_by: user.id,
    })
    .eq('id', params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  // RLS gates the update to author_id = auth.uid(). We don't need explicit ownership check
  // here, but a friendlier error if not author:
  const { data: existing } = await supabase
    .from('posts')
    .select('author_id')
    .eq('id', params.id)
    .maybeSingle();
  if (!existing) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  if (existing.author_id !== user.id) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { error } = await supabase
    .from('posts')
    .update({ is_deleted: true })
    .eq('id', params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({ ok: true });
}
