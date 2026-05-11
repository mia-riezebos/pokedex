-- 0. Harden trigger functions to bypass RLS (they update tables on behalf of users
--    who may not have direct UPDATE rights on the target rows under RLS).
--    `assign_post_number` only writes to NEW (no other-row access) — left as-is.

create or replace function public.posts_after_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.post_number > 1 then
    update public.threads
      set post_count = post_count + 1,
          last_post_at = new.created_at,
          last_post_user_id = new.author_id
      where id = new.thread_id;
  end if;

  update public.users
    set post_count = post_count + 1
    where id = new.author_id;

  return new;
end;
$$;

create or replace function public.posts_after_soft_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  delta integer;
begin
  if new.is_deleted = old.is_deleted then
    return new;
  end if;
  delta := case when new.is_deleted then -1 else 1 end;

  if new.post_number > 1 then
    update public.threads
      set post_count = greatest(post_count + delta, 0)
      where id = new.thread_id;
  end if;

  update public.users
    set post_count = greatest(post_count + delta, 0)
    where id = new.author_id;

  return new;
end;
$$;

create or replace function public.clear_probation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.post_count >= 5 and new.is_probationary = true then
    new.is_probationary := false;
  end if;
  return new;
end;
$$;

-- 1. Enable RLS on all public tables

alter table public.users enable row level security;
alter table public.categories enable row level security;
alter table public.subforums enable row level security;
alter table public.threads enable row level security;
alter table public.posts enable row level security;
alter table public.post_edits enable row level security;
alter table public.thanks enable row level security;
alter table public.notifications enable row level security;
alter table public.thread_reads enable row level security;
alter table public.reports enable row level security;
alter table public.mod_log enable row level security;
alter table public.bans enable row level security;

-- 2. USERS: anyone reads (public profiles); user updates own row; admins update any
create policy users_select_all on public.users for select using (true);

create policy users_update_self on public.users for update
  using (auth.uid() = id and public.current_user_active())
  with check (
    auth.uid() = id
    -- Cannot self-promote: role + ban flags require admin
    and role = (select role from public.users where id = auth.uid())
    and is_banned = (select is_banned from public.users where id = auth.uid())
    and is_probationary = (select is_probationary from public.users where id = auth.uid())
  );

create policy users_update_admin on public.users for update
  using (public.current_user_role() = 'admin');

-- 3. CATEGORIES + SUBFORUMS: read all; only admins write

create policy categories_select_all on public.categories for select using (true);
create policy categories_admin_all on public.categories for all
  using (public.current_user_role() = 'admin')
  with check (public.current_user_role() = 'admin');

create policy subforums_select_all on public.subforums for select using (true);
create policy subforums_admin_all on public.subforums for all
  using (public.current_user_role() = 'admin')
  with check (public.current_user_role() = 'admin');

-- 4. THREADS

create policy threads_select_visible on public.threads for select
  using (
    is_deleted = false
    or public.current_user_role() in ('mod', 'admin')
  );

create policy threads_insert_self on public.threads for insert
  with check (
    auth.uid() = author_id
    and public.current_user_active()
    and exists (
      select 1 from public.subforums s where s.id = subforum_id and s.is_locked = false
    )
  );

create policy threads_update_self on public.threads for update
  using (auth.uid() = author_id and public.current_user_active())
  with check (
    auth.uid() = author_id
    -- Self can only flip is_deleted (soft-delete own thread)
    and is_pinned = (select is_pinned from public.threads where id = threads.id)
    and is_locked = (select is_locked from public.threads where id = threads.id)
  );

create policy threads_update_mod on public.threads for update
  using (public.current_user_role() in ('mod', 'admin'));

-- 5. POSTS

create policy posts_select_visible on public.posts for select
  using (
    (is_deleted = false and is_hidden = false)
    or public.current_user_role() in ('mod', 'admin')
  );

create policy posts_insert_self on public.posts for insert
  with check (
    auth.uid() = author_id
    and public.current_user_active()
    and exists (
      select 1 from public.threads t
      where t.id = thread_id
        and t.is_deleted = false
        and t.is_locked = false
    )
  );

create policy posts_update_self on public.posts for update
  using (auth.uid() = author_id and public.current_user_active())
  with check (auth.uid() = author_id);

create policy posts_update_mod on public.posts for update
  using (public.current_user_role() in ('mod', 'admin'));

-- 6. POST_EDITS: read all (transparency); insert via trigger or own edit

create policy post_edits_select_all on public.post_edits for select using (true);
create policy post_edits_insert_self on public.post_edits for insert
  with check (auth.uid() = edited_by);

-- 7. THANKS: read all; insert/delete self

create policy thanks_select_all on public.thanks for select using (true);
create policy thanks_insert_self on public.thanks for insert
  with check (auth.uid() = user_id and public.current_user_active());
create policy thanks_delete_self on public.thanks for delete
  using (auth.uid() = user_id);

-- 8. NOTIFICATIONS: read/update own only

create policy notifications_select_own on public.notifications for select
  using (auth.uid() = user_id);
create policy notifications_update_own on public.notifications for update
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- 9. THREAD_READS: read/upsert own only

create policy thread_reads_all_own on public.thread_reads for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- 10. REPORTS: insert by anyone signed-in; mods read/update

create policy reports_insert_self on public.reports for insert
  with check (auth.uid() = reporter_id and public.current_user_active());
create policy reports_select_mod on public.reports for select
  using (public.current_user_role() in ('mod', 'admin'));
create policy reports_update_mod on public.reports for update
  using (public.current_user_role() in ('mod', 'admin'));

-- 11. MOD_LOG: insert by mods+ (server-side); read by mods+

create policy mod_log_select_mod on public.mod_log for select
  using (public.current_user_role() in ('mod', 'admin'));
create policy mod_log_insert_mod on public.mod_log for insert
  with check (public.current_user_role() in ('mod', 'admin'));

-- 12. BANS: read by mods+; insert/update by mods+

create policy bans_select_mod on public.bans for select
  using (public.current_user_role() in ('mod', 'admin'));
create policy bans_modify_mod on public.bans for all
  using (public.current_user_role() in ('mod', 'admin'))
  with check (public.current_user_role() in ('mod', 'admin'));
