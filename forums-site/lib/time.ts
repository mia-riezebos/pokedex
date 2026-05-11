export function relativeTime(when: Date | string, now: Date = new Date()): string {
  const w = typeof when === 'string' ? new Date(when) : when;
  const diffSec = Math.max(0, Math.floor((now.getTime() - w.getTime()) / 1000));
  if (diffSec < 60) return 'just now';
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
  if (diffSec < 86400 * 30) return `${Math.floor(diffSec / 86400)}d ago`;
  return w.toISOString().slice(0, 10);
}
