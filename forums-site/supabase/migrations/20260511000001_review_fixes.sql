-- Review fixes (Copilot + independent review on PR #47)
-- 1. assign_post_number needs SECURITY DEFINER — it reads public.posts and would
--    miss hidden/deleted rows under RLS, producing UNIQUE collisions.
-- 2. posts_after_soft_delete must decrement counters for OP too (was skipped),
--    leaving threads.post_count stale when the OP is soft-deleted.
-- 3. bans needs a self-read policy so banned users can see their own ban reason
--    on /banned (current policy is mods-only).
-- 4. post_edits_insert_self needs current_user_active() to block banned users
--    from spamming the audit log.

-- Fix 1: harden assign_post_number
create or replace function public.assign_post_number()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  next_num integer;
  lock_key bigint;
begin
  lock_key := abs(hashtext(new.thread_id::text))::bigint;
  perform pg_advisory_xact_lock(lock_key);

  select coalesce(max(post_number), 0) + 1
    into next_num
    from public.posts
    where thread_id = new.thread_id;

  new.post_number := next_num;
  return new;
end;
$$;

-- Fix 2: soft-delete trigger now handles OP (post_number = 1) too
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

  -- Always update thread post_count (including OP).
  -- When OP is soft-deleted, the thread becomes a zombie listing but counters stay sane.
  update public.threads
    set post_count = greatest(post_count + delta, 0)
    where id = new.thread_id;

  update public.users
    set post_count = greatest(post_count + delta, 0)
    where id = new.author_id;

  return new;
end;
$$;

-- Fix 3: bans self-read policy
create policy bans_select_self on public.bans for select
  using (auth.uid() = user_id);

-- Fix 4: post_edits_insert_self gated by current_user_active()
drop policy if exists post_edits_insert_self on public.post_edits;
create policy post_edits_insert_self on public.post_edits for insert
  with check (
    auth.uid() = edited_by
    and public.current_user_active()
    and exists (
      select 1 from public.posts p where p.id = post_id and p.author_id = auth.uid()
    )
  );
