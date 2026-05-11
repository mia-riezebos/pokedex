import Link from 'next/link';
import { Container } from './Container';
import { VERSION } from '@/lib/version';
import { getOnlineUsersCount } from '@/lib/online-users';

export async function Footer() {
  const online = await getOnlineUsersCount();
  return (
    <footer className="border-t border-[var(--border)] mt-16 py-8">
      <Container>
        <div className="flex flex-col items-center gap-2 text-xs text-[var(--fg-muted)]">
          <p>Unofficial fan-run forums. Not affiliated with Interaction Co. or Poke.</p>
          <p className="font-mono">
            {online} {online === 1 ? 'user' : 'users'} online (last 5 min)
          </p>
          <p>
            <Link href="/changelog" className="font-mono hover:text-[var(--fg)]">
              {VERSION}
            </Link>
          </p>
        </div>
      </Container>
    </footer>
  );
}
