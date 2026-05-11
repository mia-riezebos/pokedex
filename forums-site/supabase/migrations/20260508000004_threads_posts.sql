create table public.threads (
  id uuid primary key default gen_random_uuid(),
  subforum_id integer not null references public.subforums(id) on delete restrict,
  author_id uuid not null references public.users(id) on delete restrict,
  title text not null check (char_length(title) between 3 and 200),
  slug text not null,
  created_at timestamptz not null default now(),
  last_post_at timestamptz not null default now(),
  last_post_user_id uuid references public.users(id) on delete set null,
  post_count integer not null default 1,
  is_pinned boolean not null default false,
  is_locked boolean not null default false,
  is_deleted boolean not null default false
);

create unique index threads_subforum_slug_idx on public.threads (subforum_id, slug);
create index threads_subforum_pinned_recent_idx
  on public.threads (subforum_id, is_pinned desc, last_post_at desc)
  where is_deleted = false;
create index threads_recent_idx
  on public.threads (last_post_at desc)
  where is_deleted = false;
create index threads_author_idx on public.threads (author_id, created_at desc);

create table public.posts (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.threads(id) on delete cascade,
  author_id uuid not null references public.users(id) on delete restrict,
  body_md text not null check (char_length(body_md) between 1 and 50000),
  body_html text not null,
  post_number integer not null,
  reply_to_post_id uuid references public.posts(id) on delete set null,
  edited_at timestamptz,
  edited_by uuid references public.users(id) on delete set null,
  is_deleted boolean not null default false,
  is_hidden boolean not null default false,
  created_at timestamptz not null default now()
);

create unique index posts_thread_number_idx on public.posts (thread_id, post_number);
create index posts_thread_visible_idx
  on public.posts (thread_id, post_number)
  where is_deleted = false and is_hidden = false;
create index posts_author_idx on public.posts (author_id, created_at desc);
