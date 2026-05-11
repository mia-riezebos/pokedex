'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { FormError } from '@/components/ui/FormError';

const SLUG_RE = /^[a-z0-9][a-z0-9-]*[a-z0-9]$/;

export function CreateCategoryForm() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [position, setPosition] = useState('0');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    if (!SLUG_RE.test(slug)) {
      setErr('Slug must be lowercase letters/numbers/dashes (e.g. general-discussion).');
      return;
    }
    setBusy(true);
    try {
      const res = await fetch('/api/admin/categories', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name, slug, position: Number(position) || 0 }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) {
        setErr(json.error ?? 'Failed');
        return;
      }
      setName('');
      setSlug('');
      setPosition('0');
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3 max-w-md">
      <Input placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} required minLength={1} maxLength={50} />
      <Input placeholder="Slug (e.g. general-discussion)" value={slug} onChange={(e) => setSlug(e.target.value.toLowerCase())} required />
      <Input type="number" placeholder="Position (0)" value={position} onChange={(e) => setPosition(e.target.value)} min={0} />
      <FormError message={err} />
      <Button type="submit" disabled={busy}>{busy ? 'Creating…' : 'Create category'}</Button>
    </form>
  );
}
