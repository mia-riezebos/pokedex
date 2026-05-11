create type public.user_role as enum ('user', 'mod', 'admin');

create table public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  username citext unique not null check (username::text ~ '^[a-z0-9_]{3,20}$'),
  display_name text,
  avatar_url text,
  bio text,
  signature_md text check (char_length(signature_md) <= 500),
  role public.user_role not null default 'user',
  post_count integer not null default 0,
  last_seen_at timestamptz not null default now(),
  is_banned boolean not null default false,
  is_probationary boolean not null default true,
  created_at timestamptz not null default now()
);

create index users_username_idx on public.users (username);
create index users_last_seen_idx on public.users (last_seen_at desc) where is_banned = false;

-- Auto-create stub public.users row on auth signup
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  hex36 text := replace(new.id::text, '-', '');
  candidate text;
  attempt int := 0;
begin
  -- Try up to 4 different 12-char windows from the UUID hex (positions 1, 5, 9, 13).
  -- Collision probability across all 4 windows is astronomical; if all fail, raise.
  loop
    candidate := 'user_' || substr(hex36, 1 + attempt * 4, 12);
    begin
      insert into public.users (id, username)
      values (new.id, candidate)
      on conflict (id) do nothing;
      exit;
    exception when unique_violation then
      attempt := attempt + 1;
      if attempt > 3 then raise; end if;
    end;
  end loop;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();

-- Auth helpers (deferred from Task 2.1 — they reference public.users so must come after table create).
-- Used by every write RLS policy in Task 2.8.
create or replace function public.current_user_active()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select coalesce(
    (select not is_banned from public.users where id = auth.uid()),
    false
  );
$$;

create or replace function public.current_user_role()
returns text
language sql
security definer
stable
set search_path = public
as $$
  select coalesce(
    (select role::text from public.users where id = auth.uid()),
    'anon'
  );
$$;
