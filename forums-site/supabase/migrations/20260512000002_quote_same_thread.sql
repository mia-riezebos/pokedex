-- Constrain quote notifications to same thread: a malicious client could set
-- reply_to_post_id to any post in any thread and trigger a misleading "quoted"
-- notification. Add a thread_id check on the lookup.

create or replace function public.fan_out_notifications()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  thread_author uuid;
  quote_author uuid;
  mention_username text;
  mention_user_id uuid;
  notified_users uuid[] := array[new.author_id];
begin
  if new.post_number = 1 then
    return new;
  end if;

  select t.author_id into thread_author
  from public.threads t
  where t.id = new.thread_id;

  if new.reply_to_post_id is not null then
    select p.author_id into quote_author
    from public.posts p
    where p.id = new.reply_to_post_id
      and p.thread_id = new.thread_id;  -- enforce same thread
  end if;

  if quote_author is not null and quote_author <> all(notified_users) then
    insert into public.notifications (user_id, type, source_post_id, source_user_id)
    values (quote_author, 'quote', new.id, new.author_id);
    notified_users := notified_users || quote_author;
  end if;

  if thread_author is not null and thread_author <> all(notified_users) then
    insert into public.notifications (user_id, type, source_post_id, source_user_id)
    values (thread_author, 'reply', new.id, new.author_id);
    notified_users := notified_users || thread_author;
  end if;

  for mention_username in
    select distinct lower(r.match[1])
    from regexp_matches(coalesce(new.body_md, ''), '@([a-z0-9_]{3,20})', 'gi') as r(match)
  loop
    select u.id into mention_user_id
    from public.users u
    where u.username = mention_username::citext
    limit 1;

    if mention_user_id is not null and mention_user_id <> all(notified_users) then
      insert into public.notifications (user_id, type, source_post_id, source_user_id)
      values (mention_user_id, 'mention', new.id, new.author_id);
      notified_users := notified_users || mention_user_id;
    end if;
  end loop;

  return new;
end;
$$;
