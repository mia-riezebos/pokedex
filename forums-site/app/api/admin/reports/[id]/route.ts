import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { getCurrentUser } from '@/lib/auth';

export const runtime = 'nodejs';

const Patch = z.object({
  action: z.enum(['resolve', 'dismiss', 'hide']),
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
  if (me.is_banned) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  if (me.role !== 'mod' && me.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const supabase = createClient();

  // Fetch the report (need post_id for "hide" action)
  const { data: report } = await supabase
    .from('reports')
    .select('id, status, post_id')
    .eq('id', params.id)
    .maybeSingle();
  if (!report) return NextResponse.json({ error: 'Report not found' }, { status: 404 });
  if (report.status !== 'open') {
    return NextResponse.json({ error: 'Report already handled' }, { status: 400 });
  }

  if (parsed.data.action === 'hide') {
    // Mark the underlying post hidden
    const { error: postErr } = await supabase
      .from('posts')
      .update({ is_hidden: true })
      .eq('id', report.post_id);
    if (postErr) return NextResponse.json({ error: postErr.message }, { status: 400 });

    const { error: hideLogErr } = await supabase.from('mod_log').insert({
      actor_id: me.id,
      action: 'hide_post',
      target_type: 'post',
      target_id: report.post_id,
      metadata: { via_report: report.id },
    });
    if (hideLogErr) {
      console.error('[reports] hide_post mod_log insert failed:', hideLogErr.message);
    }
  }

  // Set status: hide and resolve both move to 'resolved', dismiss to 'dismissed'
  const status = parsed.data.action === 'dismiss' ? 'dismissed' : 'resolved';
  const { error: updateErr } = await supabase
    .from('reports')
    .update({ status, handled_by: me.id, handled_at: new Date().toISOString() })
    .eq('id', params.id);
  if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 400 });

  const { error: resolveLogErr } = await supabase.from('mod_log').insert({
    actor_id: me.id,
    action: parsed.data.action === 'dismiss' ? 'dismiss_report' : 'resolve_report',
    target_type: 'report',
    target_id: report.id,
    metadata: { post_id: report.post_id },
  });
  if (resolveLogErr) {
    console.error('[reports] resolve mod_log insert failed:', resolveLogErr.message);
  }

  return NextResponse.json({ ok: true });
}
