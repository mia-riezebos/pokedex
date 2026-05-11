import Link from 'next/link';
import { Avatar } from './Avatar';
import { RoleBadge } from './RoleBadge';

export function UserChip({
  username,
  role,
  avatarUrl,
  size = 24,
}: {
  username: string;
  role: 'user' | 'mod' | 'admin';
  avatarUrl: string | null;
  size?: number;
}) {
  return (
    <Link href={`/u/${username}`} className="flex items-center gap-1.5 hover:underline">
      <Avatar userId={username} url={avatarUrl} size={size} />
      <span className="text-sm">{username}</span>
      <RoleBadge role={role} />
    </Link>
  );
}
