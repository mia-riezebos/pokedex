import { redirect } from 'next/navigation';
import { getCurrentUser, isTemporaryUsername } from '@/lib/auth';
import { OnboardingForm } from './form';

export const dynamic = 'force-dynamic';

export default async function OnboardingPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  if (!isTemporaryUsername(user.username)) redirect('/');

  return (
    <main className="max-w-sm mx-auto py-16 space-y-4">
      <h1 className="text-2xl font-semibold">Pick a username</h1>
      <p className="text-sm text-[var(--fg-muted)]">
        3–20 characters, lowercase letters, numbers, and underscores. This is permanent for v1.
      </p>
      <OnboardingForm />
    </main>
  );
}
