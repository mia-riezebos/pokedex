'use client';

import { useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/browser';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { FormError } from '@/components/ui/FormError';

export default function SignupPage() {
  const supabase = createClient();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    const { error } = await supabase.auth.signUp({
      email, password,
      options: { emailRedirectTo: `${location.origin}/auth/callback?next=/onboarding` },
    });
    setBusy(false);
    if (error) setErr(error.message);
    else setDone(true);
  }

  if (done) {
    return (
      <main className="max-w-sm mx-auto py-16">
        <h1 className="text-2xl font-semibold mb-4">Check your email</h1>
        <p className="text-[var(--fg-muted)]">We sent a verification link to {email}. Click it to finish signing up.</p>
      </main>
    );
  }

  return (
    <main className="max-w-sm mx-auto py-16 space-y-6">
      <h1 className="text-2xl font-semibold">Create your account</h1>

      <form onSubmit={submit} className="space-y-3">
        <Input type="email" placeholder="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <Input
          type="password"
          placeholder="password (min 8)"
          minLength={8}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        <FormError message={err} />
        <Button type="submit" className="w-full" disabled={busy}>
          {busy ? 'Creating…' : 'Create account'}
        </Button>
      </form>

      <p className="text-sm text-[var(--fg-muted)] text-center">
        Have one? <Link href="/login" className="text-[var(--accent)]">Sign in</Link>
      </p>

      <p className="text-xs text-[var(--fg-subtle)] text-center">
        Or use <Link href="/login" className="underline">Discord OAuth</Link> from the sign-in page.
      </p>
    </main>
  );
}
