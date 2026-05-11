'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/browser';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { FormError } from '@/components/ui/FormError';

const ERROR_MESSAGES: Record<string, string> = {
  missing_code: 'Sign-in link is invalid. Try again.',
  auth_failed: 'Could not sign you in. Try again.',
};

export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const supabase = createClient();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const errorSlug = params.get('error');
  const [err, setErr] = useState<string | null>(
    errorSlug ? (ERROR_MESSAGES[errorSlug] ?? 'Something went wrong.') : null
  );
  const [busy, setBusy] = useState(false);

  const rawNext = params.get('next');
  const next = rawNext && rawNext.startsWith('/') && !rawNext.startsWith('//') ? rawNext : '/';

  async function emailLogin(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) setErr(error.message);
    else router.push(next);
  }

  async function discordOAuth() {
    setBusy(true);
    setErr(null);
    const redirectTo = `${location.origin}/auth/callback${rawNext ? `?next=${encodeURIComponent(next)}` : ''}`;
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'discord',
      options: { redirectTo },
    });
    if (error) {
      setBusy(false);
      setErr('Could not start Discord sign-in. Try again.');
    }
    // On success, supabase navigates the browser away; no need to setBusy(false).
  }

  return (
    <main className="max-w-sm mx-auto py-16 space-y-6">
      <h1 className="text-2xl font-semibold">Sign in to Poke Forums</h1>

      <Button variant="secondary" className="w-full" onClick={discordOAuth} disabled={busy}>
        {busy ? 'Redirecting…' : 'Continue with Discord'}
      </Button>

      <div className="text-center text-xs text-[var(--fg-muted)]">or with email</div>

      <form onSubmit={emailLogin} className="space-y-3">
        <Input type="email" placeholder="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <Input type="password" placeholder="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        <FormError message={err} />
        <Button type="submit" className="w-full" disabled={busy}>
          {busy ? 'Signing in…' : 'Sign in'}
        </Button>
      </form>

      <p className="text-sm text-[var(--fg-muted)] text-center">
        New here? <Link href="/signup" className="text-[var(--accent)]">Create an account</Link>
      </p>
    </main>
  );
}
