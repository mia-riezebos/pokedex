import 'server-only';
import { unstable_cache } from 'next/cache';
import { createClient } from '@/lib/supabase/server';

async function fetchOnlineUsersCount(): Promise<number> {
  const supabase = createClient();
  const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
  const { count } = await supabase
    .from('users')
    .select('id', { count: 'exact', head: true })
    .gte('last_seen_at', fiveMinAgo)
    .eq('is_banned', false);
  return count ?? 0;
}

// Cache for 30s. Tag allows future invalidation if needed.
export const getOnlineUsersCount = unstable_cache(
  fetchOnlineUsersCount,
  ['online-users-count'],
  { revalidate: 30, tags: ['online-users'] },
);
