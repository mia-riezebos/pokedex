# Poke Forums MVP — Implementation Plan (Plan A of 3)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a live, deployable v1 of Poke Forums where signed-up users can create threads, reply with Markdown, edit/delete their own posts, and read everything else — running on Vercel + Supabase, $0/month.

**Architecture:** Next.js 14 App Router (RSC + edge for reads, Node runtime for writes) talking directly to a dedicated Supabase project. RLS as primary authorization with route-handler defense in depth. Postgres triggers for denormalized counters and ordinal post numbers.

**Tech Stack:** Next.js 14 · TypeScript · Tailwind CSS · Supabase (Postgres + Auth + Storage + Realtime) · `@supabase/ssr` · Upstash Redis (rate limit) · Cloudflare Turnstile (captcha) · Vitest · Playwright · Vercel.

**Spec reference:** `docs/superpowers/specs/2026-05-08-poke-forums-design.md`

**What's NOT in this plan (handled in Plan B + Plan C):**
- Reactions, notifications, activity feed, search, profile settings → **Plan B (Community)**
- Reports, mod tools, admin panel, full anti-spam (probationary period, blocklist), mod log, online-users footer → **Plan C (Operations)**

---

## File Structure

```
forums-site/                                    (NEW sibling to recipes-site/)
├─ package.json
├─ tsconfig.json
├─ next.config.mjs
├─ tailwind.config.ts
├─ postcss.config.mjs
├─ vercel.json
├─ vitest.config.ts
├─ playwright.config.ts
├─ .env.local.example
├─ .gitignore
├─ middleware.ts                                (session refresh, ban gate, onboarding gate, last_seen)
├─ app/
│  ├─ layout.tsx
│  ├─ globals.css
│  ├─ page.tsx                                  (home — category list)
│  ├─ not-found.tsx
│  ├─ f/[subforum]/page.tsx                     (subforum thread list)
│  ├─ t/[thread]/page.tsx                       (thread + posts)
│  ├─ u/[username]/page.tsx                     (profile, basic)
│  ├─ login/page.tsx
│  ├─ signup/page.tsx
│  ├─ onboarding/page.tsx
│  ├─ banned/page.tsx
│  ├─ auth/callback/route.ts
│  └─ api/
│     ├─ threads/route.ts                       (POST = create thread + OP)
│     ├─ threads/[id]/posts/route.ts            (POST = reply)
│     ├─ posts/[id]/route.ts                    (PATCH = edit, DELETE = soft-delete)
│     └─ uploads/route.ts                       (POST = avatar/post image)
├─ components/
│  ├─ chrome/{Header,Footer,Container}.tsx
│  ├─ post/{PostCard,PostBody,PostMeta,Composer,QuoteBlock}.tsx
│  ├─ thread/{ThreadRow,NewThreadButton}.tsx
│  ├─ user/{Avatar,Identicon,RoleBadge,UserChip}.tsx
│  └─ ui/{Button,Input,Textarea,Markdown,Pagination,FormError}.tsx
├─ lib/
│  ├─ supabase/
│  │  ├─ server.ts                              (RSC + route handler client)
│  │  ├─ browser.ts                             (client-component client)
│  │  └─ admin.ts                               (service role; server-only)
│  ├─ markdown.ts                               (render + sanitize + shiki)
│  ├─ identicon.ts                              (deterministic SVG identicon)
│  ├─ slug.ts                                   (slugify titles)
│  ├─ rate-limit.ts                             (Upstash sliding window)
│  ├─ turnstile.ts                              (verify token server-side)
│  ├─ time.ts                                   (relative time)
│  ├─ auth.ts                                   (getCurrentUser helper)
│  ├─ db.ts                                     (typed query helpers)
│  └─ types.ts                                  (DB row types from supabase gen types)
├─ supabase/
│  ├─ config.toml                               (local CLI config)
│  ├─ migrations/
│  │  ├─ 20260508000001_extensions.sql
│  │  ├─ 20260508000002_users.sql
│  │  ├─ 20260508000003_categories_subforums.sql
│  │  ├─ 20260508000004_threads_posts.sql
│  │  ├─ 20260508000005_supporting_tables.sql
│  │  ├─ 20260508000006_triggers.sql
│  │  ├─ 20260508000007_search.sql
│  │  ├─ 20260508000008_rls.sql
│  │  └─ 20260508000009_storage.sql
│  └─ seed.sql                                  (default categories + subforums)
└─ tests/
   ├─ unit/{markdown,identicon,slug,time}.test.ts
   ├─ db/{rls-posts,rls-threads,triggers}.test.ts
   └─ e2e/{signup-and-post,read-thread}.spec.ts
```

**Per-file responsibilities:**
- `lib/supabase/*` — three thin wrappers over `@supabase/ssr`. `server.ts` is RSC-safe, `browser.ts` is client-side only, `admin.ts` is server-only with service role.
- `lib/markdown.ts` — single source of truth for Markdown→sanitized HTML. Used by both write path (cache `body_html`) and any read fallback.
- `middleware.ts` — runs on every request: refreshes session, redirects banned users, enforces onboarding, debounces `last_seen_at` bump (30s window via Redis SETEX).
- `supabase/migrations/*` — every SQL change is a numbered file. Never edit existing migrations after they're applied.
- `app/api/*/route.ts` — Node-runtime route handlers. Validate input, run rate limits + Turnstile, call Supabase with the user's session, write `mod_log` if applicable.

---

## Conventions for every task

- **Working directory:** `forums-site/` unless otherwise noted.
- **Commit style:** `<type>(<scope>): <subject>` — types: `feat`, `fix`, `chore`, `test`, `db`, `docs`. Scope = phase area (e.g., `auth`, `schema`, `composer`).
- **TDD:** unit tests for pure functions, DB tests for triggers + RLS, Playwright for one happy path. Skip tests for purely visual components.
- **Branch:** work on `feat/forums-mvp`. Open one PR at the end of the plan; commits within are reviewable.

---

## Phase 0 — Bootstrap

### Task 0.1: Initialize Next.js project + create branch

**Files:**
- Create: `forums-site/` (entire scaffold)

- [ ] **Step 1: From repo root, create branch**

```bash
git checkout -b feat/forums-mvp
```

- [ ] **Step 2: Scaffold Next.js (App Router, TS, Tailwind, src=no, import alias `@/*`)**

```bash
npx create-next-app@14 forums-site \
  --typescript --tailwind --eslint --app \
  --no-src-dir --import-alias "@/*" --use-npm
```

- [ ] **Step 3: Verify it boots**

```bash
cd forums-site && npm run dev
# Visit http://localhost:3000 — should see the default Next.js page
# Ctrl-C to stop
```

- [ ] **Step 4: Commit**

```bash
git add forums-site/
git commit -m "chore(forums): scaffold Next.js 14 app"
```

---

### Task 0.2: Install runtime + dev dependencies

**Files:**
- Modify: `forums-site/package.json`

- [ ] **Step 1: Install runtime deps**

```bash
cd forums-site
npm install \
  @supabase/supabase-js \
  @supabase/ssr \
  @upstash/ratelimit \
  @upstash/redis \
  react-markdown \
  remark-gfm \
  rehype-sanitize \
  rehype-slug \
  shiki \
  zod
```

- [ ] **Step 2: Install dev deps**

```bash
npm install -D \
  vitest \
  @vitest/ui \
  @testing-library/react \
  @testing-library/jest-dom \
  jsdom \
  @playwright/test \
  supabase \
  prettier \
  eslint-config-prettier \
  @types/node
```

- [ ] **Step 3: Add scripts to `forums-site/package.json`**

Edit the `"scripts"` block to:

```json
"scripts": {
  "dev": "next dev --port 3002",
  "build": "next build",
  "start": "next start",
  "lint": "next lint",
  "test": "vitest run",
  "test:watch": "vitest",
  "test:e2e": "playwright test",
  "db:start": "supabase start",
  "db:stop": "supabase stop",
  "db:reset": "supabase db reset",
  "db:push": "supabase db push",
  "db:types": "supabase gen types typescript --local > lib/types.ts",
  "format": "prettier --write ."
}
```

(Port 3002 because recipes-site uses 3001.)

- [ ] **Step 4: Commit**

```bash
git add forums-site/package.json forums-site/package-lock.json
git commit -m "chore(forums): install deps + scripts"
```

---

### Task 0.3: Configure Vitest, Playwright, Prettier

**Files:**
- Create: `forums-site/vitest.config.ts`
- Create: `forums-site/playwright.config.ts`
- Create: `forums-site/.prettierrc.json`
- Modify: `forums-site/.gitignore`

- [ ] **Step 1: Write `vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./tests/setup.ts'],
    include: ['tests/unit/**/*.test.{ts,tsx}', 'tests/db/**/*.test.ts'],
  },
  resolve: {
    alias: { '@': path.resolve(__dirname, '.') },
  },
});
```

- [ ] **Step 2: Write `tests/setup.ts`**

```ts
import '@testing-library/jest-dom/vitest';
```

- [ ] **Step 3: Write `playwright.config.ts`**

```ts
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  use: {
    baseURL: 'http://localhost:3002',
    trace: 'on-first-retry',
  },
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3002',
    reuseExistingServer: !process.env.CI,
  },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
});
```

- [ ] **Step 4: Write `.prettierrc.json`**

```json
{
  "singleQuote": true,
  "semi": true,
  "trailingComma": "all",
  "printWidth": 100,
  "tabWidth": 2
}
```

- [ ] **Step 5: Append to `.gitignore`**

```
.env.local
.env.*.local
playwright-report/
test-results/
.vercel/
supabase/.branches/
supabase/.temp/
```

- [ ] **Step 6: Sanity-run vitest**

```bash
npm run test
# Expected: "No test files found" (we haven't written tests yet) — exits 0 or with that message
```

- [ ] **Step 7: Commit**

```bash
git add forums-site/{vitest.config.ts,playwright.config.ts,.prettierrc.json,.gitignore,tests}
git commit -m "chore(forums): configure vitest, playwright, prettier"
```

---

### Task 0.4: Environment variables template

**Files:**
- Create: `forums-site/.env.local.example`

- [ ] **Step 1: Write `.env.local.example`**

```
# --- Supabase ---
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# --- Upstash Redis (rate limiting) ---
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=

# --- Cloudflare Turnstile (captcha) ---
NEXT_PUBLIC_TURNSTILE_SITE_KEY=
TURNSTILE_SECRET_KEY=

# --- Site ---
NEXT_PUBLIC_SITE_URL=http://localhost:3002
```

- [ ] **Step 2: Commit**

```bash
git add forums-site/.env.local.example
git commit -m "chore(forums): add env var template"
```

---

## Phase 1 — Supabase project + client wrappers

### Task 1.1: Create dev Supabase project + local link

**No code changes — manual setup with notes for the engineer.**

- [ ] **Step 1: Create both projects in Supabase dashboard**

At https://supabase.com/dashboard:
1. Create org if needed.
2. Create project `poke-forums-dev` (free tier, region close to you).
3. Create project `poke-forums-prod` (free tier, same region).
4. From each project's **Settings → API**, copy `Project URL`, `anon public key`, and `service_role` key.

- [ ] **Step 2: Fill `forums-site/.env.local` (NOT committed) with dev values**

```bash
cp .env.local.example .env.local
# Then paste the dev project's URL + keys
```

- [ ] **Step 3: Initialize Supabase CLI in `forums-site/`**

```bash
cd forums-site
npx supabase init
# Answer prompts: yes to VS Code settings if you use it; otherwise defaults
```

This creates `supabase/config.toml` and `supabase/migrations/`.

- [ ] **Step 4: Link to dev project**

```bash
npx supabase link --project-ref <dev-project-ref>
# Project ref is in the dashboard URL
```

- [ ] **Step 5: Verify with a no-op pull**

```bash
npx supabase db pull --schema public
# Should report no schema changes (empty project)
```

- [ ] **Step 6: Commit Supabase config**

```bash
git add forums-site/supabase/config.toml
git commit -m "chore(forums): link supabase dev project"
```

---

### Task 1.2: Supabase client wrappers

**Files:**
- Create: `forums-site/lib/supabase/server.ts`
- Create: `forums-site/lib/supabase/browser.ts`
- Create: `forums-site/lib/supabase/admin.ts`

