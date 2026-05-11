import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

const PUBLIC_PATH_PREFIXES = [
  '/login',
  '/signup',
  '/banned',
  '/auth/callback',
  '/api',
  '/_next',
  '/favicon.ico',
];

const ONBOARDING_BYPASS_PREFIXES = [
  '/onboarding',
  '/api',
  '/auth/callback',
  '/_next',
  '/favicon.ico',
];

function startsWithAny(path: string, prefixes: string[]): boolean {
  return prefixes.some((p) => path === p || path.startsWith(p + '/') || path.startsWith(p));
}

export async function middleware(req: NextRequest) {
  let res = NextResponse.next({ request: { headers: req.headers } });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => req.cookies.getAll(),
        setAll: (cookies) => {
          res = NextResponse.next({ request: { headers: req.headers } });
          cookies.forEach(({ name, value, options }) => res.cookies.set({ name, value, ...options }));
        },
      },
    },
  );

  const { data: { user } } = await supabase.auth.getUser();
  const path = req.nextUrl.pathname;

  if (!user) return res; // anonymous browsing allowed

  const { data: profile } = await supabase
    .from('users')
    .select('username, is_banned')
    .eq('id', user.id)
    .maybeSingle();

  if (!profile) return res;

  // Banned: redirect to /banned for any non-public path
  if (profile.is_banned && path !== '/banned' && !startsWithAny(path, PUBLIC_PATH_PREFIXES)) {
    return NextResponse.redirect(new URL('/banned', req.url));
  }

  // Onboarding gate: temp username → force /onboarding
  const isTemp = /^user_[0-9a-f]{12}$/.test(profile.username);
  if (isTemp && !startsWithAny(path, ONBOARDING_BYPASS_PREFIXES)) {
    return NextResponse.redirect(new URL('/onboarding', req.url));
  }

  return res;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
