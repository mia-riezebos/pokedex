import Link from 'next/link';

export function QuoteButton({
  postId,
  threadId,
  disabled,
}: {
  postId: string;
  threadId: string;
  disabled?: boolean;
}) {
  if (disabled) return null;
  return (
    <Link
      href={`/t/${threadId}?quote=${postId}#reply`}
      className="font-mono text-[11px] text-[var(--fg-muted)] hover:text-[var(--fg)]"
      title="Quote this post in a reply"
    >
      [quote]
    </Link>
  );
}
