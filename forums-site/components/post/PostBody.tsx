import { Markdown } from '@/components/ui/Markdown';

export function PostBody({ md }: { md: string }) {
  return <Markdown source={md} />;
}
