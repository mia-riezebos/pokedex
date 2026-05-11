-- Assign sequential post_number per thread under advisory lock
create or replace function public.assign_post_number()
returns trigger
language plpgsql
as $$
declare
  next_num integer;
  lock_key bigint;
begin
  -- hashtext returns int; cast to bigint for advisory lock key
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

create trigger posts_assign_post_number
  before insert on public.posts
  for each row execute function public.assign_post_number();

-- Bump denormalized counters on insert
create or replace function public.posts_after_insert()
returns trigger
language plpgsql
as $$
begin
  -- Don't bump on the OP (post_number = 1, inserted with thread)
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

create trigger posts_after_insert_trg
  after insert on public.posts
  for each row execute function public.posts_after_insert();

-- Decrement counters on soft-delete; reverse on un-delete
create or replace function public.posts_after_soft_delete()
returns trigger
language plpgsql
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

create trigger posts_after_soft_delete_trg
  after update of is_deleted on public.posts
  for each row execute function public.posts_after_soft_delete();

-- Clear probation flag once user has 5+ posts
create or replace function public.clear_probation()
returns trigger
language plpgsql
as $$
begin
  if new.post_count >= 5 and new.is_probationary = true then
    new.is_probationary := false;
  end if;
  return new;
end;
$$;

create trigger users_clear_probation
  before update of post_count on public.users
  for each row execute function public.clear_probation();
