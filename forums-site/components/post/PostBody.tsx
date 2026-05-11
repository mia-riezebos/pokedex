export function PostBody({ md }: { md: string }) {
  // Phase 6 replaces this with a sanitized Markdown renderer.
  // For now we render plain text in a <pre> so nothing executes.
  return <pre className="whitespace-pre-wrap font-sans">{md}</pre>;
}
