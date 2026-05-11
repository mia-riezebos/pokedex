import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/types';

const url = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321';
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export const admin = createClient<Database>(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

export async function makeUser(username: string) {
  const { data, error } = await admin.auth.admin.createUser({
    email: `${username}@test.local`,
    password: 'test-password-123',
    email_confirm: true,
  });
  if (error) throw error;
  await admin.from('users').update({ username }).eq('id', data.user!.id);
  return data.user!.id;
}

export async function reset() {
  await admin.from('posts').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  await admin.from('threads').delete().neq('id', '00000000-0000-0000-0000-000000000000');
}
