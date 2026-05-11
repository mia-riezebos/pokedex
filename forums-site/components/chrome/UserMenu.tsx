'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/browser';

export function UserMenu({ username }: { username: string }) {
  const router = useRouter();
  async function signOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push('/');
    router.refresh();
  }
  return (
    <div className="flex items-center gap-3">
      <Link href={`/u/${username}`} className="text-sm hover:underline">
        {username}
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
