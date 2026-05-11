'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { Textarea } from '@/components/ui/Textarea';
import { Input } from '@/components/ui/Input';
import { FormError } from '@/components/ui/FormError';

interface SubmitResult {
  error?: string;
  redirectTo?: string;
}

interface BaseProps {
  initialBody?: string;
  initialTitle?: string;
  showTitle?: boolean;
  submitLabel?: string;
  onSubmit: (data: { title?: string; body: string }) => Promise<SubmitResult>;
}

export function Composer({
  initialBody = '',
  initialTitle = '',
  showTitle = false,
  submitLabel = 'Post reply',
  onSubmit,
}: BaseProps) {
  const router = useRouter();
  const [title, setTitle] = useState(initialTitle);
  const [body, setBody] = useState(initialBody);
  const [tab, setTab] = useState<'write' | 'preview'>('write');
  const [previewHtml, setPreviewHtml] = useState('');
  const [previewLoading, setPreviewLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function loadPreview() {
    setTab('preview');
    setPreviewLoading(true);
    try {
      const res = await fetch('/api/preview', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ md: body }),
      });
      const json = (await res.json()) as { html?: string; error?: string };
      setPreviewHtml(json.html ?? '');
    } catch {
      setPreviewHtml('<p class="text-[var(--danger)]">Preview failed.</p>');
    } finally {
      setPreviewLoading(false);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    const res = await onSubmit({ title: showTitle ? title : undefined, body });
    setBusy(false);
    if (res.error) {
      setErr(res.error);
    } else if (res.redirectTo) {
      router.push(res.redirectTo);
    }
  }

  return (
    <form
      onSubmit={submit}
      className="space-y-3 rounded border border-[var(--border)] bg-[var(--bg-elev-1)] p-4"
    >
      {showTitle && (
        <Input
          placeholder="Thread title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
          minLength={3}
          maxLength={200}
        />
      )}

      <div className="flex gap-1 text-xs">
        <button
          type="button"
          onClick={() => setTab('write')}
          className={`px-2 py-1 rounded ${tab === 'write' ? 'bg-[var(--bg-elev-2)]' : 'text-[var(--fg-muted)] hover:text-[var(--fg)]'}`}
        >
          Write
        </button>
        <button
          type="button"
          onClick={loadPreview}
          className={`px-2 py-1 rounded ${tab === 'preview' ? 'bg-[var(--bg-elev-2)]' : 'text-[var(--fg-muted)] hover:text-[var(--fg)]'}`}
        >
          Preview
        </button>
      </div>

      {tab === 'write' ? (
        <Textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Write something… (Markdown supported)"
          rows={8}
          required
          minLength={1}
          maxLength={50000}
        />
      ) : previewLoading ? (
        <div className="border border-[var(--border)] rounded p-3 min-h-[12rem] text-sm text-[var(--fg-muted)]">
          Rendering…
        </div>
      ) : (
        <div
          className="prose prose-invert max-w-none border border-[var(--border)] rounded p-3 min-h-[12rem]"
          dangerouslySetInnerHTML={{ __html: previewHtml }}
        />
      )}

      <FormError message={err} />

      <div className="flex justify-end">
        <Button type="submit" disabled={busy}>
          {busy ? 'Posting…' : submitLabel}
        </Button>
      </div>
    </form>
  );
}
