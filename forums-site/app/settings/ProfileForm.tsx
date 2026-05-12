'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/browser';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Textarea } from '@/components/ui/Textarea';
import { FormError } from '@/components/ui/FormError';

export function ProfileForm({
  initialDisplayName,
  initialBio,
  initialSignature,
}: {
  initialDisplayName: string;
  initialBio: string;
  initialSignature: string;
}) {
  const router = useRouter();
  const supabase = createClient();
  const [displayName, setDisplayName] = useState(initialDisplayName);
  const [bio, setBio] = useState(initialBio);
  const [signature, setSignature] = useState(initialSignature);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setOk(false);
    if (signature.length > 500) {
      setErr('Signature must be 500 characters or fewer.');
      return;
    }
    setBusy(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setErr('Session expired. Please sign in again.');
        return;
      }
      const { error } = await supabase
        .from('users')
        .update({
          display_name: displayName.trim() || null,
          bio: bio.trim() || null,
          signature_md: signature.trim() || null,
        })
        .eq('id', user.id);
      if (error) {
        setErr(error.message);
        return;
      }
      setOk(true);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3 max-w-xl">
      <label className="block">
        <span className="block text-xs text-[var(--fg-muted)] mb-1">Display name (shown next to username on posts)</span>
        <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} maxLength={50} placeholder="(optional)" />
      </label>
      <label className="block">
        <span className="block text-xs text-[var(--fg-muted)] mb-1">Bio (shown on your profile page)</span>
        <Textarea value={bio} onChange={(e) => setBio(e.target.value)} rows={3} maxLength={500} placeholder="(optional)" />
      </label>
      <label className="block">
        <span className="block text-xs text-[var(--fg-muted)] mb-1">Signature (markdown, appended under each of your posts; max 500 chars)</span>
        <Textarea value={signature} onChange={(e) => setSignature(e.target.value)} rows={3} maxLength={500} placeholder="(optional, e.g. ~ pierre)" />
        <span className="block text-[10px] font-mono text-[var(--fg-subtle)] mt-1">{signature.length}/500</span>
      </label>
      <FormError message={err} />
      {ok && <p className="text-sm text-[var(--success)]">Saved.</p>}
      <Button type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save profile'}</Button>
    </form>
  );
}
