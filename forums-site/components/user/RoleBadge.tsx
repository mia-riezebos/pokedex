const styles = {
  user: '',
  mod: 'text-[var(--accent)]',
  admin: 'text-[var(--warn)]',
} as const;

export function RoleBadge({ role }: { role: 'user' | 'mod' | 'admin' }) {
  if (role === 'user') return null;
  return <span className={`font-mono text-[10px] uppercase ${styles[role]}`}>[{role}]</span>;
}
