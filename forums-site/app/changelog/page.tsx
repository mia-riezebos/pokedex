import { readFileSync } from 'node:fs';
import path from 'node:path';
import { Container } from '@/components/chrome/Container';
import { Markdown } from '@/components/ui/Markdown';

export const dynamic = 'force-static';
export const revalidate = 60;

export default function ChangelogPage() {
  const filePath = path.join(process.cwd(), 'CHANGELOG.md');
  const source = readFileSync(filePath, 'utf8');
  return (
    <Container>
      <div className="py-8">
        <Markdown source={source} />
      </div>
    </Container>
  );
}
