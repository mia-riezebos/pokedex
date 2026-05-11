import { Container } from './Container';

export function Footer() {
  return (
    <footer className="border-t border-[var(--border)] mt-16 py-8">
      <Container>
        <p className="text-xs text-[var(--fg-muted)] text-center">
          Unofficial fan-run forums. Not affiliated with Interaction Co. or Poke.
        </p>
      </Container>
    </footer>
  );
}
