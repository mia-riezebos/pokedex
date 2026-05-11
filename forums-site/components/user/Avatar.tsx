import Image from 'next/image';
import { Identicon } from './Identicon';

export function Avatar({
  userId,
  url,
  size = 64,
}: {
  userId: string;
  url: string | null;
  size?: number;
}) {
  if (url) {
    return (
      <Image
        src={url}
        alt=""
        width={size}
        height={size}
        className="rounded object-cover"
      />
    );
  }
  return <Identicon seed={userId} size={size} />;
}