- [ ] **Step 1: Write `lib/supabase/server.ts`**

```ts
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';
import type { Database } from '@/lib/types';

export function createClient() {
  const cookieStore = cookies();
  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get: (name) => cookieStore.get(name)?.value,
        set: (name, value, options: CookieOptions) => {
          try {
            cookieStore.set({ name, value, ...options });
          } catch {
            // RSC can't set cookies; middleware handles refresh
          }
        },
        remove: (name, options: CookieOptions) => {
          try {
            cookieStore.set({ name, value: '', ...options });
          } catch {}
        },
      },
    },
  );
}
```

- [ ] **Step 2: Write `lib/supabase/browser.ts`**

```ts
import { createBrowserClient } from '@supabase/ssr';
import type { Database } from '@/lib/types';

export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
```

- [ ] **Step 3: Write `lib/supabase/admin.ts`**

```ts
import 'server-only';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/types';

export function createAdminClient() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}
```

- [ ] **Step 4: Stub `lib/types.ts` (will be regenerated after Phase 2)**

```ts
export type Database = Record<string, never>;
```

- [ ] **Step 5: Verify build works**

```bash
npm run build
# Expected: succeeds (no actual DB calls yet)
```

- [ ] **Step 6: Commit**

```bash
git add forums-site/lib/
git commit -m "feat(forums): supabase client wrappers"
```

---

## Phase 2 — Schema, triggers, RLS

Each migration is its own SQL file. Run `npm run db:reset` between tasks to test idempotency. After all migrations apply cleanly, regenerate types.

### Task 2.1: Migration — extensions + helpers

**Files:**
- Create: `forums-site/supabase/migrations/20260508000001_extensions.sql`

- [ ] **Step 1: Write the migration**

```sql
create extension if not exists citext;
create extension if not exists pg_trgm;
create extension if not exists pgcrypto;

-- Helper: returns true if the current authenticated user is not banned.
-- Used by every write RLS policy.
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

-- Helper: returns the role of the current user, or 'anon' if not signed in.
create or replace function public.current_user_role()
returns text
language sql
security definer
stable
set search_path = public
as $$
  select coalesce(
    (select role from public.users where id = auth.uid()),
    'anon'
  );
$$;
```

- [ ] **Step 2: Apply locally**

```bash
npm run db:reset
# Should apply migration cleanly
```

- [ ] **Step 3: Commit**

```bash
git add forums-site/supabase/migrations/20260508000001_extensions.sql
git commit -m "db(forums): extensions + auth helpers"
```

---

### Task 2.2: Migration — users table

**Files:**
- Create: `forums-site/supabase/migrations/20260508000002_users.sql`

- [ ] **Step 1: Write the migration**

```sql
create type public.user_role as enum ('user', 'mod', 'admin');

create table public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  username citext unique not null,
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
  short_id text := substr(replace(new.id::text, '-', ''), 1, 8);
begin
  insert into public.users (id, username)
  values (new.id, 'user_' || short_id)
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();
```

- [ ] **Step 2: Apply + verify**

```bash
npm run db:reset
# Open Supabase Studio (http://localhost:54323) → Tables → public → users should exist
```

- [ ] **Step 3: Commit**

```bash
git add forums-site/supabase/migrations/20260508000002_users.sql
git commit -m "db(forums): users table + auth signup trigger"
```

---

### Task 2.3: Migration — categories + subforums

**Files:**
- Create: `forums-site/supabase/migrations/20260508000003_categories_subforums.sql`

- [ ] **Step 1: Write the migration**

```sql
create table public.categories (
  id serial primary key,
  name text not null,
  slug text unique not null,
  position integer not null default 0,
  created_at timestamptz not null default now()
);

create index categories_position_idx on public.categories (position);

create table public.subforums (
  id serial primary key,
  category_id integer not null references public.categories(id) on delete restrict,
  name text not null,
  slug text unique not null,
  description text,
  position integer not null default 0,
  is_locked boolean not null default false,
  created_at timestamptz not null default now()
);

create index subforums_category_position_idx on public.subforums (category_id, position);
```

- [ ] **Step 2: Apply + commit**

```bash
npm run db:reset
git add forums-site/supabase/migrations/20260508000003_categories_subforums.sql
git commit -m "db(forums): categories + subforums"
```

---

### Task 2.4: Migration — threads + posts

**Files:**
- Create: `forums-site/supabase/migrations/20260508000004_threads_posts.sql`

- [ ] **Step 1: Write the migration**

```sql
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
```

- [ ] **Step 2: Apply + commit**

```bash
npm run db:reset
git add forums-site/supabase/migrations/20260508000004_threads_posts.sql
git commit -m "db(forums): threads + posts"
```

---

### Task 2.5: Migration — supporting tables

**Files:**
- Create: `forums-site/supabase/migrations/20260508000005_supporting_tables.sql`

- [ ] **Step 1: Write the migration**

```sql
create table public.post_edits (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  body_md text not null,
  edited_by uuid not null references public.users(id) on delete set null,
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
  reporter_id uuid not null references public.users(id) on delete set null,
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
  actor_id uuid not null references public.users(id) on delete set null,
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
  by_user_id uuid not null references public.users(id) on delete set null,
  reason text not null,
  expires_at timestamptz,
  created_at timestamptz not null default now()
);

create index bans_user_idx on public.bans (user_id, created_at desc);
```

- [ ] **Step 2: Apply + commit**

```bash
npm run db:reset
git add forums-site/supabase/migrations/20260508000005_supporting_tables.sql
git commit -m "db(forums): supporting tables (edits, thanks, notifications, reports, mod_log, bans)"
```

---

### Task 2.6: Migration — triggers (post numbers, counters, probation clear)

**Files:**
- Create: `forums-site/supabase/migrations/20260508000006_triggers.sql`

- [ ] **Step 1: Write the migration**

```sql
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
```

- [ ] **Step 2: Apply**

```bash
npm run db:reset
```

- [ ] **Step 3: Commit**

```bash
git add forums-site/supabase/migrations/20260508000006_triggers.sql
git commit -m "db(forums): triggers — post numbers, counters, probation clear"
```

---

### Task 2.7: Migration — search (tsvector + GIN)

**Files:**
- Create: `forums-site/supabase/migrations/20260508000007_search.sql`

- [ ] **Step 1: Write the migration**

```sql
alter table public.threads
  add column tsv tsvector
  generated always as (to_tsvector('english', coalesce(title, ''))) stored;

create index threads_tsv_idx on public.threads using gin (tsv);

alter table public.posts
  add column tsv tsvector
  generated always as (to_tsvector('english', coalesce(body_md, ''))) stored;

create index posts_tsv_idx on public.posts using gin (tsv);
```

- [ ] **Step 2: Apply + commit**

```bash
npm run db:reset
git add forums-site/supabase/migrations/20260508000007_search.sql
git commit -m "db(forums): full-text search (tsvector + GIN)"
```

---

### Task 2.8: Migration — RLS policies

**Files:**
- Create: `forums-site/supabase/migrations/20260508000008_rls.sql`

- [ ] **Step 1: Write the migration**

```sql
-- Enable RLS on all public tables
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

-- USERS: anyone reads (public profiles); user updates own row; admins update any
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

-- CATEGORIES + SUBFORUMS: read all; only admins write
create policy categories_select_all on public.categories for select using (true);
create policy categories_admin_all on public.categories for all
  using (public.current_user_role() = 'admin')
  with check (public.current_user_role() = 'admin');

create policy subforums_select_all on public.subforums for select using (true);
create policy subforums_admin_all on public.subforums for all
  using (public.current_user_role() = 'admin')
  with check (public.current_user_role() = 'admin');

-- THREADS: anyone reads non-deleted (and mods see deleted)
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

-- POSTS
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

-- POST_EDITS: read all (transparency); insert via trigger or own edit
create policy post_edits_select_all on public.post_edits for select using (true);
create policy post_edits_insert_self on public.post_edits for insert
  with check (auth.uid() = edited_by);

-- THANKS: read all; insert/delete self
create policy thanks_select_all on public.thanks for select using (true);
create policy thanks_insert_self on public.thanks for insert
  with check (auth.uid() = user_id and public.current_user_active());
create policy thanks_delete_self on public.thanks for delete
  using (auth.uid() = user_id);

-- NOTIFICATIONS: read/update own only
create policy notifications_select_own on public.notifications for select
  using (auth.uid() = user_id);
create policy notifications_update_own on public.notifications for update
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- THREAD_READS: read/upsert own only
create policy thread_reads_all_own on public.thread_reads for all
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- REPORTS: insert by anyone signed-in; mods read/update
create policy reports_insert_self on public.reports for insert
  with check (auth.uid() = reporter_id and public.current_user_active());
create policy reports_select_mod on public.reports for select
  using (public.current_user_role() in ('mod', 'admin'));
create policy reports_update_mod on public.reports for update
  using (public.current_user_role() in ('mod', 'admin'));

-- MOD_LOG: insert by mods+ (server-side); read by mods+
create policy mod_log_select_mod on public.mod_log for select
  using (public.current_user_role() in ('mod', 'admin'));
create policy mod_log_insert_mod on public.mod_log for insert
  with check (public.current_user_role() in ('mod', 'admin'));

-- BANS: read by mods+; insert/update by mods+
create policy bans_select_mod on public.bans for select
  using (public.current_user_role() in ('mod', 'admin'));
create policy bans_modify_mod on public.bans for all
  using (public.current_user_role() in ('mod', 'admin'))
  with check (public.current_user_role() in ('mod', 'admin'));
```

- [ ] **Step 2: Apply + commit**

```bash
npm run db:reset
git add forums-site/supabase/migrations/20260508000008_rls.sql
git commit -m "db(forums): RLS policies"
```

---

### Task 2.9: Migration — storage buckets + policies

**Files:**
- Create: `forums-site/supabase/migrations/20260508000009_storage.sql`

- [ ] **Step 1: Write the migration**

```sql
insert into storage.buckets (id, name, public)
  values ('avatars', 'avatars', true)
  on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
  values ('post-images', 'post-images', true)
  on conflict (id) do nothing;

-- Avatars: users upload to a folder named with their uid
create policy "avatars_select_public" on storage.objects for select
  using (bucket_id = 'avatars');

create policy "avatars_insert_self" on storage.objects for insert
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "avatars_update_self" on storage.objects for update
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "avatars_delete_self" on storage.objects for delete
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Post images: same pattern
create policy "post_images_select_public" on storage.objects for select
  using (bucket_id = 'post-images');

create policy "post_images_insert_self" on storage.objects for insert
  with check (
    bucket_id = 'post-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "post_images_delete_self" on storage.objects for delete
  using (
    bucket_id = 'post-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
```

- [ ] **Step 2: Apply + commit**

```bash
npm run db:reset
git add forums-site/supabase/migrations/20260508000009_storage.sql
git commit -m "db(forums): storage buckets + RLS"
```

---

### Task 2.10: Seed — default categories + subforums

**Files:**
- Create: `forums-site/supabase/seed.sql`

- [ ] **Step 1: Write the seed**

```sql
insert into public.categories (name, slug, position) values
  ('Discussion', 'discussion', 0),
  ('Help & Support', 'help', 1),
  ('Off-topic', 'off-topic', 2)
on conflict (slug) do nothing;

insert into public.subforums (category_id, name, slug, description, position) values
  ((select id from public.categories where slug = 'discussion'),
   'General', 'general', 'Anything Poke-related.', 0),
  ((select id from public.categories where slug = 'discussion'),
   'Tips & Tricks', 'tips', 'Workflows, prompts, and clever uses.', 1),
  ((select id from public.categories where slug = 'help'),
   'Questions', 'questions', 'Ask the community.', 0),
  ((select id from public.categories where slug = 'help'),
   'Bug Reports', 'bugs', 'Issues with Poke (community-tracked, not official).', 1),
  ((select id from public.categories where slug = 'off-topic'),
   'Lounge', 'lounge', 'Anything goes.', 0)
on conflict (slug) do nothing;
```

- [ ] **Step 2: Apply with reset (seed runs after migrations)**

```bash
npm run db:reset
```

- [ ] **Step 3: Verify in Studio that 3 categories + 5 subforums exist**

- [ ] **Step 4: Commit**

```bash
git add forums-site/supabase/seed.sql
git commit -m "db(forums): seed default categories + subforums"
```

