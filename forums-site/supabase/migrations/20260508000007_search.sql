alter table public.threads
  add column tsv tsvector
  generated always as (to_tsvector('simple', coalesce(title, ''))) stored;

create index threads_tsv_idx
  on public.threads using gin (tsv)
  where is_deleted = false;

alter table public.posts
  add column tsv tsvector
  generated always as (to_tsvector('simple', coalesce(body_md, ''))) stored;

create index posts_tsv_idx
  on public.posts using gin (tsv)
  where is_deleted = false and is_hidden = false;
