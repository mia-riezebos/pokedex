import Link from 'next/link';
import { getCurrentUser } from '@/lib/auth';
import { Container } from './Container';
import { UserMenu } from './UserMenu';
import { NotificationsBell } from './NotificationsBell';

export async function Header() {
  const user = await getCurrentUser();
  return (
    <header className="border-b border-[var(--border)] bg-[var(--bg-elev-1)]">
      <Container>
        <div className="flex items-center justify-between h-14 gap-4">
          <Link href="/" className="font-semibold text-[var(--fg)]">
            Poke Forums <span className="font-mono text-xs text-[var(--fg-muted)]">{'// unofficial'}</span>
          </Link>
          <Link href="/search" className="text-sm text-[var(--fg-muted)] hover:text-[var(--fg)]">
            Search
          </Link>
          <div className="flex items-center gap-3 ml-auto">
            {user ? (
              <div className="flex items-center gap-3">
                {user.role === 'admin' && (
                  <Link href="/admin" className="text-xs font-mono text-[var(--warn)] hover:text-[var(--fg)]">
                    [admin]
                  </Link>
                )}
                <Link href="/new" className="text-sm text-[var(--fg-muted)] hover:text-[var(--fg)]">
                  New
                </Link>
                <NotificationsBell />
                <UserMenu username={user.username} avatarUrl={user.avatar_url} />
              </div>
            ) : (
              <>
                <Link href="/login" className="text-sm text-[var(--fg-muted)] hover:text-[var(--fg)]">
                  Sign in
                </Link>
                <Link
                  href="/signup"
                  className="text-sm px-3 py-1.5 rounded bg-[var(--accent)] text-white"
                >
                  Sign up
                </Link>
              </>
            )}
          </div>
        </div>
      </Container>
    </header>
  );
}
