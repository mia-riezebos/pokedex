import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default async function BannedPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: ban } = await supabase
    .from('bans')
    .select('reason, expires_at, created_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  return (
    <main className="max-w-md mx-auto py-16 space-y-4">
      <h1 className="text-2xl font-semibold text-[var(--danger)]">You&apos;ve been banned</h1>
      <p><strong>Reason:</strong> {ban?.reason ?? 'No reason recorded.'}</p>
      <p><strong>Expires:</strong> {ban?.expires_at ?? 'permanent'}</p>
      <p className="text-sm text-[var(--fg-muted)]">
        To appeal, email <a className="underline" href="mailto:appeals@poke-forums.example">appeals@poke-forums.example</a>.
      </p>
    </main>
  );
}
