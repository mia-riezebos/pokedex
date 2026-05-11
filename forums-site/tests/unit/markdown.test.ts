import { describe, it, expect } from 'vitest';
import { renderMarkdown } from '@/lib/markdown';

describe('renderMarkdown', () => {
  it('renders basic markdown', async () => {
    const html = await renderMarkdown('# Hello\n\nworld');
    expect(html).toContain('<h1');
    expect(html).toContain('Hello');
    expect(html).toContain('<p>world</p>');
  });

  it('strips raw script tags', async () => {
    const html = await renderMarkdown('<script>alert(1)</script>hi');
    expect(html).not.toContain('<script');
    expect(html).not.toContain('alert(1)');
  });

  it('strips javascript: links', async () => {
    const html = await renderMarkdown('[click](javascript:alert(1))');
    expect(html).not.toContain('javascript:');
  });

  it('renders code blocks', async () => {
    const html = await renderMarkdown('```js\nconst x = 1;\n```');
    expect(html).toContain('<pre');
    expect(html).toContain('const');
  });

  it('renders blockquotes (used for quote-reply)', async () => {
    const html = await renderMarkdown('> @alice said:\n> hi');
    expect(html).toContain('<blockquote');
  });

  it('renders GFM tables', async () => {
    const html = await renderMarkdown('| a | b |\n|---|---|\n| 1 | 2 |');
    expect(html).toContain('<table');
    expect(html).toContain('<td');
  });

  it('strips img onerror handlers', async () => {
    const html = await renderMarkdown('<img src=x onerror=alert(1)>');
    expect(html).not.toContain('onerror');
  });

  it('preserves text content of stripped elements', async () => {
    const html = await renderMarkdown('hello <script>bad</script> world');
    expect(html).toContain('hello');
    expect(html).toContain('world');
  });
});
