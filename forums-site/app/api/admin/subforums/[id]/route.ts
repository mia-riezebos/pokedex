import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { getCurrentUser } from '@/lib/auth';

export const runtime = 'nodejs';

const Patch = z.object({
  is_locked: z.boolean(),
});

export async function PATCH(
  req: Request,
  { params }: { params: { id: string } },
) {
  let parsed;
  try {
    parsed = Patch.safeParse(await req.json());
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input' }, { status: 400 });
  }

  const id = Number(params.id);
  if (!Number.isFinite(id) || id <= 0) {
    return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
  }

  const me = await getCurrentUser();
  if (!me) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }
  if (me.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const supabase = createClient();

  const { data, error } = await supabase
    .from('subforums')
    .update({ is_locked: parsed.data.is_locked })
    .eq('id', id)
    .select('id')
    .single();
  if (error) {
    // PGRST116 = no rows from .single() → treat as not found
    if (error.code === 'PGRST116') {
      return NextResponse.json({ error: 'Subforum not found' }, { status: 404 });
    }
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  if (!data) {
    return NextResponse.json({ error: 'Subforum not found' }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
