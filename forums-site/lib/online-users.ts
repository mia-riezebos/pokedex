import 'server-only';
import { unstable_cache } from 'next/cache';
import { createAdminClient } from '@/lib/supabase/admin';

async function fetchOnlineUsersCount(): Promise<number> {
  // Use admin client (service-role, no cookies) since unstable_cache must not
  // depend on per-request state. Counting non-banned users is not sensitive.
  const supabase = createAdminClient();
  const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
  const { count, error } = await supabase
    .from('users')
    .select('id', { count: 'exact', head: true })
    .gte('last_seen_at', fiveMinAgo)
    .eq('is_banned', false);
  if (error) {
    console.error('[online-users] count query failed:', error.message);
    return 0;
  }
  return count ?? 0;
}

export const getOnlineUsersCount = unstable_cache(
  fetchOnlineUsersCount,
  ['online-users-count'],
  { revalidate: 30, tags: ['online-users'] },
);
