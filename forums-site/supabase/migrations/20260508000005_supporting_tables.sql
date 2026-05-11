create table public.post_edits (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  body_md text not null,
  edited_by uuid references public.users(id) on delete set null,
  edited_at timestamptz not null default now()
);

create index post_edits_post_idx on public.post_edits (post_id, edited_at desc);

create table public.thanks (
  post_id uuid not null references public.posts(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

create index thanks_user_idx on public.thanks (user_id, created_at desc);

create type public.notification_type as enum ('reply', 'quote', 'mention', 'thanks');

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  type public.notification_type not null,
  source_post_id uuid references public.posts(id) on delete cascade,
  source_user_id uuid references public.users(id) on delete set null,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index notifications_user_unread_idx
  on public.notifications (user_id, created_at desc)
  where read_at is null;
create index notifications_user_all_idx
  on public.notifications (user_id, created_at desc);

create table public.thread_reads (
  user_id uuid not null references public.users(id) on delete cascade,
  thread_id uuid not null references public.threads(id) on delete cascade,
  last_read_post_number integer not null default 0,
  last_read_at timestamptz not null default now(),
  primary key (user_id, thread_id)
);

create index thread_reads_user_recent_idx on public.thread_reads (user_id, last_read_at desc);

create type public.report_reason as enum ('spam', 'harassment', 'off_topic', 'other');
create type public.report_status as enum ('open', 'resolved', 'dismissed');

create table public.reports (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  reporter_id uuid references public.users(id) on delete set null,
  reason public.report_reason not null,
  note text,
  status public.report_status not null default 'open',
  handled_by uuid references public.users(id) on delete set null,
  handled_at timestamptz,
  created_at timestamptz not null default now()
);

create index reports_open_idx on public.reports (created_at desc) where status = 'open';

create table public.mod_log (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.users(id) on delete set null,
  action text not null,
  target_type text not null,
  target_id text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index mod_log_recent_idx on public.mod_log (created_at desc);
create index mod_log_actor_idx on public.mod_log (actor_id, created_at desc);

create table public.bans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  by_user_id uuid references public.users(id) on delete set null,
  reason text not null,
  expires_at timestamptz,
  created_at timestamptz not null default now()
);

create index bans_user_idx on public.bans (user_id, created_at desc);
