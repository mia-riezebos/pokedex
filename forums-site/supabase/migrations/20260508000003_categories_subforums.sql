create table public.categories (
  id serial primary key,
  name text not null,
  slug text unique not null check (slug ~ '^[a-z0-9][a-z0-9-]*[a-z0-9]$'),
  position integer not null default 0,
  created_at timestamptz not null default now()
);

create index categories_position_idx on public.categories (position);

create table public.subforums (
  id serial primary key,
  category_id integer not null references public.categories(id) on delete restrict,
  name text not null,
  slug text unique not null check (slug ~ '^[a-z0-9][a-z0-9-]*[a-z0-9]$'),
  description text,
  position integer not null default 0,
  is_locked boolean not null default false,
  created_at timestamptz not null default now()
);

create index subforums_category_position_idx on public.subforums (category_id, position);
