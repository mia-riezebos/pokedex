import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { Container } from '@/components/chrome/Container';
import { UserAdminRow } from './UserAdminRow';
import { UserSearch } from './UserSearch';

export const dynamic = 'force-dynamic';

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: { q?: string };
}) {
  const me = await getCurrentUser();
  if (!me) redirect('/login?next=/admin/users');
  if (me.role !== 'admin') redirect('/');

  const q = (searchParams.q ?? '').trim().toLowerCase();

  const supabase = createClient();
  let query = supabase
    .from('users')
    .select('id, username, display_name, role, is_banned, post_count, created_at')
    .order('created_at', { ascending: false })
    .limit(50);

  if (q) {
    // citext column — ilike works case-insensitive natively
    query = query.ilike('username', `%${q}%`);
  }

  const { data } = await query;
  const users = data ?? [];

  return (
    <Container>
      <div className="py-8 space-y-6">
        <div>
          <h1 className="text-2xl font-semibold">Users</h1>
          <div className="title-rule mt-2" />
        </div>
        <UserSearch initial={q} />
        <ul className="rounded border border-[var(--border)] divide-y divide-[var(--border)]">
          {users.length === 0 && (
            <li className="p-4 text-sm text-[var(--fg-muted)]">No matches.</li>
          )}
          {users.map((u) => (
            <UserAdminRow key={u.id} user={u} viewerId={me.id} />
          ))}
        </ul>
      </div>
    </Container>
  );
}