---

### Task 2.11: Generate TypeScript types from schema

**Files:**
- Modify: `forums-site/lib/types.ts` (overwritten by codegen)

- [ ] **Step 1: Generate types**

```bash
npm run db:types
# Overwrites lib/types.ts with the real Database type
```

- [ ] **Step 2: Verify build still passes**

```bash
npm run build
```

- [ ] **Step 3: Commit**

```bash
git add forums-site/lib/types.ts
git commit -m "chore(forums): generate DB types from schema"
```

---

### Task 2.12: DB tests — triggers (post numbers + counters)

**Files:**
- Create: `forums-site/tests/db/triggers.test.ts`

- [ ] **Step 1: Write a tiny SQL helper for tests**

Create `forums-site/tests/db/helpers.ts`:

```ts
import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL ?? 'http://127.0.0.1:54321';
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export const admin = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

export async function makeUser(username: string) {
  const { data, error } = await admin.auth.admin.createUser({
    email: `${username}@test.local`,
    password: 'test-password-123',
    email_confirm: true,
  });
  if (error) throw error;
  await admin.from('users').update({ username }).eq('id', data.user!.id);
  return data.user!.id;
}

export async function reset() {
  // Reset uses CLI; here we just truncate for speed across tests.
  await admin.from('posts').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  await admin.from('threads').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  // user/category/subforum left alone — seeded
}
```

- [ ] **Step 2: Write the failing test**

`tests/db/triggers.test.ts`:

```ts
import { describe, it, expect, beforeAll } from 'vitest';
import { admin, makeUser, reset } from './helpers';

describe('post triggers', () => {
  let userId: string;
  let subforumId: number;

  beforeAll(async () => {
    await reset();
    userId = await makeUser('trigger_test_user');
    const { data } = await admin.from('subforums').select('id').eq('slug', 'general').single();
    subforumId = data!.id;
  });

  it('assigns sequential post_numbers within a thread', async () => {
    const { data: thread } = await admin.from('threads').insert({
      subforum_id: subforumId, author_id: userId, title: 'Test', slug: 'test-' + Date.now(),
    }).select().single();

    const { data: p1 } = await admin.from('posts').insert({
      thread_id: thread!.id, author_id: userId, body_md: 'one', body_html: '<p>one</p>',
    }).select().single();
    const { data: p2 } = await admin.from('posts').insert({
      thread_id: thread!.id, author_id: userId, body_md: 'two', body_html: '<p>two</p>',
    }).select().single();

    expect(p1!.post_number).toBe(1);
    expect(p2!.post_number).toBe(2);
  });

  it('bumps user.post_count and clears probation at 5', async () => {
    const id = await makeUser('probation_test');
    const { data: thread } = await admin.from('threads').insert({
      subforum_id: subforumId, author_id: id, title: 'P', slug: 'p-' + Date.now(),
    }).select().single();

    for (let i = 0; i < 5; i++) {
      await admin.from('posts').insert({
        thread_id: thread!.id, author_id: id, body_md: `m${i}`, body_html: `<p>${i}</p>`,
      });
    }

    const { data: user } = await admin.from('users').select('post_count, is_probationary').eq('id', id).single();
    expect(user!.post_count).toBeGreaterThanOrEqual(5);
    expect(user!.is_probationary).toBe(false);
  });
});
```

- [ ] **Step 3: Run with local Supabase env**

```bash
npm run db:start  # starts local supabase
SUPABASE_SERVICE_ROLE_KEY=$(npx supabase status --output json | jq -r .service_role_key) \
  npm run test -- tests/db/triggers.test.ts
# Expected: PASS
```

- [ ] **Step 4: Commit**

```bash
git add forums-site/tests/db/
git commit -m "test(forums): triggers — post numbers + probation clear"
```

---

## Phase 3 — Auth

### Task 3.1: Configure OAuth providers (manual, dev project)

**No code changes — instructions for the engineer.**

- [ ] **Step 1: Discord** — at https://discord.com/developers/applications, create app, OAuth2 → Add redirect: `<dev-project-url>/auth/v1/callback`. Copy Client ID + Secret.
- [ ] **Step 2: Google** — Cloud Console → OAuth credentials → Web app → Authorized redirect URIs: `<dev-project-url>/auth/v1/callback`. Copy Client ID + Secret.
- [ ] **Step 3: Apple** — Apple Developer → Service ID → enable Sign in with Apple → Return URL: `<dev-project-url>/auth/v1/callback`. Generate key, download p8.
- [ ] **Step 4: Supabase Dashboard** — for the dev project, **Authentication → Providers**:
  - Enable Discord, Google, Apple, Email.
  - Paste each provider's credentials.
  - Email provider: enable "Confirm email".
- [ ] **Step 5: Add Site URL + Redirect URLs** — Authentication → URL Configuration:
  - Site URL: `http://localhost:3002`
  - Redirect URLs: `http://localhost:3002/auth/callback`

(No commit — this is dashboard config.)

---

### Task 3.2: Auth callback route

**Files:**
- Create: `forums-site/app/auth/callback/route.ts`

- [ ] **Step 1: Write the route**

```ts
import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const next = url.searchParams.get('next') ?? '/';

  if (code) {
    const supabase = createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      return NextResponse.redirect(new URL(`/login?error=${encodeURIComponent(error.message)}`, url.origin));
    }
  }
  return NextResponse.redirect(new URL(next, url.origin));
}
```

- [ ] **Step 2: Commit**

```bash
git add forums-site/app/auth/callback/route.ts
git commit -m "feat(forums): auth callback route"
```

---

### Task 3.3: Login + signup pages

**Files:**
- Create: `forums-site/app/login/page.tsx`
- Create: `forums-site/app/signup/page.tsx`
- Create: `forums-site/components/ui/Button.tsx`
- Create: `forums-site/components/ui/Input.tsx`
- Create: `forums-site/components/ui/FormError.tsx`

- [ ] **Step 1: Minimal Button**

```tsx
// components/ui/Button.tsx
import { forwardRef, ButtonHTMLAttributes } from 'react';
import clsx from 'clsx';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
}

const styles: Record<Variant, string> = {
  primary: 'bg-[var(--accent)] text-white hover:opacity-90',
  secondary: 'bg-[var(--bg-elev-2)] text-[var(--fg)] border border-[var(--border)] hover:bg-[var(--bg-elev-1)]',
  ghost: 'text-[var(--fg-muted)] hover:text-[var(--fg)]',
  danger: 'bg-[var(--danger)] text-white hover:opacity-90',
};

export const Button = forwardRef<HTMLButtonElement, Props>(({ variant = 'primary', className, ...rest }, ref) => (
  <button
    ref={ref}
    className={clsx('px-3 py-2 rounded text-sm font-medium transition disabled:opacity-50', styles[variant], className)}
    {...rest}
  />
));
Button.displayName = 'Button';
```

(Install clsx: `npm install clsx`.)

- [ ] **Step 2: Input + FormError**

```tsx
// components/ui/Input.tsx
import { forwardRef, InputHTMLAttributes } from 'react';
import clsx from 'clsx';

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...rest }, ref) => (
    <input
      ref={ref}
      className={clsx(
        'w-full px-3 py-2 rounded bg-[var(--bg-elev-2)] border border-[var(--border)]',
        'text-[var(--fg)] placeholder:text-[var(--fg-subtle)] outline-none',
        'focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-glow)]',
        className,
      )}
      {...rest}
    />
  ),
);
Input.displayName = 'Input';
```

```tsx
// components/ui/FormError.tsx
export function FormError({ message }: { message?: string | null }) {
  if (!message) return null;
  return <p className="text-sm text-[var(--danger)]">{message}</p>;
}
```

- [ ] **Step 3: Login page**

```tsx
// app/login/page.tsx
'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/browser';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { FormError } from '@/components/ui/FormError';

export default function LoginPage() {
  const router = useRouter();
  const params = useSearchParams();
  const supabase = createClient();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState<string | null>(params.get('error'));
  const [busy, setBusy] = useState(false);

  async function emailLogin(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) setErr(error.message);
    else router.push('/');
  }

  async function oauth(provider: 'discord' | 'google' | 'apple') {
    const redirectTo = `${location.origin}/auth/callback`;
    await supabase.auth.signInWithOAuth({ provider, options: { redirectTo } });
  }

  return (
    <main className="max-w-sm mx-auto py-16 space-y-6">
      <h1 className="text-2xl font-semibold">Sign in to Poke Forums</h1>

      <div className="space-y-2">
        <Button variant="secondary" className="w-full" onClick={() => oauth('discord')}>
          Continue with Discord
        </Button>
        <Button variant="secondary" className="w-full" onClick={() => oauth('google')}>
          Continue with Google
        </Button>
        <Button variant="secondary" className="w-full" onClick={() => oauth('apple')}>
          Continue with Apple
        </Button>
      </div>

      <div className="text-center text-xs text-[var(--fg-muted)]">or with email</div>

      <form onSubmit={emailLogin} className="space-y-3">
        <Input type="email" placeholder="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <Input type="password" placeholder="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        <FormError message={err} />
        <Button type="submit" className="w-full" disabled={busy}>
          {busy ? 'Signing in…' : 'Sign in'}
        </Button>
      </form>

      <p className="text-sm text-[var(--fg-muted)] text-center">
        New here? <Link href="/signup" className="text-[var(--accent)]">Create an account</Link>
      </p>
    </main>
  );
}
```

- [ ] **Step 4: Signup page (mirror; uses signUp + magic verification)**

```tsx
// app/signup/page.tsx
'use client';

import { useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/browser';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { FormError } from '@/components/ui/FormError';

export default function SignupPage() {
  const supabase = createClient();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    const { error } = await supabase.auth.signUp({
      email, password,
      options: { emailRedirectTo: `${location.origin}/auth/callback?next=/onboarding` },
    });
    setBusy(false);
    if (error) setErr(error.message);
    else setDone(true);
  }

  if (done) {
    return (
      <main className="max-w-sm mx-auto py-16">
        <h1 className="text-2xl font-semibold mb-4">Check your email</h1>
        <p className="text-[var(--fg-muted)]">We sent a verification link to {email}. Click it to finish signing up.</p>
      </main>
    );
  }

  return (
    <main className="max-w-sm mx-auto py-16 space-y-6">
      <h1 className="text-2xl font-semibold">Create your account</h1>

      <form onSubmit={submit} className="space-y-3">
        <Input type="email" placeholder="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <Input
          type="password"
          placeholder="password (min 8)"
          minLength={8}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        <FormError message={err} />
        <Button type="submit" className="w-full" disabled={busy}>
          {busy ? 'Creating…' : 'Create account'}
        </Button>
      </form>

      <p className="text-sm text-[var(--fg-muted)] text-center">
        Have one? <Link href="/login" className="text-[var(--accent)]">Sign in</Link>
      </p>

      <p className="text-xs text-[var(--fg-subtle)] text-center">
        Or use OAuth from the <Link href="/login" className="underline">sign-in page</Link>.
      </p>
    </main>
  );
}
```

- [ ] **Step 5: Commit**

```bash
git add forums-site/app/{login,signup}/page.tsx forums-site/components/ui/
git commit -m "feat(forums): login + signup pages with OAuth + email"
```

---

### Task 3.4: Onboarding (username picker)

**Files:**
- Create: `forums-site/app/onboarding/page.tsx`
- Create: `forums-site/lib/auth.ts`

- [ ] **Step 1: Auth helper**

```ts
// lib/auth.ts
import 'server-only';
import { createClient } from '@/lib/supabase/server';

export async function getCurrentUser() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase
    .from('users')
    .select('id, username, role, is_banned, is_probationary, avatar_url, display_name')
    .eq('id', user.id)
    .single();
  return profile ? { ...profile, email: user.email } : null;
}

export function isTemporaryUsername(username: string): boolean {
  return /^user_[0-9a-f]{8}$/.test(username);
}
```

- [ ] **Step 2: Onboarding page (server component + client form)**

