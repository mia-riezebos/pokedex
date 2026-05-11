'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Textarea } from '@/components/ui/Textarea';
import { FormError } from '@/components/ui/FormError';

const SLUG_RE = /^[a-z0-9][a-z0-9-]*[a-z0-9]$/;

export function CreateSubforumForm({
  categories,
}: {
  categories: { id: number; name: string }[];
}) {
  const router = useRouter();
  const [categoryId, setCategoryId] = useState(categories[0]?.id?.toString() ?? '');
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [description, setDescription] = useState('');
  const [position, setPosition] = useState('0');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    if (!categoryId) {
      setErr('Create a category first.');
      return;
    }
    if (!SLUG_RE.test(slug)) {
      setErr('Slug must be 2+ chars, lowercase letters/numbers/dashes, starting and ending with a letter or number.');
      return;
    }
    setBusy(true);
    try {
      const res = await fetch('/api/admin/subforums', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          category_id: Number(categoryId),
          name,
          slug,
          description: description.trim() || null,
          position: Number(position) || 0,
        }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setErr(json.error ?? `Failed (HTTP ${res.status})`);
        return;
      }
      setName('');
      setSlug('');
      setDescription('');
      setPosition('0');
      router.refresh();
    } catch {
      setErr('Network error — please try again.');
    } finally {
      setBusy(false);
    }
  }

  if (categories.length === 0) {
    return <p className="text-sm text-[var(--fg-muted)]">Create a category before adding subforums.</p>;
  }

  return (
    <form onSubmit={submit} className="space-y-3 max-w-md">
      <select
        value={categoryId}
        onChange={(e) => setCategoryId(e.target.value)}
        className="w-full px-3 py-2 rounded bg-[var(--bg-elev-2)] border border-[var(--border)] text-[var(--fg)] outline-none focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-glow)]"
        required
      >
        {categories.map((c) => (
          <option key={c.id} value={c.id}>{c.name}</option>
        ))}
      </select>
      <Input placeholder="Name (e.g. General)" value={name} onChange={(e) => setName(e.target.value)} required minLength={1} maxLength={50} />
      <Input placeholder="Slug (e.g. general)" value={slug} onChange={(e) => setSlug(e.target.value.toLowerCase())} required />
      <Textarea placeholder="Description (optional)" value={description} onChange={(e) => setDescription(e.target.value)} rows={2} maxLength={500} />
      <Input type="number" placeholder="Position (0)" value={position} onChange={(e) => setPosition(e.target.value)} min={0} />
      <FormError message={err} />
      <Button type="submit" disabled={busy}>{busy ? 'Creating…' : 'Create subforum'}</Button>
    </form>
  );
}
