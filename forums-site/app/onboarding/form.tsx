'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/browser';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { FormError } from '@/components/ui/FormError';

const VALID = /^[a-z0-9_]{3,20}$/;

export function OnboardingForm() {
  const router = useRouter();
  const supabase = createClient();
  const [username, setUsername] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    if (!VALID.test(username)) {
      setErr('Use 3–20 lowercase letters, numbers, or underscores.');
      return;
    }
    if (/^user_[0-9a-f]{12}$/.test(username)) {
      setErr('That username pattern is reserved. Pick something else.');
      return;
    }
    setBusy(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setBusy(false);
      setErr('Session expired. Please sign in again.');
      return;
    }
    const { error } = await supabase.from('users').update({ username }).eq('id', user.id);
    setBusy(false);
    if (error) {
      // 23505 = unique_violation in PG. Supabase passes the code through.
      if (error.code === '23505' || error.message.toLowerCase().includes('duplicate')) {
        setErr('That username is taken.');
      } else {
        setErr(error.message);
      }
    } else {
      router.push('/');
      router.refresh();
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <Input
        value={username}
        onChange={(e) => setUsername(e.target.value.toLowerCase())}
        placeholder="username"
        autoFocus
        minLength={3}
        maxLength={20}
      />
      <FormError message={err} />
      <Button type="submit" className="w-full" disabled={busy}>
        {busy ? 'Saving…' : 'Continue'}
      </Button>
    </form>
  );
}