```tsx
// app/onboarding/page.tsx
import { redirect } from 'next/navigation';
import { getCurrentUser, isTemporaryUsername } from '@/lib/auth';
import { OnboardingForm } from './form';

export default async function OnboardingPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  if (!isTemporaryUsername(user.username)) redirect('/');

  return (
    <main className="max-w-sm mx-auto py-16 space-y-4">
      <h1 className="text-2xl font-semibold">Pick a username</h1>
      <p className="text-sm text-[var(--fg-muted)]">
        3–20 characters, lowercase letters, numbers, and underscores. This is permanent for v1.
      </p>
      <OnboardingForm />
    </main>
  );
}
```

```tsx
// app/onboarding/form.tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/browser';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { FormError } from '@/components/ui/FormError';

const VALID = /^[a-z0-9_]{3,20}$/;

export function OnboardingForm() {
  const router = useRouter();
  const supabase = createClient();
  const [username, setUsername] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    if (!VALID.test(username)) {
      setErr('Use 3–20 lowercase letters, numbers, or underscores.');
      return;
    }
    setBusy(true);
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase.from('users').update({ username }).eq('id', user!.id);
    setBusy(false);
    if (error) setErr(error.message.includes('duplicate') ? 'That username is taken.' : error.message);
    else router.push('/');
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <Input
        value={username}
        onChange={(e) => setUsername(e.target.value.toLowerCase())}
        placeholder="username"
        autoFocus
      />
      <FormError message={err} />
      <Button type="submit" className="w-full" disabled={busy}>
        {busy ? 'Saving…' : 'Continue'}
      </Button>
    </form>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add forums-site/app/onboarding/ forums-site/lib/auth.ts
git commit -m "feat(forums): onboarding username picker"
```

---

### Task 3.5: Banned page + middleware (session refresh, ban gate, onboarding gate)

**Files:**
- Create: `forums-site/app/banned/page.tsx`
- Create: `forums-site/middleware.ts`

- [ ] **Step 1: Banned page**

```tsx
// app/banned/page.tsx
import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';

export default async function BannedPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: ban } = await supabase
    .from('bans')
    .select('reason, expires_at, created_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  return (
    <main className="max-w-md mx-auto py-16 space-y-4">
      <h1 className="text-2xl font-semibold text-[var(--danger)]">You've been banned</h1>
      <p><strong>Reason:</strong> {ban?.reason ?? 'No reason recorded.'}</p>
      <p><strong>Expires:</strong> {ban?.expires_at ?? 'permanent'}</p>
      <p className="text-sm text-[var(--fg-muted)]">
        To appeal, email <a className="underline" href="mailto:appeals@poke-forums.example">appeals@poke-forums.example</a>.
      </p>
    </main>
  );
}
```

- [ ] **Step 2: Middleware**

```ts
// middleware.ts
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

const PUBLIC_PATHS = [
  '/login', '/signup', '/banned', '/auth/callback',
  '/api', '/_next', '/favicon.ico',
];
const ONBOARDING_BYPASS = ['/onboarding', '/api', '/auth/callback', '/_next', '/favicon.ico'];

export async function middleware(req: NextRequest) {
  const res = NextResponse.next({ request: { headers: req.headers } });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get: (name) => req.cookies.get(name)?.value,
        set: (name, value, options: CookieOptions) => res.cookies.set({ name, value, ...options }),
        remove: (name, options: CookieOptions) => res.cookies.set({ name, value: '', ...options }),
      },
    },
  );

  const { data: { user } } = await supabase.auth.getUser();
  const path = req.nextUrl.pathname;

  if (!user) return res; // anonymous browsing allowed

  const { data: profile } = await supabase
    .from('users')
    .select('username, is_banned')
    .eq('id', user.id)
    .single();

  if (profile?.is_banned && path !== '/banned' && !PUBLIC_PATHS.some((p) => path.startsWith(p))) {
    return NextResponse.redirect(new URL('/banned', req.url));
  }

  const isTemp = profile && /^user_[0-9a-f]{8}$/.test(profile.username);
  if (isTemp && !ONBOARDING_BYPASS.some((p) => path.startsWith(p))) {
    return NextResponse.redirect(new URL('/onboarding', req.url));
  }

  return res;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
```

- [ ] **Step 3: Sanity-check the flow manually**

```bash
npm run dev
# 1. Sign up with email → check inbox → click link → redirected to /onboarding
# 2. Pick username → redirected to /
# 3. Sign out → still see / (anonymous OK)
```

- [ ] **Step 4: Commit**

```bash
git add forums-site/middleware.ts forums-site/app/banned/
git commit -m "feat(forums): middleware — session refresh + ban + onboarding gates"
```

---

## Phase 4 — Visual design system

### Task 4.1: Tokens + fonts + Tailwind config

**Files:**
- Modify: `forums-site/app/globals.css`
- Modify: `forums-site/tailwind.config.ts`
- Modify: `forums-site/app/layout.tsx`

- [ ] **Step 1: Replace `globals.css`**

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

:root {
  --bg: #0a0a0c;
  --bg-elev-1: #111114;
  --bg-elev-2: #17171c;
  --border: #222228;
  --fg: #e6e6e8;
  --fg-muted: #8a8a93;
  --fg-subtle: #5a5a63;
  --accent: #a78bfa;
  --accent-strong: #7c3aed;
  --accent-glow: rgba(167, 139, 250, 0.15);
  --success: #4ade80;
  --warn: #fbbf24;
  --danger: #f87171;
}

html, body {
  background: var(--bg);
  color: var(--fg);
  font-family: var(--font-inter), ui-sans-serif, system-ui, sans-serif;
  font-size: 14px;
  line-height: 1.6;
}

.font-mono { font-family: var(--font-mono), ui-monospace, monospace; }

a { color: var(--accent); }
a:hover { color: var(--accent-strong); }

::selection { background: var(--accent-glow); color: var(--fg); }

.title-rule {
  height: 1px;
  background: linear-gradient(to right, rgba(167,139,250,0.4), transparent);
}
```

- [ ] **Step 2: Update `tailwind.config.ts`**

```ts
import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: 'var(--bg)',
        'bg-elev-1': 'var(--bg-elev-1)',
        'bg-elev-2': 'var(--bg-elev-2)',
        border: 'var(--border)',
        fg: 'var(--fg)',
        'fg-muted': 'var(--fg-muted)',
        'fg-subtle': 'var(--fg-subtle)',
        accent: 'var(--accent)',
        danger: 'var(--danger)',
        warn: 'var(--warn)',
        success: 'var(--success)',
      },
      fontFamily: {
        sans: ['var(--font-inter)', 'ui-sans-serif', 'system-ui'],
        mono: ['var(--font-mono)', 'ui-monospace', 'monospace'],
      },
    },
  },
  plugins: [],
};

export default config;
```

- [ ] **Step 3: Update `app/layout.tsx` with fonts**

```tsx
import type { Metadata } from 'next';
import { Inter, JetBrains_Mono } from 'next/font/google';
import './globals.css';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });
const mono = JetBrains_Mono({ subsets: ['latin'], variable: '--font-mono' });

export const metadata: Metadata = {
  title: 'Poke Forums // unofficial',
  description: 'Unofficial fan-run forums for Poke. Not affiliated with Interaction Co.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${mono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
```

- [ ] **Step 4: Verify dev server renders dark**

```bash
npm run dev
# Visit http://localhost:3002 — should be dark with Inter font
```

- [ ] **Step 5: Commit**

```bash
git add forums-site/{app/globals.css,app/layout.tsx,tailwind.config.ts}
git commit -m "feat(forums): design tokens + fonts"
```

---

### Task 4.2: Chrome — Header, Footer, Container

**Files:**
- Create: `forums-site/components/chrome/{Header,Footer,Container}.tsx`
- Modify: `forums-site/app/layout.tsx`

- [ ] **Step 1: Container**

```tsx
// components/chrome/Container.tsx
export function Container({ children }: { children: React.ReactNode }) {
  return <div className="max-w-5xl mx-auto px-4 sm:px-6">{children}</div>;
}
```

- [ ] **Step 2: Header**

```tsx
// components/chrome/Header.tsx
import Link from 'next/link';
import { getCurrentUser } from '@/lib/auth';
import { Container } from './Container';
import { UserMenu } from './UserMenu';

export async function Header() {
  const user = await getCurrentUser();
  return (
    <header className="border-b border-[var(--border)] bg-[var(--bg-elev-1)]">
      <Container>
        <div className="flex items-center justify-between h-14 gap-4">
          <Link href="/" className="font-semibold text-[var(--fg)]">
            Poke Forums <span className="font-mono text-xs text-[var(--fg-muted)]">// unofficial</span>
          </Link>
          <div className="flex items-center gap-3">
            {user ? (
              <UserMenu username={user.username} avatarUrl={user.avatar_url} />
            ) : (
              <>
                <Link href="/login" className="text-sm text-[var(--fg-muted)] hover:text-[var(--fg)]">Sign in</Link>
                <Link href="/signup" className="text-sm px-3 py-1.5 rounded bg-[var(--accent)] text-white">Sign up</Link>
              </>
            )}
          </div>
        </div>
      </Container>
    </header>
  );
}
```

- [ ] **Step 3: UserMenu (client)**

```tsx
// components/chrome/UserMenu.tsx
'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/browser';
import { Avatar } from '@/components/user/Avatar';

export function UserMenu({ username, avatarUrl }: { username: string; avatarUrl: string | null }) {
  const router = useRouter();
  async function signOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push('/');
    router.refresh();
  }
  return (
    <div className="flex items-center gap-3">
      <Link href={`/u/${username}`} className="flex items-center gap-2">
        <Avatar userId={username} url={avatarUrl} size={28} />
        <span className="text-sm">{username}</span>
      </Link>
      <button onClick={signOut} className="text-xs text-[var(--fg-muted)] hover:text-[var(--fg)]">
        Sign out
      </button>
    </div>
  );
}
```

- [ ] **Step 4: Footer**

```tsx
// components/chrome/Footer.tsx
import { Container } from './Container';

export function Footer() {
  return (
    <footer className="border-t border-[var(--border)] mt-16 py-8">
      <Container>
        <p className="text-xs text-[var(--fg-muted)] text-center">
          Unofficial fan-run forums. Not affiliated with Interaction Co. or Poke.
        </p>
      </Container>
    </footer>
  );
}
```

- [ ] **Step 5: Wire into `app/layout.tsx`**

Replace the `<body>` content:

```tsx
<body>
  <Header />
  <main>{children}</main>
  <Footer />
</body>
```

(Add the imports at top.)

- [ ] **Step 6: Commit**

```bash
git add forums-site/components/chrome/ forums-site/app/layout.tsx
git commit -m "feat(forums): header, footer, container"
```

---

### Task 4.3: Identicon + Avatar

**Files:**
- Create: `forums-site/lib/identicon.ts`
- Create: `forums-site/components/user/Identicon.tsx`
- Create: `forums-site/components/user/Avatar.tsx`
- Create: `forums-site/tests/unit/identicon.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// tests/unit/identicon.test.ts
import { describe, it, expect } from 'vitest';
import { identiconCells } from '@/lib/identicon';

