import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';

const Body = z.object({
  name: z.string().min(1).max(50),
  slug: z.string().regex(/^[a-z0-9][a-z0-9-]*[a-z0-9]$/),
  position: z.number().int().min(0).default(0),
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

  // Defense in depth — RLS also enforces admin role.
  const { data: me } = await supabase.from('users').select('role').eq('id', user.id).maybeSingle();
  if (!me || me.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { data, error } = await supabase
    .from('categories')
    .insert(parsed.data)
    .select('id')
    .single();
  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ error: 'A category with that slug already exists' }, { status: 400 });
    }
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ id: data.id });
}
