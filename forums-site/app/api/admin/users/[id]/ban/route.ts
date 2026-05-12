import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { getCurrentUser } from '@/lib/auth';

export const runtime = 'nodejs';

const BanBody = z.object({
  reason: z.string().min(1).max(500),
  expires_at: z.string().datetime().optional(), // ISO; omit for permanent
});

async function authorize(targetId: string) {
  const me = await getCurrentUser();
  if (!me) return { error: 'Not authenticated', status: 401 as const };
  if (me.is_banned) return { error: 'Forbidden', status: 403 as const };
  if (me.role !== 'mod' && me.role !== 'admin') return { error: 'Forbidden', status: 403 as const };
  if (me.id === targetId) return { error: "Can't ban yourself", status: 400 as const };
  return { me };
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
  let parsed;
  try {
    parsed = BanBody.safeParse(await req.json());
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input' }, { status: 400 });
  }

  const auth = await authorize(params.id);
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const { me } = auth;

  const supabase = createClient();

  // Look up target
  const { data: target } = await supabase
    .from('users')
    .select('id, username, role')
    .eq('id', params.id)
    .maybeSingle();
  if (!target) return NextResponse.json({ error: 'User not found' }, { status: 404 });
  if (target.role === 'admin') {
    return NextResponse.json({ error: 'Cannot ban admins' }, { status: 400 });
  }
  if (target.role === 'mod' && me.role !== 'admin') {
    return NextResponse.json({ error: 'Only admins can ban mods' }, { status: 400 });
  }

  // Insert ban row + flip is_banned. is_banned requires admin update_self bypass — use admin client.
  const adminClient = createAdminClient();
  const { error: banErr } = await adminClient.from('bans').insert({
    user_id: params.id,
    by_user_id: me.id,
    reason: parsed.data.reason,
    expires_at: parsed.data.expires_at ?? null,
  });
  if (banErr) return NextResponse.json({ error: banErr.message }, { status: 400 });

  const { error: flagErr } = await adminClient
    .from('users')
    .update({ is_banned: true })
    .eq('id', params.id);
  if (flagErr) return NextResponse.json({ error: flagErr.message }, { status: 400 });

  await supabase.from('mod_log').insert({
    actor_id: me.id,
    action: 'ban_user',
    target_type: 'user',
    target_id: params.id,
    metadata: { username: target.username, reason: parsed.data.reason, expires_at: parsed.data.expires_at ?? null },
  });

  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const auth = await authorize(params.id);
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const { me } = auth;

  const supabase = createClient();

  const { data: target } = await supabase
    .from('users')
    .select('id, username, is_banned')
    .eq('id', params.id)
    .maybeSingle();
  if (!target) return NextResponse.json({ error: 'User not found' }, { status: 404 });
  if (!target.is_banned) return NextResponse.json({ ok: true, noop: true });

  const adminClient = createAdminClient();

  // Delete latest ban + flip flag
  await adminClient.from('bans').delete().eq('user_id', params.id);
  const { error } = await adminClient.from('users').update({ is_banned: false }).eq('id', params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  await supabase.from('mod_log').insert({
    actor_id: me.id,
    action: 'unban_user',
    target_type: 'user',
    target_id: params.id,
    metadata: { username: target.username },
  });

  return NextResponse.json({ ok: true });
}