describe('identiconCells', () => {
  it('produces a deterministic 5x5 grid for the same input', () => {
    expect(identiconCells('alice')).toEqual(identiconCells('alice'));
  });

  it('is symmetric across the vertical axis', () => {
    const cells = identiconCells('bob');
    for (let r = 0; r < 5; r++) {
      expect(cells[r][0]).toBe(cells[r][4]);
      expect(cells[r][1]).toBe(cells[r][3]);
    }
  });

  it('produces different patterns for different inputs', () => {
    expect(identiconCells('alice')).not.toEqual(identiconCells('bob'));
  });
});
```

- [ ] **Step 2: Run — should fail (function doesn't exist)**

```bash
npm test
```

- [ ] **Step 3: Write `lib/identicon.ts`**

```ts
function hash(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function identiconCells(seed: string): boolean[][] {
  const grid: boolean[][] = [];
  let h = hash(seed);
  for (let r = 0; r < 5; r++) {
    const row: boolean[] = [];
    for (let c = 0; c < 3; c++) {
      h = Math.imul(h, 16777619) ^ (r * 5 + c);
      row.push((h & 1) === 1);
    }
    grid.push([row[0], row[1], row[2], row[1], row[0]]);
  }
  return grid;
}
```

- [ ] **Step 4: Run — should pass**

```bash
npm test
```

- [ ] **Step 5: Identicon SVG component**

```tsx
// components/user/Identicon.tsx
import { identiconCells } from '@/lib/identicon';

export function Identicon({ seed, size = 64 }: { seed: string; size?: number }) {
  const cells = identiconCells(seed);
  const cell = size / 5;
  return (
    <svg width={size} height={size} viewBox="0 0 5 5" className="rounded">
      <rect width="5" height="5" fill="var(--bg-elev-2)" />
      {cells.map((row, r) =>
        row.map((on, c) => on && (
          <rect key={`${r}-${c}`} x={c} y={r} width={1} height={1} fill="var(--accent)" />
        )),
      )}
    </svg>
  );
}
```

- [ ] **Step 6: Avatar wrapper**

```tsx
// components/user/Avatar.tsx
import Image from 'next/image';
import { Identicon } from './Identicon';

export function Avatar({ userId, url, size = 64 }: { userId: string; url: string | null; size?: number }) {
  if (url) {
    return (
      <Image
        src={url}
        alt=""
        width={size}
        height={size}
        className="rounded object-cover"
      />
    );
  }
  return <Identicon seed={userId} size={size} />;
}
```

- [ ] **Step 7: Commit**

```bash
git add forums-site/lib/identicon.ts forums-site/components/user/ forums-site/tests/unit/identicon.test.ts
git commit -m "feat(forums): identicon + avatar"
```

---

### Task 4.4: RoleBadge, UserChip, relative-time helper

**Files:**
- Create: `forums-site/components/user/RoleBadge.tsx`
- Create: `forums-site/components/user/UserChip.tsx`
- Create: `forums-site/lib/time.ts`
- Create: `forums-site/tests/unit/time.test.ts`

- [ ] **Step 1: Failing test for time**

```ts
// tests/unit/time.test.ts
import { describe, it, expect } from 'vitest';
import { relativeTime } from '@/lib/time';

describe('relativeTime', () => {
  const now = new Date('2026-05-08T12:00:00Z');
  it('< 60s → "just now"', () => {
    expect(relativeTime(new Date('2026-05-08T11:59:30Z'), now)).toBe('just now');
  });
  it('< 60m → "Nm ago"', () => {
    expect(relativeTime(new Date('2026-05-08T11:55:00Z'), now)).toBe('5m ago');
  });
  it('< 24h → "Nh ago"', () => {
    expect(relativeTime(new Date('2026-05-08T09:00:00Z'), now)).toBe('3h ago');
  });
  it('< 30d → "Nd ago"', () => {
    expect(relativeTime(new Date('2026-05-05T12:00:00Z'), now)).toBe('3d ago');
  });
  it('older → ISO date', () => {
    expect(relativeTime(new Date('2025-11-01T12:00:00Z'), now)).toBe('2025-11-01');
  });
});
```

- [ ] **Step 2: Implement**

```ts
// lib/time.ts
export function relativeTime(when: Date | string, now: Date = new Date()): string {
  const w = typeof when === 'string' ? new Date(when) : when;
  const diffSec = Math.max(0, Math.floor((now.getTime() - w.getTime()) / 1000));
  if (diffSec < 60) return 'just now';
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
  if (diffSec < 86400 * 30) return `${Math.floor(diffSec / 86400)}d ago`;
  return w.toISOString().slice(0, 10);
}
```

- [ ] **Step 3: Run — should pass**

```bash
npm test
```

- [ ] **Step 4: RoleBadge + UserChip**

```tsx
// components/user/RoleBadge.tsx
const styles = {
  user: '',
  mod: 'text-[var(--accent)]',
  admin: 'text-[var(--warn)]',
} as const;

export function RoleBadge({ role }: { role: 'user' | 'mod' | 'admin' }) {
  if (role === 'user') return null;
  return <span className={`font-mono text-[10px] uppercase ${styles[role]}`}>[{role}]</span>;
}
```

```tsx
// components/user/UserChip.tsx
import Link from 'next/link';
import { Avatar } from './Avatar';
import { RoleBadge } from './RoleBadge';

export function UserChip({
  username, role, avatarUrl, size = 24,
}: {
  username: string;
  role: 'user' | 'mod' | 'admin';
  avatarUrl: string | null;
  size?: number;
}) {
  return (
    <Link href={`/u/${username}`} className="flex items-center gap-1.5 hover:underline">
      <Avatar userId={username} url={avatarUrl} size={size} />
      <span className="text-sm">{username}</span>
      <RoleBadge role={role} />
    </Link>
  );
}
```

- [ ] **Step 5: Commit**

```bash
git add forums-site/lib/time.ts forums-site/components/user/{RoleBadge,UserChip}.tsx forums-site/tests/unit/time.test.ts
git commit -m "feat(forums): role badge, user chip, time helper"
```

---

## Phase 5 — Read pages

### Task 5.1: Home page (categories + subforums)

**Files:**
- Modify: `forums-site/app/page.tsx`

- [ ] **Step 1: Replace `app/page.tsx`**

```tsx
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { Container } from '@/components/chrome/Container';
import { relativeTime } from '@/lib/time';

export const dynamic = 'force-dynamic';

export default async function HomePage() {
  const supabase = createClient();

  const { data: categories } = await supabase
    .from('categories')
    .select('id, name, slug, subforums:subforums(id, name, slug, description, position)')
    .order('position');

  return (
    <Container>
      <div className="py-8 space-y-8">
        <div>
          <h1 className="text-2xl font-semibold">Poke Forums</h1>
          <div className="title-rule mt-2" />
        </div>

        {(categories ?? []).map((cat) => (
          <section key={cat.id}>
            <h2 className="text-xs font-mono uppercase text-[var(--fg-muted)] mb-2">{cat.name}</h2>
            <ul className="rounded border border-[var(--border)] divide-y divide-[var(--border)]">
              {(cat.subforums as any[])
                .slice()
                .sort((a, b) => a.position - b.position)
                .map((sf) => (
                  <li key={sf.id} className="p-4 hover:bg-[var(--bg-elev-1)]">
                    <Link href={`/f/${sf.slug}`} className="font-medium text-[var(--fg)]">
                      {sf.name}
                    </Link>
                    {sf.description && (
                      <p className="text-sm text-[var(--fg-muted)] mt-1">{sf.description}</p>
                    )}
                  </li>
                ))}
            </ul>
          </section>
        ))}
      </div>
    </Container>
  );
}
```

- [ ] **Step 2: Verify visually**

```bash
npm run dev
# Visit / — should see seeded categories + subforums
```

- [ ] **Step 3: Commit**

```bash
git add forums-site/app/page.tsx
git commit -m "feat(forums): home page — category + subforum list"
```

---

### Task 5.2: Subforum page (thread list)

**Files:**
- Create: `forums-site/app/f/[subforum]/page.tsx`

- [ ] **Step 1: Write the page**

```tsx
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { Container } from '@/components/chrome/Container';
import { UserChip } from '@/components/user/UserChip';
import { relativeTime } from '@/lib/time';

const PAGE_SIZE = 25;
export const dynamic = 'force-dynamic';

export default async function SubforumPage({
  params, searchParams,
}: {
  params: { subforum: string };
  searchParams: { page?: string };
}) {
  const supabase = createClient();
  const page = Math.max(1, parseInt(searchParams.page ?? '1', 10) || 1);

  const { data: subforum } = await supabase
    .from('subforums')
    .select('id, name, description, is_locked')
    .eq('slug', params.subforum)
    .single();
  if (!subforum) notFound();

  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  const { data: threads, count } = await supabase
    .from('threads')
    .select(
      `id, title, slug, post_count, last_post_at, is_pinned, is_locked,
       author:users!threads_author_id_fkey(username, role, avatar_url),
       last_user:users!threads_last_post_user_id_fkey(username, role, avatar_url)`,
      { count: 'exact' },
    )
    .eq('subforum_id', subforum.id)
    .eq('is_deleted', false)
    .order('is_pinned', { ascending: false })
    .order('last_post_at', { ascending: false })
    .range(from, to);

  const totalPages = Math.max(1, Math.ceil((count ?? 0) / PAGE_SIZE));

  return (
    <Container>
      <div className="py-6 space-y-4">
        <div className="flex items-end justify-between">
          <div>
            <h1 className="text-xl font-semibold">{subforum.name}</h1>
            {subforum.description && <p className="text-sm text-[var(--fg-muted)]">{subforum.description}</p>}
            <div className="title-rule mt-2" />
          </div>
          {!subforum.is_locked && (
            <Link
              href={`/f/${params.subforum}/new`}
              className="text-sm px-3 py-1.5 rounded bg-[var(--accent)] text-white"
            >
              New thread
            </Link>
          )}
        </div>

        <ul className="rounded border border-[var(--border)] divide-y divide-[var(--border)]">
          {(threads ?? []).map((t: any) => (
            <li key={t.id} className="p-4 flex items-center justify-between gap-4">
              <div className="min-w-0">
                <Link href={`/t/${t.id}`} className="font-medium hover:underline">
                  {t.is_pinned && <span className="mr-1">📌</span>}
                  {t.is_locked && <span className="mr-1">🔒</span>}
                  {t.title}
                </Link>
                <div className="mt-1 text-xs text-[var(--fg-muted)] flex items-center gap-2">
                  <span>by</span>
                  <UserChip username={t.author.username} role={t.author.role} avatarUrl={t.author.avatar_url} size={16} />
                </div>
              </div>
              <div className="text-right">
                <div className="font-mono text-xs text-[var(--fg-muted)]">{t.post_count} replies</div>
                <div className="text-xs text-[var(--fg-muted)] mt-1">
                  {t.last_user && (
                    <>last by <span className="text-[var(--fg)]">{t.last_user.username}</span> · </>
                  )}
                  <span className="font-mono">{relativeTime(t.last_post_at)}</span>
                </div>
              </div>
            </li>
          ))}
          {(!threads || threads.length === 0) && (
            <li className="p-8 text-center text-sm text-[var(--fg-muted)]">No threads yet. Be the first.</li>
          )}
        </ul>

        {totalPages > 1 && (
          <div className="flex justify-center gap-2 font-mono text-xs">
            {Array.from({ length: totalPages }, (_, i) => i + 1).map((n) => (
              <Link
                key={n}
                href={`/f/${params.subforum}?page=${n}`}
                className={n === page ? 'text-[var(--accent)]' : 'text-[var(--fg-muted)] hover:text-[var(--fg)]'}
              >
                [{n}]
              </Link>
            ))}
          </div>
        )}
      </div>
    </Container>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add forums-site/app/f/
git commit -m "feat(forums): subforum thread list page"
```

---

### Task 5.3: Thread page (post list scaffolding)

**Files:**
- Create: `forums-site/app/t/[thread]/page.tsx`
- Create: `forums-site/components/post/PostCard.tsx`
- Create: `forums-site/components/post/PostBody.tsx` (placeholder; real markdown in Phase 6)

- [ ] **Step 1: PostBody placeholder**

```tsx
// components/post/PostBody.tsx
export function PostBody({ html }: { html: string }) {
  return <div className="prose prose-invert max-w-none" dangerouslySetInnerHTML={{ __html: html }} />;
}
```

(Phase 6 replaces this with the safe Markdown renderer; for now the DB stores pre-sanitized HTML so this is acceptable in dev.)

- [ ] **Step 2: PostCard**

```tsx
// components/post/PostCard.tsx
import Link from 'next/link';
import { Avatar } from '@/components/user/Avatar';
import { RoleBadge } from '@/components/user/RoleBadge';
import { PostBody } from './PostBody';
import { relativeTime } from '@/lib/time';

export interface PostCardData {
  id: string;
  post_number: number;
  body_html: string;
  is_deleted: boolean;
  is_hidden: boolean;
  edited_at: string | null;
  created_at: string;
  author: {
    username: string;
    role: 'user' | 'mod' | 'admin';
    avatar_url: string | null;
    post_count: number;
    created_at: string;
    signature_md: string | null;
  };
}

export function PostCard({ post, viewerIsMod = false }: { post: PostCardData; viewerIsMod?: boolean }) {
  const hidden = (post.is_deleted || post.is_hidden) && !viewerIsMod;
  return (
    <article id={`post-${post.post_number}`} className="rounded border border-[var(--border)] bg-[var(--bg-elev-1)]">
      <div className="grid grid-cols-[160px_1fr]">
        <div className="border-r border-[var(--border)] p-4 text-center space-y-2">
          <Avatar userId={post.author.username} url={post.author.avatar_url} size={64} />
          <Link href={`/u/${post.author.username}`} className="block font-medium hover:underline">
            {post.author.username}
          </Link>
          <RoleBadge role={post.author.role} />
          <div className="font-mono text-[11px] text-[var(--fg-muted)] space-y-0.5">
            <div>posts: {post.author.post_count}</div>
            <div>joined: {new Date(post.author.created_at).toISOString().slice(0, 7)}</div>
          </div>
        </div>
        <div className="p-4">
          {hidden ? (
            <div className="text-sm italic text-[var(--fg-muted)]">[Hidden]</div>
          ) : (
            <PostBody html={post.body_html} />
          )}
          {post.author.signature_md && !hidden && (
            <div className="mt-6 pt-3 border-t border-[var(--border)] text-xs text-[var(--fg-muted)]">
              {post.author.signature_md}
            </div>
          )}
        </div>
      </div>
      <div className="border-t border-[var(--border)] px-4 py-2 flex items-center justify-between">
        <div className="font-mono text-[11px] text-[var(--fg-muted)]">
          <Link href={`#post-${post.post_number}`} className="hover:text-[var(--fg)]">
            #post-{post.post_number}
          </Link>
          <span> · {relativeTime(post.created_at)}</span>
          {post.edited_at && <span> · edited {relativeTime(post.edited_at)}</span>}
        </div>
      </div>
    </article>
  );
}
```

- [ ] **Step 3: Thread page**

```tsx
// app/t/[thread]/page.tsx
import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { Container } from '@/components/chrome/Container';
import { PostCard, type PostCardData } from '@/components/post/PostCard';
import { getCurrentUser } from '@/lib/auth';

const PAGE_SIZE = 20;
export const dynamic = 'force-dynamic';

export default async function ThreadPage({
  params, searchParams,
}: {
  params: { thread: string };
  searchParams: { page?: string };
}) {
  const supabase = createClient();
  const me = await getCurrentUser();
  const page = Math.max(1, parseInt(searchParams.page ?? '1', 10) || 1);

  const { data: thread } = await supabase
    .from('threads')
    .select('id, title, is_locked, is_deleted, post_count, subforum:subforums(name, slug)')
    .eq('id', params.thread)
    .single();
  if (!thread || thread.is_deleted) notFound();

  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  const { data: posts } = await supabase
    .from('posts')
    .select(
      `id, post_number, body_html, is_deleted, is_hidden, edited_at, created_at,
       author:users!posts_author_id_fkey(username, role, avatar_url, post_count, created_at, signature_md)`,
    )
    .eq('thread_id', thread.id)
    .order('post_number')
    .range(from, to);

  const totalPages = Math.max(1, Math.ceil(thread.post_count / PAGE_SIZE));

  return (
    <Container>
      <div className="py-6 space-y-4">
        <div>
          <p className="text-xs text-[var(--fg-muted)]">
            in <a href={`/f/${(thread.subforum as any).slug}`} className="text-[var(--accent)]">{(thread.subforum as any).name}</a>
          </p>
          <h1 className="text-xl font-semibold mt-1">{thread.title}</h1>
          <div className="title-rule mt-2" />
        </div>

        <div className="space-y-4">
          {(posts ?? []).map((p) => (
            <PostCard key={p.id} post={p as unknown as PostCardData} viewerIsMod={me?.role === 'mod' || me?.role === 'admin'} />
          ))}
        </div>

        {totalPages > 1 && (
          <div className="flex justify-center gap-2 font-mono text-xs">
            {Array.from({ length: totalPages }, (_, i) => i + 1).map((n) => (
              <a
                key={n}
                href={`/t/${thread.id}?page=${n}`}
                className={n === page ? 'text-[var(--accent)]' : 'text-[var(--fg-muted)]'}
              >
                [{n}]
              </a>
            ))}
          </div>
        )}
      </div>
    </Container>
  );
}
```

- [ ] **Step 4: Commit**

```bash
git add forums-site/app/t/ forums-site/components/post/
git commit -m "feat(forums): thread page with post cards"
```

---

### Task 5.4: Profile page (basic) + 404

**Files:**
- Create: `forums-site/app/u/[username]/page.tsx`
- Create: `forums-site/app/not-found.tsx`

- [ ] **Step 1: Profile page**

```tsx
// app/u/[username]/page.tsx
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { Container } from '@/components/chrome/Container';
import { Avatar } from '@/components/user/Avatar';
import { RoleBadge } from '@/components/user/RoleBadge';
import { relativeTime } from '@/lib/time';

export const dynamic = 'force-dynamic';

export default async function ProfilePage({ params }: { params: { username: string } }) {
  const supabase = createClient();
  const { data: user } = await supabase
    .from('users')
    .select('id, username, role, avatar_url, post_count, created_at, last_seen_at, signature_md, bio')
    .eq('username', params.username)
    .single();
  if (!user) notFound();

  const { data: recent } = await supabase
    .from('posts')
    .select('id, post_number, thread_id, created_at, threads(title)')
    .eq('author_id', user.id)
    .eq('is_deleted', false)
    .eq('is_hidden', false)
    .order('created_at', { ascending: false })
    .limit(10);

  return (
    <Container>
      <div className="py-6 grid grid-cols-[200px_1fr] gap-8">
        <div className="space-y-3 text-center">
          <Avatar userId={user.username} url={user.avatar_url} size={120} />
          <div>
            <div className="font-medium">{user.username}</div>
            <RoleBadge role={user.role} />
          </div>
          <div className="font-mono text-xs text-[var(--fg-muted)] space-y-0.5">
            <div>posts: {user.post_count}</div>
            <div>joined: {new Date(user.created_at).toISOString().slice(0, 7)}</div>
            <div>last seen: {relativeTime(user.last_seen_at)}</div>
          </div>
        </div>
        <div>
          {user.bio && <p className="mb-6">{user.bio}</p>}
          <h2 className="text-sm font-semibold mb-2">Recent posts</h2>
          <ul className="space-y-1">
            {(recent ?? []).map((p: any) => (
              <li key={p.id} className="text-sm">
                <Link href={`/t/${p.thread_id}#post-${p.post_number}`} className="hover:underline">
                  {p.threads?.title}
                </Link>
                <span className="font-mono text-xs text-[var(--fg-muted)]"> · {relativeTime(p.created_at)}</span>
              </li>
            ))}
            {(!recent || recent.length === 0) && (
              <li className="text-sm text-[var(--fg-muted)]">No posts yet.</li>
            )}
          </ul>
        </div>
      </div>
    </Container>
  );
}
```

- [ ] **Step 2: 404**

```tsx
// app/not-found.tsx
import Link from 'next/link';
import { Container } from '@/components/chrome/Container';

export default function NotFound() {
  return (
    <Container>
      <div className="py-24 text-center space-y-4">
        <p className="font-mono text-xs text-[var(--fg-muted)]">404</p>
        <h1 className="text-2xl font-semibold">Not found</h1>
        <Link href="/" className="text-[var(--accent)]">Back home</Link>
      </div>
    </Container>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add forums-site/app/u/ forums-site/app/not-found.tsx
git commit -m "feat(forums): profile page + 404"
```

---

## Phase 6 — Markdown rendering

### Task 6.1: Sanitized Markdown renderer + tests

**Files:**
- Create: `forums-site/lib/markdown.ts`
- Create: `forums-site/components/ui/Markdown.tsx`
- Create: `forums-site/tests/unit/markdown.test.ts`
- Modify: `forums-site/components/post/PostBody.tsx`

- [ ] **Step 1: Failing test**

```ts
// tests/unit/markdown.test.ts
import { describe, it, expect } from 'vitest';
import { renderMarkdown } from '@/lib/markdown';

describe('renderMarkdown', () => {
  it('renders basic markdown', async () => {
    const html = await renderMarkdown('# Hello\n\nworld');
    expect(html).toContain('<h1');
    expect(html).toContain('Hello');
    expect(html).toContain('<p>world</p>');
  });

  it('strips raw script tags', async () => {
    const html = await renderMarkdown('<script>alert(1)</script>hi');
    expect(html).not.toContain('<script');
    expect(html).not.toContain('alert(1)');
  });

  it('strips event handler attributes', async () => {
    const html = await renderMarkdown('[x](javascript:alert(1))');
    expect(html).not.toContain('javascript:');
  });

  it('renders code blocks', async () => {
    const html = await renderMarkdown('```js\nconst x = 1;\n```');
    expect(html).toContain('<pre');
    expect(html).toContain('const');
  });

  it('renders blockquotes (used for quote-reply)', async () => {
    const html = await renderMarkdown('> @alice said:\n> hi');
    expect(html).toContain('<blockquote');
  });
});
```

- [ ] **Step 2: Implement `lib/markdown.ts`**

```ts
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import remarkRehype from 'remark-rehype';
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize';
import rehypeStringify from 'rehype-stringify';
import rehypeSlug from 'rehype-slug';

const schema = {
  ...defaultSchema,
  protocols: { ...defaultSchema.protocols, src: ['http', 'https'], href: ['http', 'https', 'mailto'] },
  attributes: {
    ...defaultSchema.attributes,
    code: [...(defaultSchema.attributes?.code || []), 'className'],
    span: [...(defaultSchema.attributes?.span || []), 'className'],
  },
};

export async function renderMarkdown(md: string): Promise<string> {
  const file = await unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkRehype, { allowDangerousHtml: false })
    .use(rehypeSlug)
    .use(rehypeSanitize, schema)
    .use(rehypeStringify)
    .process(md);
  return String(file);
}
```

(Install `unified remark-parse remark-rehype rehype-stringify`: `npm install unified remark-parse remark-rehype rehype-stringify`.)

- [ ] **Step 3: Run tests**

```bash
npm test -- markdown.test
# All pass
```

- [ ] **Step 4: Markdown component (RSC, async-render)**

```tsx
// components/ui/Markdown.tsx
import { renderMarkdown } from '@/lib/markdown';

export async function Markdown({ source }: { source: string }) {
  const html = await renderMarkdown(source);
  return <div className="prose prose-invert max-w-none" dangerouslySetInnerHTML={{ __html: html }} />;
}
```

- [ ] **Step 5: Replace `PostBody.tsx` to render from `body_md`**

`components/post/PostBody.tsx`:

```tsx
import { Markdown } from '@/components/ui/Markdown';

export async function PostBody({ md }: { md: string }) {
  return <Markdown source={md} />;
}
```

- [ ] **Step 6: Update `PostCard.tsx` to pass `body_md` instead of `body_html`**

Change the `PostCardData` interface to include `body_md: string` (in place of `body_html`), and the JSX from `<PostBody html={post.body_html} />` to `<PostBody md={post.body_md} />`.

Also update the thread page select clause to fetch `body_md` instead of `body_html`.

- [ ] **Step 7: Tailwind typography plugin**

```bash
npm install -D @tailwindcss/typography
```

Add to `tailwind.config.ts` plugins array:

```ts
plugins: [require('@tailwindcss/typography')],
```

- [ ] **Step 8: Verify in dev**

```bash
npm run dev
# Insert a test post via Supabase Studio with body_md = "# hi\n\n**bold**" and check render
```

- [ ] **Step 9: Commit**

```bash
git add forums-site/{lib/markdown.ts,components/ui/Markdown.tsx,components/post/PostBody.tsx,components/post/PostCard.tsx,tests/unit/markdown.test.ts,app/t,tailwind.config.ts,package.json,package-lock.json}
git commit -m "feat(forums): markdown rendering with sanitization"
```

---

## Phase 7 — Composer + write API

### Task 7.1: Slug helper + tests

**Files:**
- Create: `forums-site/lib/slug.ts`
- Create: `forums-site/tests/unit/slug.test.ts`

- [ ] **Step 1: Failing test**

```ts
// tests/unit/slug.test.ts
import { describe, it, expect } from 'vitest';
import { slugify } from '@/lib/slug';

describe('slugify', () => {
  it('lowercases and dashes', () => {
    expect(slugify('Hello World')).toBe('hello-world');
  });
  it('strips punctuation', () => {
    expect(slugify("What's up, friend?")).toBe('whats-up-friend');
  });
  it('collapses whitespace', () => {
    expect(slugify('a   b')).toBe('a-b');
  });
  it('truncates to 60 chars', () => {
    expect(slugify('a'.repeat(100)).length).toBe(60);
  });
  it('handles unicode by transliterating ASCII or stripping', () => {
    expect(slugify('café')).toMatch(/^caf-?é?|^cafe$/);
  });
});
```

- [ ] **Step 2: Implement**

```ts
// lib/slug.ts
export function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 60);
}
```

- [ ] **Step 3: Run tests + commit**

```bash
npm test -- slug.test
git add forums-site/{lib/slug.ts,tests/unit/slug.test.ts}
git commit -m "feat(forums): slugify helper"
```

---

### Task 7.2: Rate-limit helper

**Files:**
- Create: `forums-site/lib/rate-limit.ts`

- [ ] **Step 1: Implement**

```ts
// lib/rate-limit.ts
import 'server-only';
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

let _redis: Redis | null = null;
function redis() {
  if (!_redis) {
    _redis = new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL!,
      token: process.env.UPSTASH_REDIS_REST_TOKEN!,
    });
  }
  return _redis;
}

