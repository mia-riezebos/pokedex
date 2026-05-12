import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';
import { Container } from '@/components/chrome/Container';
import { ReportRow } from './ReportRow';

export const dynamic = 'force-dynamic';

interface ReportData {
  id: string;
  reason: 'spam' | 'harassment' | 'off_topic' | 'other';
  note: string | null;
  status: 'open' | 'resolved' | 'dismissed';
  created_at: string;
  post: {
    id: string;
    post_number: number;
    body_md: string;
    thread_id: string;
    is_hidden: boolean;
    is_deleted: boolean;
    author: { username: string } | null;
    thread: { title: string } | null;
  } | null;
  reporter: { username: string } | null;
}

export default async function ReportsPage() {
  const me = await getCurrentUser();
  if (!me) redirect('/login?next=/admin/reports');
  if (me.role !== 'mod' && me.role !== 'admin') redirect('/');

  const supabase = createClient();
  const { data } = await supabase
    .from('reports')
    .select(
      `id, reason, note, status, created_at,
       post:posts(id, post_number, body_md, thread_id, is_hidden, is_deleted, author:users!posts_author_id_fkey(username), thread:threads(title)),
       reporter:users!reports_reporter_id_fkey(username)`,
    )
    .eq('status', 'open')
    .order('created_at', { ascending: false })
    .limit(50);

  const rows = (data ?? []) as unknown as ReportData[];

  return (
    <Container>
      <div className="py-8 space-y-6">
        <div>
          <h1 className="text-2xl font-semibold">Reports queue</h1>
          <div className="title-rule mt-2" />
        </div>
        {rows.length === 0 ? (
          <p className="text-sm text-[var(--fg-muted)]">No open reports.</p>
        ) : (
          <ul className="space-y-3">
            {rows.map((r) => (
              <ReportRow key={r.id} report={r} />
            ))}
          </ul>
        )}
      </div>
    </Container>
  );
}
