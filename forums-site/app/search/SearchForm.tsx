'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';

export function SearchForm({ initial }: { initial: string }) {
  const router = useRouter();
  const [q, setQ] = useState(initial);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const trimmed = q.trim();
        if (!trimmed) return;
        router.push(`/search?q=${encodeURIComponent(trimmed)}`);
      }}
      className="flex gap-2"
    >
      <Input
        placeholder="Search threads + posts…"
        aria-label="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        autoFocus
      />
      <Button type="submit">Search</Button>
    </form>
  );
}
