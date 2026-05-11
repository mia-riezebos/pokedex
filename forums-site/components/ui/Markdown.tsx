import { renderMarkdown } from '@/lib/markdown';

export async function Markdown({ source }: { source: string }) {
  const html = await renderMarkdown(source);
  return (
    <div
      className="prose prose-invert max-w-none"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
