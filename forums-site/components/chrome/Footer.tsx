import Link from 'next/link';
import { Container } from './Container';
import { VERSION } from '@/lib/version';

export function Footer() {
  return (
    <footer className="border-t border-[var(--border)] mt-16 py-8">
      <Container>
        <div className="flex flex-col items-center gap-2 text-xs text-[var(--fg-muted)]">
          <p>Unofficial fan-run forums. Not affiliated with Interaction Co. or Poke.</p>
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
