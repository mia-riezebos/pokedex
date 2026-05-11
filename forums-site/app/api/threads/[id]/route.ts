import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { getCurrentUser } from '@/lib/auth';

export const runtime = 'nodejs';

const Patch = z
  .object({
    is_pinned: z.boolean().optional(),
    is_locked: z.boolean().optional(),
  })
  .refine((d) => d.is_pinned !== undefined || d.is_locked !== undefined, {
    message: 'Provide is_pinned and/or is_locked',
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

  const me = await getCurrentUser();
  if (!me) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }
  if (me.role !== 'mod' && me.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  if (me.is_banned) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const supabase = createClient();

  // Fetch existing state so we can log the change accurately
  const { data: existing } = await supabase
    .from('threads')
    .select('id, is_pinned, is_locked, is_deleted')
    .eq('id', params.id)
    .maybeSingle();
  if (!existing) {
    return NextResponse.json({ error: 'Thread not found' }, { status: 404 });
  }
  if (existing.is_deleted) {
    return NextResponse.json({ error: 'Thread is deleted' }, { status: 400 });
  }

  const updates: { is_pinned?: boolean; is_locked?: boolean } = {};
  if (parsed.data.is_pinned !== undefined && parsed.data.is_pinned !== existing.is_pinned) {
    updates.is_pinned = parsed.data.is_pinned;
  }
  if (parsed.data.is_locked !== undefined && parsed.data.is_locked !== existing.is_locked) {
    updates.is_locked = parsed.data.is_locked;
  }
  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ ok: true, noop: true });
  }

  const { error: updateErr } = await supabase
    .from('threads')
    .update(updates)
    .eq('id', params.id);
  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 400 });
  }

  // Write a mod_log entry for each toggled field
  const logRows = Object.entries(updates).map(([key, newValue]) => ({
    actor_id: me.id,
    action: key === 'is_pinned' ? (newValue ? 'pin_thread' : 'unpin_thread') : (newValue ? 'lock_thread' : 'unlock_thread'),
    target_type: 'thread',
    target_id: params.id,
    metadata: {
      from: key === 'is_pinned' ? existing.is_pinned : existing.is_locked,
      to: newValue,
    },
  }));

  // Best-effort mod_log write — log on failure but don't fail the action
  const { error: logErr } = await supabase.from('mod_log').insert(logRows);
  if (logErr) {
    console.error('[threads PATCH] mod_log insert failed:', logErr.message);
  }

  return NextResponse.json({ ok: true, updates });
}