const limiters: Record<string, Ratelimit> = {};

function get(name: string, limit: number, window: `${number} ${'s' | 'm' | 'h'}`): Ratelimit {
  if (!limiters[name]) {
    limiters[name] = new Ratelimit({
      redis: redis(),
      limiter: Ratelimit.slidingWindow(limit, window),
      prefix: `ratelimit:${name}`,
    });
  }
  return limiters[name];
}

export const limits = {
  postCreate: (userId: string) => get('post-create', 10, '1 m').limit(`u:${userId}`),
  reportCreate: (userId: string) => get('report-create', 5, '1 h').limit(`u:${userId}`),
  signup: (ip: string) => get('signup', 5, '1 h').limit(`ip:${ip}`),
};
```

- [ ] **Step 2: Commit**

```bash
git add forums-site/lib/rate-limit.ts
git commit -m "feat(forums): rate-limit helper (Upstash)"
```

---

### Task 7.3: Composer component

**Files:**
- Create: `forums-site/components/post/Composer.tsx`
- Create: `forums-site/components/ui/Textarea.tsx`

- [ ] **Step 1: Textarea**

```tsx
// components/ui/Textarea.tsx
import { forwardRef, TextareaHTMLAttributes } from 'react';
import clsx from 'clsx';

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, ...rest }, ref) => (
    <textarea
      ref={ref}
      className={clsx(
        'w-full px-3 py-2 rounded bg-[var(--bg-elev-2)] border border-[var(--border)]',
        'text-[var(--fg)] placeholder:text-[var(--fg-subtle)] outline-none font-mono text-[13px]',
        'focus:border-[var(--accent)] focus:ring-2 focus:ring-[var(--accent-glow)]',
        className,
      )}
      {...rest}
    />
  ),
);
Textarea.displayName = 'Textarea';
```

- [ ] **Step 2: Composer**

```tsx
// components/post/Composer.tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { Textarea } from '@/components/ui/Textarea';
import { Input } from '@/components/ui/Input';
import { FormError } from '@/components/ui/FormError';

