'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';

export function UserSearch({ initial }: { initial: string }) {
  const router = useRouter();
  const [q, setQ] = useState(initial);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const trimmed = q.trim();
        router.push(trimmed ? `/admin/users?q=${encodeURIComponent(trimmed)}` : '/admin/users');
      }}
      className="flex gap-2 max-w-md"
    >
      <Input placeholder="Search by username" value={q} onChange={(e) => setQ(e.target.value)} />
      <Button type="submit">Search</Button>
    </form>
  );
}
