import 'server-only';
import { createClient } from '@/lib/supabase/server';

export async function getCurrentUser() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase
    .from('users')
    .select('id, username, role, is_banned, is_probationary, avatar_url, display_name')
    .eq('id', user.id)
    .single();
  return profile ? { ...profile, email: user.email } : null;
}

export function isTemporaryUsername(username: string): boolean {
  // Matches trigger-generated names: user_<12 hex chars>
  return /^user_[0-9a-f]{12}$/.test(username);
}
