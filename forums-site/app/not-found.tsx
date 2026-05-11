import Link from 'next/link';
import { Container } from '@/components/chrome/Container';

export default function NotFound() {
  return (
    <Container>
      <div className="py-24 text-center space-y-4">
        <p className="font-mono text-xs text-[var(--fg-muted)]">404</p>
        <h1 className="text-2xl font-semibold">Not found</h1>
        <Link href="/" className="text-[var(--accent)]">
          Back home
        </Link>
      </div>
    </Container>
  );
}