interface BaseProps {
  initialBody?: string;
  initialTitle?: string;
  showTitle?: boolean;
  submitLabel?: string;
  onSubmit: (data: { title?: string; body: string }) => Promise<{ error?: string; redirectTo?: string }>;
}

export function Composer({
  initialBody = '',
  initialTitle = '',
  showTitle = false,
  submitLabel = 'Post reply',
  onSubmit,
}: BaseProps) {
  const router = useRouter();
  const [title, setTitle] = useState(initialTitle);
  const [body, setBody] = useState(initialBody);
  const [tab, setTab] = useState<'write' | 'preview'>('write');
  const [previewHtml, setPreviewHtml] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function loadPreview() {
    setTab('preview');
    const res = await fetch('/api/preview', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ md: body }),
    });
    const json = await res.json();
    setPreviewHtml(json.html ?? '');
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    const res = await onSubmit({ title: showTitle ? title : undefined, body });
    setBusy(false);
    if (res.error) setErr(res.error);
    else if (res.redirectTo) router.push(res.redirectTo);
  }

  return (
    <form onSubmit={submit} className="space-y-3 rounded border border-[var(--border)] bg-[var(--bg-elev-1)] p-4">
      {showTitle && (
        <Input
          placeholder="Thread title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
          minLength={3}
          maxLength={200}
        />
      )}
      <div className="flex gap-1 text-xs">
        <button type="button" onClick={() => setTab('write')}
          className={`px-2 py-1 rounded ${tab === 'write' ? 'bg-[var(--bg-elev-2)]' : 'text-[var(--fg-muted)]'}`}>
          Write
        </button>
        <button type="button" onClick={loadPreview}
          className={`px-2 py-1 rounded ${tab === 'preview' ? 'bg-[var(--bg-elev-2)]' : 'text-[var(--fg-muted)]'}`}>
          Preview
        </button>
      </div>
      {tab === 'write' ? (
        <Textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Write something… (Markdown supported)"
          rows={8}
          required
          minLength={1}
          maxLength={50000}
        />
      ) : (
        <div
          className="prose prose-invert max-w-none border border-[var(--border)] rounded p-3 min-h-[12rem]"
          dangerouslySetInnerHTML={{ __html: previewHtml }}
        />
      )}
      <FormError message={err} />
      <div className="flex justify-end">
        <Button type="submit" disabled={busy}>
          {busy ? 'Posting…' : submitLabel}
        </Button>
      </div>
    </form>
  );
}
```

- [ ] **Step 3: Preview API route**

`app/api/preview/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { renderMarkdown } from '@/lib/markdown';
import { z } from 'zod';

export const runtime = 'nodejs';

const Body = z.object({ md: z.string().max(50000) });

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: 'Invalid input' }, { status: 400 });
  const html = await renderMarkdown(parsed.data.md);
  return NextResponse.json({ html });
}
```

- [ ] **Step 4: Commit**

```bash
git add forums-site/{components/post/Composer.tsx,components/ui/Textarea.tsx,app/api/preview}
git commit -m "feat(forums): composer with markdown preview"
```

---

### Task 7.4: New-thread flow (page + API route)

**Files:**
- Create: `forums-site/app/f/[subforum]/new/page.tsx`
- Create: `forums-site/app/api/threads/route.ts`

- [ ] **Step 1: New thread page (server component wrapping client composer)**

```tsx
// app/f/[subforum]/new/page.tsx
import { redirect, notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getCurrentUser } from '@/lib/auth';
import { Container } from '@/components/chrome/Container';
import { NewThreadForm } from './form';

export default async function NewThreadPage({ params }: { params: { subforum: string } }) {
  const me = await getCurrentUser();
  if (!me) redirect(`/login?next=/f/${params.subforum}/new`);

  const supabase = createClient();
  const { data: subforum } = await supabase
    .from('subforums')
    .select('id, name, slug, is_locked')
    .eq('slug', params.subforum)
    .single();
  if (!subforum) notFound();
  if (subforum.is_locked) redirect(`/f/${params.subforum}`);

  return (
    <Container>
      <div className="py-6 space-y-4">
        <h1 className="text-xl font-semibold">New thread in {subforum.name}</h1>
        <NewThreadForm subforumId={subforum.id} subforumSlug={subforum.slug} />
      </div>
    </Container>
  );
}
```

```tsx
// app/f/[subforum]/new/form.tsx
'use client';
import { Composer } from '@/components/post/Composer';

export function NewThreadForm({ subforumId, subforumSlug }: { subforumId: number; subforumSlug: string }) {
  return (
    <Composer
      showTitle
      submitLabel="Create thread"
      onSubmit={async ({ title, body }) => {
        const res = await fetch('/api/threads', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ subforum_id: subforumId, title, body_md: body }),
        });
        const json = await res.json();
        if (!res.ok) return { error: json.error ?? 'Something went wrong' };
        return { redirectTo: `/t/${json.thread_id}` };
      }}
    />
  );
}
```

- [ ] **Step 2: POST /api/threads**

```ts
// app/api/threads/route.ts
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { renderMarkdown } from '@/lib/markdown';
import { slugify } from '@/lib/slug';
import { limits } from '@/lib/rate-limit';

export const runtime = 'nodejs';

const Body = z.object({
  subforum_id: z.number().int().positive(),
  title: z.string().min(3).max(200),
  body_md: z.string().min(1).max(50_000),
});

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: 'Invalid input' }, { status: 400 });

  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const rl = await limits.postCreate(user.id);
  if (!rl.success) return NextResponse.json({ error: 'Rate limited. Slow down.' }, { status: 429 });

  const { subforum_id, title, body_md } = parsed.data;
  const body_html = await renderMarkdown(body_md);
  const baseSlug = slugify(title) || `thread-${Date.now()}`;
  const slug = `${baseSlug}-${Date.now().toString(36)}`;

  const { data: thread, error: threadErr } = await supabase
    .from('threads')
    .insert({ subforum_id, author_id: user.id, title, slug })
    .select('id')
    .single();
  if (threadErr || !thread) {
    return NextResponse.json({ error: threadErr?.message ?? 'Failed to create thread' }, { status: 400 });
  }

  const { error: postErr } = await supabase
    .from('posts')
    .insert({ thread_id: thread.id, author_id: user.id, body_md, body_html });
  if (postErr) {
    // best-effort cleanup; trigger may have set post_count to 0/1
    await supabase.from('threads').delete().eq('id', thread.id);
    return NextResponse.json({ error: postErr.message }, { status: 400 });
  }

  return NextResponse.json({ thread_id: thread.id });
}
```

- [ ] **Step 3: Add NewThreadButton on subforum page**

(Already linked in Task 5.2 with `<Link href={`/f/${params.subforum}/new`}>` — verify it works end-to-end.)

- [ ] **Step 4: Manual test**

```bash
npm run dev
# Sign in → /f/general → New thread → fill in title + body → submit → redirected to /t/<id>
```

- [ ] **Step 5: Commit**

```bash
git add forums-site/app/f/ forums-site/app/api/threads/
git commit -m "feat(forums): create thread flow"
```

---

### Task 7.5: Reply flow (API route + UI hook into thread page)

**Files:**
- Create: `forums-site/app/api/threads/[id]/posts/route.ts`
- Modify: `forums-site/app/t/[thread]/page.tsx`
- Create: `forums-site/app/t/[thread]/reply.tsx`

- [ ] **Step 1: POST /api/threads/:id/posts**

```ts
// app/api/threads/[id]/posts/route.ts
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { renderMarkdown } from '@/lib/markdown';
import { limits } from '@/lib/rate-limit';

export const runtime = 'nodejs';

const Body = z.object({
  body_md: z.string().min(1).max(50_000),
  reply_to_post_id: z.string().uuid().optional(),
});

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const parsed = Body.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: 'Invalid input' }, { status: 400 });

  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const rl = await limits.postCreate(user.id);
  if (!rl.success) return NextResponse.json({ error: 'Rate limited. Slow down.' }, { status: 429 });

  const body_html = await renderMarkdown(parsed.data.body_md);

  const { data: post, error } = await supabase
    .from('posts')
    .insert({
      thread_id: params.id,
      author_id: user.id,
      body_md: parsed.data.body_md,
      body_html,
      reply_to_post_id: parsed.data.reply_to_post_id ?? null,
    })
    .select('id, post_number')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ post });
}
```

- [ ] **Step 2: Reply form (client) on thread page**

```tsx
// app/t/[thread]/reply.tsx
'use client';
import { Composer } from '@/components/post/Composer';
import { useRouter } from 'next/navigation';

