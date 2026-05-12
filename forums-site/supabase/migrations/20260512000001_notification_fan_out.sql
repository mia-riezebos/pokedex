-- Fan out notifications when a post is inserted.
-- Three notification types:
--   reply   → thread author when someone replies to their thread
--   quote   → original post author when someone uses quote-reply on their post
--   mention → user when their @username appears in a post body
--
-- Dedupe rules:
--   - Don't notify the post's own author
--   - If both reply + quote target the same user, only send quote
--   - If a mention also targets the thread author or quote target, suppress the mention
--   - OPs (post_number = 1) don't generate notifications

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

  -- Thread author
  select t.author_id into thread_author
  from public.threads t
  where t.id = new.thread_id;

  -- Quote target (if quoted)
  if new.reply_to_post_id is not null then
    select p.author_id into quote_author
    from public.posts p
    where p.id = new.reply_to_post_id;
  end if;

  -- Send quote notification first (higher specificity than reply)
  if quote_author is not null and quote_author <> all(notified_users) then
    insert into public.notifications (user_id, type, source_post_id, source_user_id)
    values (quote_author, 'quote', new.id, new.author_id);
    notified_users := notified_users || quote_author;
  end if;

  -- Send reply notification to thread author (if not already notified via quote)
  if thread_author is not null and thread_author <> all(notified_users) then
    insert into public.notifications (user_id, type, source_post_id, source_user_id)
    values (thread_author, 'reply', new.id, new.author_id);
    notified_users := notified_users || thread_author;
  end if;

  -- Mentions: parse @username and notify each (skipping already-notified)
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

create trigger posts_fan_out_notifications
  after insert on public.posts
  for each row execute function public.fan_out_notifications();
