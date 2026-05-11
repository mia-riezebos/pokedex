import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { Container } from '@/components/chrome/Container';

export const dynamic = 'force-dynamic';

interface Subforum {
  id: number;
  name: string;
  slug: string;
  description: string | null;
  position: number;
}

interface CategoryWithSubforums {
  id: number;
  name: string;
  slug: string;
  subforums: Subforum[];
}

export default async function HomePage() {
  const supabase = createClient();

  const { data: categories } = await supabase
    .from('categories')
    .select('id, name, slug, subforums:subforums(id, name, slug, description, position)')
    .order('position');

  return (
    <Container>
      <div className="py-8 space-y-8">
        <div>
          <h1 className="text-2xl font-semibold">Poke Forums</h1>
          <div className="title-rule mt-2" />
        </div>

        {((categories ?? []) as CategoryWithSubforums[]).map((cat) => (
          <section key={cat.id}>
            <h2 className="text-xs font-mono uppercase text-[var(--fg-muted)] mb-2">{cat.name}</h2>
            <ul className="rounded border border-[var(--border)] divide-y divide-[var(--border)]">
              {cat.subforums
                .slice()
                .sort((a, b) => a.position - b.position)
                .map((sf) => (
                  <li key={sf.id} className="p-4 hover:bg-[var(--bg-elev-1)] transition">
                    <Link href={`/f/${sf.slug}`} className="font-medium text-[var(--fg)]">
                      {sf.name}
                    </Link>
                    {sf.description && (
                      <p className="text-sm text-[var(--fg-muted)] mt-1">{sf.description}</p>
                    )}
                  </li>
                ))}
              {cat.subforums.length === 0 && (
                <li className="p-4 text-sm text-[var(--fg-muted)]">No subforums yet.</li>
              )}
            </ul>
          </section>
        ))}

        {(!categories || categories.length === 0) && (
          <p className="text-sm text-[var(--fg-muted)]">No categories yet.</p>
        )}
      </div>
    </Container>
  );
}
