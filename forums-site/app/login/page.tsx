import { Suspense } from 'react';
import { LoginForm } from './form';

export const dynamic = 'force-dynamic';

export default function LoginPage() {
  return (
    <Suspense fallback={<main className="max-w-sm mx-auto py-16">Loading…</main>}>
      <LoginForm />
    </Suspense>
  );
}
