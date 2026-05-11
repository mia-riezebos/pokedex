import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  // Block self-thanks (UI already hides the button; this is server-side enforcement)
  const { data: post } = await supabase
    .from('posts')
    .select('author_id')
    .eq('id', params.id)
    .maybeSingle();
  if (!post) {
    return NextResponse.json({ error: 'Post not found' }, { status: 404 });
  }
  if (post.author_id === user.id) {
    return NextResponse.json({ error: 'Cannot thank your own post' }, { status: 400 });
  }

  const { error } = await supabase
    .from('thanks')
    .insert({ post_id: params.id, user_id: user.id });

  if (error) {
    // 23505 = unique_violation — already thanked. Treat as idempotent success.
    if (error.code === '23505') {
      return NextResponse.json({ ok: true, already: true });
    }
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const { error } = await supabase
    .from('thanks')
    .delete()
    .eq('post_id', params.id)
    .eq('user_id', user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
