import { redirect, notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getCurrentUser } from '@/lib/auth';
import { Container } from '@/components/chrome/Container';
import { NewThreadForm } from './form';

export const dynamic = 'force-dynamic';

export default async function NewThreadPage({ params }: { params: { subforum: string } }) {
  const me = await getCurrentUser();
  if (!me) redirect(`/login?next=/f/${params.subforum}/new`);

  const supabase = createClient();
  const { data: subforum } = await supabase
    .from('subforums')
    .select('id, name, slug, is_locked')
    .eq('slug', params.subforum)
    .maybeSingle();
  if (!subforum) notFound();
  if (subforum.is_locked) redirect(`/f/${params.subforum}`);

  return (
    <Container>
      <div className="py-6 space-y-4">
        <h1 className="text-xl font-semibold">New thread in {subforum.name}</h1>
        <NewThreadForm subforumId={subforum.id} />
      </div>
    </Container>
  );
}
