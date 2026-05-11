import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

function safeNext(raw: string | null): string {
  if (!raw) return '/';
  // Only allow relative paths starting with `/` and not `//` (protocol-relative).
  if (raw.startsWith('/') && !raw.startsWith('//')) return raw;
  return '/';
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const next = safeNext(url.searchParams.get('next'));

  if (!code) {
    return NextResponse.redirect(new URL('/login?error=missing_code', url.origin));
  }

  const supabase = createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    // Don't leak provider error details to the URL. Log server-side.
    console.error('[auth/callback] exchangeCodeForSession failed:', error.message);
    return NextResponse.redirect(new URL('/login?error=auth_failed', url.origin));
  }

  return NextResponse.redirect(new URL(next, url.origin));
}
