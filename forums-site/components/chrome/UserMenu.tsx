'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/browser';
import { Avatar } from '@/components/user/Avatar';

export function UserMenu({ username, avatarUrl }: { username: string; avatarUrl: string | null }) {
  const router = useRouter();
  async function signOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push('/');
    router.refresh();
  }
  return (
    <div className="flex items-center gap-3">
      <Link href={`/u/${username}`} className="flex items-center gap-2 hover:underline">
        <Avatar userId={username} url={avatarUrl} size={28} />
        <span className="text-sm">{username}</span>
      </Link>
      <Link href="/settings" className="text-xs text-[var(--fg-muted)] hover:text-[var(--fg)]">
        Settings
      </Link>
      <button
        type="button"
        onClick={signOut}
        className="text-xs text-[var(--fg-muted)] hover:text-[var(--fg)]"
      >
        Sign out
      </button>
    </div>
  );
}
