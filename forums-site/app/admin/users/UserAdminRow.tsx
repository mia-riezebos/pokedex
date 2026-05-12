'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/Button';

interface UserAdminRowProps {
  user: {
    id: string;
    username: string;
    display_name: string | null;
    role: 'user' | 'mod' | 'admin';
    is_banned: boolean;
    post_count: number;
    created_at: string;
  };
  viewerId: string;
}

export function UserAdminRow({ user: u, viewerId }: UserAdminRowProps) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const isSelf = u.id === viewerId;

  async function setRole(role: 'user' | 'mod') {
    if (isSelf) return;
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(`/api/admin/users/${u.id}/role`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ role }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) setErr(json.error ?? `Failed (HTTP ${res.status})`);
      else router.refresh();
    } catch {
      setErr('Network error');
    } finally {
      setBusy(false);
    }
  }

  async function toggleBan() {
    if (isSelf) return;
    const reason = u.is_banned ? '' : prompt('Ban reason?', 'Violated community rules');
    if (!u.is_banned && !reason) return; // user cancelled
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(`/api/admin/users/${u.id}/ban`, {
        method: u.is_banned ? 'DELETE' : 'POST',
        headers: { 'content-type': 'application/json' },
        body: u.is_banned ? undefined : JSON.stringify({ reason }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) setErr(json.error ?? `Failed (HTTP ${res.status})`);
      else router.refresh();
    } catch {
      setErr('Network error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className="p-3 flex items-center justify-between gap-4">
      <div className="min-w-0">
        <Link href={`/u/${u.username}`} className="font-medium hover:underline">{u.username}</Link>
        {u.display_name && <span className="text-xs text-[var(--fg-muted)] ml-2">{u.display_name}</span>}
        <div className="text-xs font-mono text-[var(--fg-muted)] mt-1">
          {u.role}{u.is_banned && <span className="text-[var(--danger)]"> · banned</span>} · {u.post_count} posts
        </div>
        {err && <p className="text-xs text-[var(--danger)] mt-1">{err}</p>}
      </div>
      <div className="flex flex-wrap gap-2 shrink-0">
        {u.role !== 'admin' && !isSelf && (
          u.role === 'mod'
            ? <Button type="button" variant="secondary" disabled={busy} onClick={() => setRole('user')}>Demote</Button>
            : <Button type="button" variant="secondary" disabled={busy} onClick={() => setRole('mod')}>Promote to mod</Button>
        )}
        {!isSelf && u.role !== 'admin' && (
          <Button
            type="button"
            variant={u.is_banned ? 'secondary' : 'danger'}
            disabled={busy}
            onClick={toggleBan}
          >
            {u.is_banned ? 'Unban' : 'Ban'}
          </Button>
        )}
      </div>
    </li>
  );
}
