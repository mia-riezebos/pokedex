'use client';

import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/browser';
import { Button } from '@/components/ui/Button';

const MAX_BYTES = 2 * 1024 * 1024;
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

export function AvatarUploader({ currentUrl }: { currentUrl: string | null }) {
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function upload(file: File) {
    setErr(null);
    if (!ALLOWED_TYPES.includes(file.type)) {
      setErr('Only JPEG, PNG, WebP, or GIF.');
      return;
    }
    if (file.size > MAX_BYTES) {
      setErr('Max 2 MB.');
      return;
    }
    setBusy(true);
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setErr('Session expired.');
        return;
      }
      const ext = file.name.split('.').pop()?.toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
      const path = `${user.id}/avatar-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from('avatars')
        .upload(path, file, { upsert: false, cacheControl: '3600', contentType: file.type });
      if (upErr) {
        setErr(upErr.message);
        return;
      }
      const { data: pub } = supabase.storage.from('avatars').getPublicUrl(path);
      const { error: patchErr } = await supabase
        .from('users')
        .update({ avatar_url: pub.publicUrl })
        .eq('id', user.id);
      if (patchErr) {
        setErr(patchErr.message);
        return;
      }
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function removeAvatar() {
    setBusy(true);
    setErr(null);
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { error } = await supabase.from('users').update({ avatar_url: null }).eq('id', user.id);
      if (error) setErr(error.message);
      else router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <input
        ref={fileInput}
        type="file"
        accept={ALLOWED_TYPES.join(',')}
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) upload(f);
          e.target.value = '';
        }}
      />
      <div className="flex gap-2">
        <Button
          type="button"
          variant="secondary"
          disabled={busy}
          onClick={() => fileInput.current?.click()}
        >
          {busy ? 'Uploading…' : currentUrl ? 'Change avatar' : 'Upload avatar'}
        </Button>
        {currentUrl && (
          <Button type="button" variant="ghost" onClick={removeAvatar} disabled={busy}>
            Remove
          </Button>
        )}
      </div>
      {err && <span className="text-xs text-[var(--danger)]">{err}</span>}
      <span className="text-xs text-[var(--fg-muted)]">JPEG, PNG, WebP, or GIF. Max 2 MB.</span>
    </div>
  );
}
