import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { getCurrentUser } from '@/lib/auth';

export const runtime = 'nodejs';

const Patch = z.object({
  role: z.enum(['user', 'mod']),
});

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

  const me = await getCurrentUser();
  if (!me) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  if (me.role !== 'admin') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  if (me.is_banned) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  if (me.id === params.id) {
    return NextResponse.json({ error: "Can't change your own role" }, { status: 400 });
  }

  const supabase = createClient();

  // Look up target to prevent demoting other admins (only admins can do that and it's risky)
  const { data: target } = await supabase
    .from('users')
    .select('id, username, role')
    .eq('id', params.id)
    .maybeSingle();
  if (!target) return NextResponse.json({ error: 'User not found' }, { status: 404 });
  if (target.role === 'admin') {
    return NextResponse.json({ error: 'Cannot change admin roles via UI; use SQL.' }, { status: 400 });
  }
  if (target.role === parsed.data.role) {
    return NextResponse.json({ ok: true, noop: true });
  }

  const { error } = await supabase
    .from('users')
    .update({ role: parsed.data.role })
    .eq('id', params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  await supabase.from('mod_log').insert({
    actor_id: me.id,
    action: parsed.data.role === 'mod' ? 'promote_mod' : 'demote_user',
    target_type: 'user',
    target_id: params.id,
    metadata: { from: target.role, to: parsed.data.role, username: target.username },
  });

  return NextResponse.json({ ok: true });
}
