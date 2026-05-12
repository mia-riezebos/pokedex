import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getCurrentUser } from '@/lib/auth';
import { Container } from '@/components/chrome/Container';
import { CreateCategoryForm } from './CreateCategoryForm';
import { CreateSubforumForm } from './CreateSubforumForm';
import { SubforumLockToggle } from './SubforumLockToggle';

export const dynamic = 'force-dynamic';

interface SubforumRow {
  id: number;
  name: string;
  slug: string;
  description: string | null;
  position: number;
  is_locked: boolean;
}

interface CategoryRow {
  id: number;
  name: string;
  slug: string;
  position: number;
  subforums: SubforumRow[];
}

export default async function AdminPage() {
  const me = await getCurrentUser();
  if (!me) redirect('/login?next=/admin');
  if (me.role !== 'admin') redirect('/');

  const supabase = createClient();
  const { data: categories } = await supabase
    .from('categories')
    .select(
      'id, name, slug, position, subforums:subforums(id, name, slug, description, position, is_locked)',
    )
    .order('position');

  const rows = (categories ?? []) as CategoryRow[];

  return (
    <Container>
      <div className="py-8 space-y-10">
        <div>
          <h1 className="text-2xl font-semibold">Admin</h1>
          <div className="title-rule mt-2" />
          <div className="flex gap-3 text-sm mt-2">
            <Link href="/admin" className="text-[var(--accent)]">Structure</Link>
            <Link href="/admin/users" className="text-[var(--fg-muted)] hover:text-[var(--fg)]">Users</Link>
            <Link href="/admin/reports" className="text-[var(--fg-muted)] hover:text-[var(--fg)]">Reports</Link>
          </div>
          <p className="text-sm text-[var(--fg-muted)] mt-2">
            Manage categories and subforums. Renames, deletes, and reordering will come in a later release.
          </p>
        </div>

        <section className="space-y-4">
          <h2 className="text-lg font-semibold">Create category</h2>
          <CreateCategoryForm />
        </section>

        <section className="space-y-4">
          <h2 className="text-lg font-semibold">Create subforum</h2>
          <CreateSubforumForm
            categories={rows.map((c) => ({ id: c.id, name: c.name }))}
          />
        </section>

        <section className="space-y-4">
          <h2 className="text-lg font-semibold">Existing structure</h2>
          {rows.length === 0 ? (
            <p className="text-sm text-[var(--fg-muted)]">No categories yet.</p>
          ) : (
            <ul className="space-y-6">
              {rows.map((cat) => (
                <li key={cat.id}>
                  <div className="font-mono text-xs text-[var(--fg-muted)] uppercase">
                    {cat.name} <span className="text-[var(--fg-subtle)]">/ {cat.slug}</span>
                  </div>
                  <ul className="mt-2 rounded border border-[var(--border)] divide-y divide-[var(--border)]">
                    {cat.subforums
                      .slice()
                      .sort((a, b) => a.position - b.position)
                      .map((sf) => (
                        <li key={sf.id} className="p-3 flex items-center justify-between gap-4">
                          <div className="min-w-0">
                            <div className="font-medium">
                              {sf.name}{' '}
                              <span className="font-mono text-xs text-[var(--fg-muted)]">/ {sf.slug}</span>
                              {sf.is_locked && (
                                <span className="ml-2 font-mono text-[10px] uppercase text-[var(--warn)]">
                                  [locked]
                                </span>
                              )}
                            </div>
                            {sf.description && (
                              <p className="text-xs text-[var(--fg-muted)] mt-1">{sf.description}</p>
                            )}
                          </div>
                          <SubforumLockToggle id={sf.id} isLocked={sf.is_locked} />
                        </li>
                      ))}
                    {cat.subforums.length === 0 && (
                      <li className="p-3 text-sm text-[var(--fg-muted)]">No subforums in this category.</li>
                    )}
                  </ul>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </Container>
  );
}