export function ReplyForm({ threadId }: { threadId: string }) {
  const router = useRouter();
  return (
    <Composer
      submitLabel="Post reply"
      onSubmit={async ({ body }) => {
        const res = await fetch(`/api/threads/${threadId}/posts`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ body_md: body }),
        });
        const json = await res.json();
        if (!res.ok) return { error: json.error };
        router.refresh();
        return { redirectTo: `/t/${threadId}#post-${json.post.post_number}` };
      }}
    />
  );
}
```

- [ ] **Step 3: Render the reply form on thread page**

In `app/t/[thread]/page.tsx`, after the posts list:

```tsx
{!thread.is_locked && me && <ReplyForm threadId={thread.id} />}
{thread.is_locked && <p className="text-sm text-[var(--fg-muted)] text-center py-4">Thread locked.</p>}
{!me && <p className="text-sm text-[var(--fg-muted)] text-center py-4"><a href="/login" className="text-[var(--accent)]">Sign in</a> to reply.</p>}
```

(Add `import { ReplyForm } from './reply';` at top.)

- [ ] **Step 4: Commit**

```bash
git add forums-site/app/api/threads/ forums-site/app/t/[thread]/
git commit -m "feat(forums): reply flow"
```

---

### Task 7.6: Edit + soft-delete own post

**Files:**
- Create: `forums-site/app/api/posts/[id]/route.ts`

- [ ] **Step 1: PATCH (edit) + DELETE (soft-delete)**

```ts
// app/api/posts/[id]/route.ts
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { renderMarkdown } from '@/lib/markdown';

export const runtime = 'nodejs';

const Patch = z.object({ body_md: z.string().min(1).max(50_000) });

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const parsed = Patch.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: 'Invalid input' }, { status: 400 });

  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const { data: existing } = await supabase
    .from('posts')
    .select('author_id, body_md')
    .eq('id', params.id)
    .single();
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // Append to post_edits BEFORE updating posts (snapshot of pre-edit state)
  await supabase.from('post_edits').insert({
    post_id: params.id,
    body_md: existing.body_md,
    edited_by: user.id,
  });

  const body_html = await renderMarkdown(parsed.data.body_md);
  const { error } = await supabase
    .from('posts')
    .update({
      body_md: parsed.data.body_md,
      body_html,
      edited_at: new Date().toISOString(),
      edited_by: user.id,
    })
    .eq('id', params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const { error } = await supabase
    .from('posts')
    .update({ is_deleted: true })
    .eq('id', params.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 2: Add edit/delete buttons to PostCard for the author**

Update `components/post/PostCard.tsx` to accept `viewerId: string | null` and render a `[edit] [delete]` row in the footer when `viewerId === post.author.id`. (Implementation: small client component that handles the modal/inline-edit and posts to the API. Keep it minimal: a confirm-dialog for delete and a textarea overlay for edit.)

For edit, the simplest UX:

```tsx
// components/post/PostActions.tsx
'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

export function PostActions({ postId, initialBody }: { postId: string; initialBody: string }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [body, setBody] = useState(initialBody);

  async function save() {
    await fetch(`/api/posts/${postId}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ body_md: body }),
    });
    setEditing(false);
    router.refresh();
  }
  async function del() {
    if (!confirm('Delete this post?')) return;
    await fetch(`/api/posts/${postId}`, { method: 'DELETE' });
    router.refresh();
  }

  if (editing) {
    return (
      <div className="space-y-2">
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          className="w-full p-2 bg-[var(--bg-elev-2)] border border-[var(--border)] rounded font-mono text-[13px]"
          rows={6}
        />
        <div className="flex gap-2 text-xs">
          <button onClick={save} className="px-2 py-1 rounded bg-[var(--accent)] text-white">Save</button>
          <button onClick={() => setEditing(false)} className="px-2 py-1 text-[var(--fg-muted)]">Cancel</button>
        </div>
      </div>
    );
  }
  return (
    <div className="flex gap-2 text-[11px] font-mono text-[var(--fg-muted)]">
      <button onClick={() => setEditing(true)} className="hover:text-[var(--fg)]">[edit]</button>
      <button onClick={del} className="hover:text-[var(--danger)]">[delete]</button>
    </div>
  );
}
```

Wire `<PostActions />` into PostCard's footer when the viewer is the author. (Pass viewer id down from thread page.)

- [ ] **Step 3: Commit**

```bash
git add forums-site/app/api/posts/ forums-site/components/post/
git commit -m "feat(forums): edit + soft-delete own post (with edit history)"
```

---

### Task 7.7: e2e test — signup → create thread → reply → see in list

**Files:**
- Create: `forums-site/tests/e2e/signup-and-post.spec.ts`

- [ ] **Step 1: Write the test**

```ts
// tests/e2e/signup-and-post.spec.ts
import { test, expect } from '@playwright/test';

const RUN_ID = Date.now().toString(36);
const EMAIL = `test+${RUN_ID}@local.test`;
const USERNAME = `test_${RUN_ID.slice(-6)}`;

test('signup → onboarding → create thread → reply', async ({ page }) => {
  // This test assumes local Supabase has email auto-confirm enabled in supabase/config.toml
  // (set [auth.email] enable_confirmations = false for local dev)

  await page.goto('/signup');
  await page.fill('input[type=email]', EMAIL);
  await page.fill('input[type=password]', 'password-123');
  await page.click('button[type=submit]');

  // With email confirmations off locally, we get redirected directly into the app
  await page.waitForURL(/\/(onboarding|)$/);
  if (page.url().includes('/onboarding')) {
    await page.fill('input[placeholder=username]', USERNAME);
    await page.click('button[type=submit]');
  }
  await page.waitForURL('/');

  await page.goto('/f/general/new');
  await page.fill('input[placeholder="Thread title"]', 'Hello e2e');
  await page.fill('textarea', 'First post body');
  await page.click('button:has-text("Create thread")');

  await expect(page).toHaveURL(/\/t\/[0-9a-f-]+/);
  await expect(page.getByText('First post body')).toBeVisible();

  // Reply
  await page.fill('textarea', 'A reply');
  await page.click('button:has-text("Post reply")');
  await expect(page.getByText('A reply')).toBeVisible();
});
```

- [ ] **Step 2: Disable email confirmation locally**

In `supabase/config.toml`, find `[auth.email]` and set `enable_confirmations = false` (this is local-only).

- [ ] **Step 3: Run e2e**

```bash
npm run db:reset  # ensures clean state
npx playwright install chromium
npm run test:e2e
```

- [ ] **Step 4: Commit**

```bash
git add forums-site/tests/e2e/ forums-site/supabase/config.toml
git commit -m "test(forums): e2e signup → thread → reply"
```

---

## Phase 8 — Deploy

### Task 8.1: Apply migrations to prod Supabase

**No code changes — manual.**

- [ ] **Step 1: Link `forums-site/` to the prod project temporarily and push**

```bash
cd forums-site
npx supabase link --project-ref <prod-project-ref>
npx supabase db push
# Verify migrations 001..009 applied in dashboard
```

- [ ] **Step 2: Re-link to dev (don't accidentally push to prod again later)**

```bash
npx supabase link --project-ref <dev-project-ref>
```

- [ ] **Step 3: Run seed.sql against prod via Studio SQL editor**

Open the prod Studio → SQL Editor → paste contents of `supabase/seed.sql` → run.

- [ ] **Step 4: Configure prod OAuth providers**

Repeat Task 3.1 against prod project. Redirect URLs must include `https://poke-forums.vercel.app/auth/callback`. Each provider's app must include the prod Supabase callback `<prod-url>/auth/v1/callback`.

---

### Task 8.2: Create Vercel project

**Manual.**

- [ ] **Step 1: From Vercel dashboard → "Add New" → Project → import the GitHub repo**

- [ ] **Step 2: Set Root Directory = `forums-site`**

- [ ] **Step 3: Framework preset = Next.js**

- [ ] **Step 4: Set environment variables (from prod values):**

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `UPSTASH_REDIS_REST_URL` (create Upstash free Redis instance, paste URL)
- `UPSTASH_REDIS_REST_TOKEN`
- `NEXT_PUBLIC_SITE_URL=https://poke-forums.vercel.app`
- (Turnstile keys can be left empty — gating is added in Plan C)

- [ ] **Step 5: Deploy**

- [ ] **Step 6: Verify**

Visit `https://poke-forums.vercel.app` — should show home with seeded categories.

---

### Task 8.3: Smoke test on production

**No commits — production validation.**

- [ ] **Step 1: Sign up with a test email** → onboarding → home
- [ ] **Step 2: Create a thread** in `/f/general` → see it in the list
- [ ] **Step 3: Reply to your own thread** → see ordinal post number `#post-2`
- [ ] **Step 4: Edit your reply** → confirm "edited" line appears
- [ ] **Step 5: Soft-delete your reply** → confirm it disappears from the public view
- [ ] **Step 6: Sign in as the same user** via Discord OAuth (separate account fine) → confirm a second user can post
- [ ] **Step 7: Post a `<script>alert(1)</script>` body** → verify it does NOT execute (sanitization)
- [ ] **Step 8: Post a Markdown table** → verify it renders

---

### Task 8.4: Promote yourself to admin in prod

**Manual SQL — only admin we'll have at launch.**

- [ ] **Step 1: In prod Studio SQL Editor**

```sql
update public.users
set role = 'admin', is_probationary = false
where username = '<your-username>';
```

- [ ] **Step 2: Reload — header should show role badge implicitly via future Plan C admin tools**

---

### Task 8.5: Open the PR

- [ ] **Step 1: Push the branch**

```bash
git push -u origin feat/forums-mvp
```

- [ ] **Step 2: Open a PR titled "feat: Poke Forums MVP (Plan A)"**

```bash
gh pr create --title "feat: Poke Forums MVP (Plan A)" --body "$(cat <<'EOF'
## Summary
- Initial Poke Forums v1 (MVP slice): bootstrap, schema + RLS, four-provider auth, read pages, markdown, composer, deploy.
- Sibling app at `forums-site/`. Live at https://poke-forums.vercel.app.
- Spec: docs/superpowers/specs/2026-05-08-poke-forums-design.md
- Plan: docs/superpowers/plans/2026-05-08-poke-forums-mvp.md

## What's in
- Phases 0–8 of Plan A: working forum where users can sign up, create threads, reply, edit/delete own posts, read by anyone.

## What's not in (Plan B + Plan C follow on)
- Reactions, search, notifications, activity feed, profile settings → Plan B.
- Reports, mod tools, admin panel, full anti-spam, online-users, mobile/a11y polish → Plan C.

## Test plan
- [ ] Sign up via email + Discord + Google + Apple
- [ ] Create thread / reply / edit / soft-delete
- [ ] Verify XSS-safe markdown
- [ ] Verify ban gate (manually flip `is_banned`)
- [ ] Verify onboarding redirect for fresh signup
EOF
)"
```

---

## Self-review checklist (writer's pass)

Before handing off, the plan author runs through:

**Spec coverage** — every numbered item in the spec maps to a task in this plan OR is explicitly punted to Plan B/C:
- §1 goals/non-goals: covered by deliverable definition.
- §2 architecture: Phase 0–1.
- §3 data model: Phase 2 (full schema, all triggers, all RLS).
- §4 auth: Phase 3.
- §5 IA: Phase 5 covers `/`, `/f`, `/t`, `/u`, `/login`, `/signup`, `/onboarding`, `/banned`, `/auth/callback`. `/new`, `/search`, `/notifications`, `/settings`, `/reports`, `/admin` → Plan B/C.
- §6 visual system: Phase 4 covers tokens, fonts, post-card layout. Realtime nudges + mobile collapse → Plan C.
- §7 mod & abuse: Plan C in full (this plan only soft-deletes own posts).
- §8 deploy: Phase 8.

**Placeholder scan:** none ("TBD"/"TODO"/"add appropriate"… absent).

**Type consistency:** `posts.body_md`/`body_html` consistent across migration → API → component. `users.is_probationary` referenced in trigger and column. `current_user_role()` and `current_user_active()` used consistently in RLS.

**Open spec questions (§9 of spec) status:**
1. Initial subforum seed — answered: seed file in Task 2.10 with General/Tips/Questions/Bugs/Lounge.
2. `body_html` rendering — answered: server-side at write time, re-rendered on edit.
3. Markdown allowlist — answered: GFM + sanitize, tables yes, raw HTML no, footnotes deferred.
4. `next/image` for user uploads — yes, Supabase Storage hostname will be added to `next.config.mjs` in Task 8.2 (engineer adds when first image uploads fail).
5. CI provider — deferred to Plan C; Task 8.1 uses local CLI directly.

---

## Plan B + Plan C are NOT in this plan

After this plan ships, write Plan B (Community: reactions, search, notifications, activity feed, profile settings) and Plan C (Operations: reports, mod tools, admin panel, full anti-spam, online users, polish). Each one will follow the same brainstorm → spec → plan flow informed by what we actually learned shipping Plan A.

