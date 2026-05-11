import { NextResponse } from 'next/server';
import { z } from 'zod';
import { renderMarkdown } from '@/lib/markdown';

export const runtime = 'nodejs';

const Body = z.object({ md: z.string().max(50_000) });

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
  const html = await renderMarkdown(parsed.data.md);
  return NextResponse.json({ html });
}
