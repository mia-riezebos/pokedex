import { NextResponse } from 'next/server';
import { z } from 'zod';
import { renderMarkdown } from '@/lib/markdown';
import { getCurrentUser } from '@/lib/auth';
import { limits } from '@/lib/rate-limit';

export const runtime = 'nodejs';

const Body = z.object({ md: z.string().max(50000) });

export async function POST(req: Request) {
  const me = await getCurrentUser();
  if (!me) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }
  if (me.is_banned) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const rl = await limits.preview(me.id);
  if (!rl.success) {
    return NextResponse.json({ error: 'Rate limited.' }, { status: 429 });
  }

  let parsed;
  try {
    parsed = Body.safeParse(await req.json());
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid input' }, { status: 400 });
  }

  const html = await renderMarkdown(parsed.data.md);
  return NextResponse.json({ html });
}
