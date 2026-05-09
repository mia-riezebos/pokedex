# Poke Forums — Design Spec

**Status:** Approved · brainstorm complete, ready for implementation plan
**Date:** 2026-05-08
**Owner:** @guirguispierre
**Working name:** Poke Forums (`// unofficial`)
**Scope:** v1 of an unofficial fan-run community forum for Poke (the Interaction Co. iMessage AI). Not affiliated with Interaction Co.

---

## 1. Goals & non-goals

**Goals**
- Give the Poke community an old-school discussion forum (categories → subforums → threads → linear replies) with a 2026 AI-era visual treatment.
- Zero ongoing infra babysitting: managed services only, deployable to Vercel by one person.
- Tight integration with the existing Discord community: Discord OAuth is the primary login path, but not the only one.
- Lay the schema foundation so v2 features (DMs, rich profiles, light mode, AI moderation) slot in without rewrites.

**Non-goals (v1)**
- Official affiliation with Interaction Co. — the site is fan-run and clearly disclaimed.
- DMs, rich profiles, light mode, mobile app, AI moderation, federation, public API, push notifications, email digests.
- Multi-region, multi-tenant, or self-hosting.
- Migration from any existing forum — this is greenfield.

**Success criteria for v1**
- A logged-in user can create a thread and reply within 60 seconds of first landing.
- Mods can pin, lock, delete, and ban from the post-card UI without touching SQL.
- Page load (subforum index, 25 threads) under 500ms p75 on Vercel Edge with cold cache.
- Total monthly cost stays within free tiers up to ~50k MAU.

---

## 2. Top-level architecture

A single Next.js 14 app (App Router, RSC, TypeScript, Tailwind), deployed to Vercel as a new project, talking directly to a dedicated Supabase project. No separate API server.

```
forums-site/                 (new sibling to recipes-site/)
├─ Next.js 14 (App Router, RSC, TypeScript, Tailwind)
├─ Supabase JS client + @supabase/ssr for cookie-based sessions
└─ Deployed on Vercel (free Hobby plan, poke-forums.vercel.app)

Supabase project (independent of any Pokedex services):
├─ Auth — Discord, Google, Apple, Email/password (verified)
├─ Postgres — schema in §3
├─ Row-Level Security — primary authorization mechanism
├─ Realtime — used for online-users presence and new-post indicators
└─ Storage — avatars and post image uploads (≤2 MB, image-only)

Auxiliary managed services:
├─ Upstash Redis — rate limiting (free tier)
├─ Cloudflare Turnstile — captcha on signup + probationary posting
├─ Resend — outbound mail for ban-appeal relay (Supabase handles auth emails)
└─ Sentry — error reporting (free tier)
```

**Runtime split**
- **RSC + Edge runtime** for read-heavy pages: `/`, `/f/[subforum]`, `/t/[thread]`, `/u/[username]`, `/search`. Fast, cacheable, SEO-friendly.
- **Node runtime** for write routes (composer submit, mod actions, admin) and middleware that touches Supabase admin SDK.
- **Client components** only where there is interactivity: composer with live preview, notifications bell, reactions, realtime nudge bar.

**Why no custom API tier**
- Reads: Supabase JS from RSCs is fine — RLS makes it safe to expose query semantics directly to the page.
- Writes: go through Next.js route handlers so we can run validation, rate limits, notification fan-out, and `mod_log` writes in one server-side place. RLS is defense-in-depth, not the only line.

**Independence from existing Pokedex bot**
- No Firebase. No shared services. Separate Vercel project. Separate env vars. Separate git history within the same monorepo.

---

## 3. Data model

All tables live in Supabase Postgres under the `public` schema unless noted. Full DDL with constraints, indexes, and triggers is produced as the first migration during implementation.

### 3.1 Tables

| Table | Purpose | Key columns |
|---|---|---|
| `users` | Profile data, mirrors `auth.users` 1:1 via trigger | `id` (uuid, PK = auth.users.id), `username` (citext, unique, not null), `display_name`, `avatar_url`, `bio`, `signature_md` (≤500 chars), `role` (`user` / `mod` / `admin`, default `user`), `post_count` (int, denormalized), `last_seen_at`, `is_banned` (bool), `is_probationary` (bool), `created_at` |
| `categories` | Top-level groups | `id` (serial), `name`, `slug` (unique), `position` (int) |
| `subforums` | Under categories | `id` (serial), `category_id` (FK), `name`, `slug` (unique), `description`, `position`, `is_locked` (bool) |
| `threads` | A topic | `id` (uuid), `subforum_id` (FK), `author_id` (FK users), `title`, `created_at`, `last_post_at` (denormalized), `last_post_user_id` (denormalized), `post_count` (denormalized), `is_pinned`, `is_locked`, `is_deleted` |
| `posts` | Replies and the OP (first post = `post_number 1`) | `id` (uuid), `thread_id` (FK), `author_id` (FK), `body_md` (text), `body_html` (text, rendered+sanitized cache), `post_number` (int, ordinal within thread), `reply_to_post_id` (nullable FK posts), `edited_at`, `edited_by`, `is_deleted`, `is_hidden` (bool — auto-hide pending mod review; distinct from `is_deleted`) |
| `post_edits` | Edit-history audit | `id`, `post_id` (FK), `body_md` (snapshot), `edited_by` (FK users), `edited_at` |
| `thanks` | Single "thanks" reaction | `(post_id, user_id)` composite PK, `created_at` |
| `notifications` | In-app bell | `id`, `user_id` (recipient), `type` (`reply` / `quote` / `mention` / `thanks`), `source_post_id`, `source_user_id`, `read_at`, `created_at` |
| `thread_reads` | "What's new" tracking | `(user_id, thread_id)` composite PK, `last_read_post_number`, `last_read_at` |
| `reports` | Mod queue | `id`, `post_id`, `reporter_id`, `reason` (enum), `note` (text), `status` (`open` / `resolved` / `dismissed`), `handled_by`, `handled_at`, `created_at` |
| `mod_log` | Audit trail (append-only) | `id`, `actor_id`, `action` (text enum), `target_type` (`post` / `thread` / `user` / `subforum`), `target_id`, `metadata` (jsonb), `created_at` |
| `bans` | User bans | `id`, `user_id`, `by_user_id`, `reason`, `expires_at` (nullable = permanent), `created_at` |

### 3.2 Key design decisions

- **Soft delete only.** `is_deleted` flag on threads and posts. Mods see deleted content with a strikethrough wrapper. Hard-delete is a manual SQL operation reserved for legal/PII situations.
- **Denormalized counters.** `threads.post_count`, `threads.last_post_at`, `threads.last_post_user_id`, `users.post_count` are maintained by Postgres triggers on `posts` insert/delete/soft-delete. Forum index pages hammer these on every render; recomputing them on read is too slow.
- **Ordinal post numbers per thread.** `posts.post_number` is 1-indexed within each thread, maintained by a trigger that uses `MAX(post_number) + 1` inside a per-thread `pg_advisory_xact_lock` to prevent races. URLs are `/t/<slug>#post-<n>`.
- **Search.** Generated `tsvector` columns on `threads.title` and `posts.body_md` (`to_tsvector('english', ...)`), each backed by a GIN index. One Postgres query, no external search service.
- **RLS policies.** Anyone reads non-deleted content. Authenticated users insert posts as themselves. Users update/delete their own posts/threads. Mods bypass on update/delete. Admins bypass everywhere. A `current_user_active()` SQL function returns false if the user is banned, and is referenced by every write policy.
- **Username collisions.** `username` is citext-unique. Discord OAuth tries the raw handle first; on collision, falls back to a numeric suffix.
- **Avatars + post images** live in Supabase Storage, ≤2 MB each, image MIME types only, served via signed URLs. Default avatar is a deterministic identicon generated from `users.id`.

### 3.3 Indexes (initial set)

- `posts (thread_id, post_number)` unique
- `posts (author_id, created_at desc)`
- `threads (subforum_id, is_pinned desc, last_post_at desc)`
- `threads (last_post_at desc)` (for global "Recent activity")
- `notifications (user_id, read_at, created_at desc)`
- `thread_reads (user_id, last_read_at desc)`
- GIN on `threads.tsv` and `posts.tsv`

### 3.4 Triggers

- `on_auth_user_created` → INSERT stub `public.users` row with temporary username `user_<short-id>`.
- `posts_assign_post_number` (BEFORE INSERT) → compute `post_number` as `MAX(post_number) + 1` for the thread, inside a per-thread `pg_advisory_xact_lock`. Validates `length(body_md) <= 50_000`.
- `posts_after_insert` (AFTER INSERT) → bump `threads.post_count`, `threads.last_post_at`, `threads.last_post_user_id`, `users.post_count`. Fan out notifications (reply / quote / mention).
- `posts_after_soft_delete` (AFTER UPDATE WHEN is_deleted goes false→true) → decrement the counters above.
- `users_clear_probation` (AFTER UPDATE on `users.post_count`) → if `post_count >= 5` and `is_probationary = true`, set `is_probationary = false`.

**Note:** `body_html` is rendered + sanitized in Node *before* insert (using the same `react-markdown` + `rehype-sanitize` pipeline as the read path). Postgres does not render Markdown — triggers only enforce length and ordinal post numbers.

---

## 4. Auth flow

### 4.1 Providers
All four routed through Supabase Auth: Discord OAuth, Google OAuth, Apple Sign-in, Email + password (verification required before posting).

### 4.2 First-login flow (any provider)
1. Provider redirects to `/auth/callback`. Supabase upserts `auth.users`.
2. Trigger `on_auth_user_created` inserts `public.users` with `role='user'` and a temporary `username = user_<short-id>`.
3. App middleware detects the temporary form and redirects to `/onboarding`.
4. User picks a permanent username (3–20 chars, `[a-z0-9_]`, citext-unique). Discord users get their handle pre-filled; on collision the form shows live availability.
5. Email/password users only see `/onboarding` after clicking the verification email.

### 4.3 Session handling
`@supabase/ssr` with httpOnly cookies. Next.js `middleware.ts` refreshes the session on every request, bumps `users.last_seen_at` (debounced to once per 30 s per user via a Redis SETEX), and enforces ban + onboarding redirects.

### 4.4 Authorization
- RLS policies are the source of truth for read/write permissions.
- Write route handlers re-check role server-side (defense in depth).
- Banned users (`is_banned = true`) are redirected by middleware to `/banned` for any non-public page.
- Role gates: `role IN ('mod','admin')` for mod routes; `role = 'admin'` for `/admin`.

### 4.5 Anti-spam
- **Cloudflare Turnstile** on `/signup` and on every post submission while `is_probationary = true` (i.e., the first 5 successful posts). Invisible when not flagged.
- **Rate limits** in route handlers via Upstash Redis:
  - signup: 5 / IP / hour
  - post create: 10 / user / minute
  - report: 5 / user / hour
  - thanks: 60 / user / minute
- **Probationary period.** Accounts with `is_probationary = true` (default for first 5 successful posts) get a "new user" badge on their posts; reports against them auto-hide pending review; link-only posts go straight to mod queue.
- **Disposable-email blocklist** rejected at signup.
- **Burst-rate trip.** ≥5 posts in <30s → account flagged, posting locked 10 min, mods notified.

### 4.6 Logout & deletion
- Logout: standard Supabase signOut, cookie cleared, redirect home.
- Account deletion (`/settings/delete`): soft-deletes the user row (`username` becomes `deleted_<short-id>`, posts retain content but show "[deleted user]"). Hard delete is admin SQL only.

---

## 5. UI / Information architecture

### 5.1 Global chrome
- **Top nav:** `Poke Forums // unofficial` wordmark · search box · "What's new" · notifications bell with unread badge · avatar menu (Profile · Settings · Sign out) · Login/Signup when logged out.
- **Footer:** "Unofficial fan-run forums. Not affiliated with Interaction Co. or Poke." · link to source repo · online users count + last 5 active.

### 5.2 Pages

| Route | Audience | Contents |
|---|---|---|
| `/` | everyone | Category list. Each subforum row: name, blurb, thread count, post count, last poster + relative time. Below: "Recent activity" rail (last 10 active threads, anywhere). |
| `/f/[subforum]` | everyone | Thread list, paginated 25/page. Pinned first (📌). Columns: title (with 🔒 if locked, ✦ if unread for you), author, replies, last reply (user + time). "New thread" if not locked. |
| `/t/[thread]` | everyone | Posts in order. Each post: avatar + username + role badge + post-count + join-date on the left (phpBB-style sidebar), body + signature on the right. Footer of post: timestamp · `#post-N` permalink · thanks button + count · quote-reply · edit (own) · report · mod actions (mods). 20 posts/page. Reply composer pinned at bottom. |
| `/u/[username]` | everyone | Avatar, role badge, join date, post count, last seen, signature preview, latest 10 posts/threads. |
| `/new` | logged in | "What's new" — threads with posts since `last_seen_at`, grouped by subforum. Mark-all-read. |
| `/search` | everyone | Full-text. Filters: subforum, author, date range. Highlighted snippets. |
| `/notifications` | logged in | Reverse-chrono. Unread bolded. Mark-all-read. |
| `/settings` | logged in | Profile (avatar, display name, signature). Email, password (if email auth). Delete account. |
| `/reports` | mods | Open-reports queue with snippet, reporter, reason, "View thread", resolve/dismiss. |
| `/admin` | admins | User search + role assignment. Subforum CRUD. Mod-log viewer. Banned-users list. |
| `/login`, `/signup`, `/onboarding`, `/auth/callback`, `/banned` | flow | Auth surfaces. |

### 5.3 Composer (new thread, reply, quote-reply, edit)
- Markdown textarea with toolbar: bold · italic · link · code · image · quote.
- Live preview tab using the same renderer as posts.
- Image upload posts to Supabase Storage and inserts `![](url)` at cursor.
- Quote-reply pre-fills `> @user said:\n> <body>\n\n` and sets `posts.reply_to_post_id`.

### 5.4 Notifications bell
- Top-right of nav. Unread badge.
- Dropdown shows last 10 with type icons. "See all" → `/notifications`.
- Realtime updates via Supabase Realtime channel on `notifications` filtered to current user.

### 5.5 Online-users footer
- Updated by middleware on each request via the debounced `last_seen_at` bump.
- Footer shows count plus last 5 active in past 5 min, cached server-side for 30 s.

---

## 6. Visual design system

### 6.1 Mode
Dark by default. Light mode is a stretch goal for v1 — toggle stub exists in `/settings`, the alternate palette ships only if v1 development time allows.

### 6.2 Color tokens (CSS vars consumed by Tailwind)

| Token | Value | Use |
|---|---|---|
| `--bg` | `#0a0a0c` | Page background |
| `--bg-elev-1` | `#111114` | Cards, post bodies |
| `--bg-elev-2` | `#17171c` | Composer, dropdowns |
| `--border` | `#222228` | 1 px hairlines |
| `--fg` | `#e6e6e8` | Body text |
| `--fg-muted` | `#8a8a93` | Timestamps, post numbers, metadata |
| `--fg-subtle` | `#5a5a63` | Inactive controls |
| `--accent` | gradient `#a78bfa → #7c3aed` | Links, focus rings, active tabs |
| `--accent-glow` | `rgba(167,139,250,0.15)` | Active-state backgrounds |
| `--success` | `#4ade80` | Mod success |
| `--warn` | `#fbbf24` | Soft warnings, probationary badge |
| `--danger` | `#f87171` | Bans, destructive mod actions |

### 6.3 Type
- **Body:** Inter, 14 px base, 1.6 line-height. Loaded via `next/font`.
- **Metadata, post numbers, timestamps, code:** JetBrains Mono, 12 px, `tabular-nums`.
- **Display:** Inter 600, slight negative tracking on large sizes.

### 6.4 Density & rhythm
8 px vertical rhythm; 24 px horizontal padding inside cards. Information-dense (forums are scanned) but not cramped.

### 6.5 Signature "AI era" touches (sparingly)
1. Mono metadata everywhere (`#post-427` · `2m ago` · `[mod]`) — reads like a terminal log.
2. Subtle violet glow on active states only (focused composer, just-posted post, current pagination page).
3. One-line gradient hairline (`from-accent/40 to-transparent`, 1 px) under page titles.
4. Realtime nudges: a thin violet bar slides in at the bottom of an open thread when new posts arrive — `[new] 2 new replies — click to load`. No auto-jump.
5. Identicons for default avatars — geometric, monochrome violet on dark, deterministic from `users.id`.

### 6.6 Hero component — post card

```
┌─────────────────┬─────────────────────────────────────────────┐
│ [avatar 64px]   │                                             │
│ username        │ Body text rendered from markdown.           │
│ [mod] badge     │ Code blocks in mono with --bg-elev-2 bg.    │
│                 │ Quoted blocks: left border violet, muted.   │
│ posts: 1,247    │                                             │
│ joined: Mar '26 │ ─── signature ───                           │
│                 │ user's signature (smaller, muted)           │
├─────────────────┴─────────────────────────────────────────────┤
│ #post-427 · 2m ago · edited 1m ago by mod  [♥ thanks 3] [⋯]   │
└───────────────────────────────────────────────────────────────┘
```

- Card border-radius 8 px, button border-radius 4 px.
- Hairline borders, not shadows. Shadows reserved for dropdowns/menus (one soft layer).

### 6.7 Markdown rendering
`react-markdown` + `remark-gfm` + `rehype-sanitize` with a strict allowlist (no raw HTML, no scripts). Code highlighting via `shiki` with one violet-tinted theme.

### 6.8 Mobile
Single column. Avatars shrink to 32 px and move inline with username. Composer becomes a full-screen overlay. Thread list collapses metadata into a second line.

### 6.9 Accessibility
WCAG AA contrast on all text. Keyboard-navigable composer toolbar. `prefers-reduced-motion` disables the realtime slide-in. Image uploads require alt-text.

---

## 7. Moderation & abuse handling

### 7.1 Report flow
1. Logged-in user clicks `⋯ → Report` on a post → modal with reason dropdown (`spam` / `harassment` / `off-topic` / `other → text`) plus optional note.
2. `INSERT INTO reports`. If post author is `is_probationary`, the post is auto-hidden by setting `posts.is_hidden = true` (distinct from `is_deleted`); the body is replaced in the UI with "Hidden pending mod review" until handled. Mods see the original content.
3. Mods see a count badge on `/reports`. Each row shows post snippet, reporter, reason, link to thread context.
4. Mod resolves with: `Dismiss` · `Delete post` · `Delete + warn user` · `Delete + ban`. Actions land in `mod_log`.
5. Reporter receives a notification — "Your report was reviewed" — without identifying mod or decision details.

### 7.2 Mod actions (visible inline on posts for mods)
- Edit body (rare — `edited_by != author_id` is tracked in `post_edits`)
- Soft-delete post (mods+ still see content)
- Pin/unpin thread (within its subforum)
- Lock/unlock thread
- Move thread to another subforum
- Ban user (creates a `bans` row, sets `users.is_banned`)

### 7.3 Admin-only
- Promote/demote users (set `users.role`)
- Subforum CRUD (create, rename, reorder, delete with confirmation)
- View full `mod_log` with filters
- Lift bans

### 7.4 Mod log
Append-only. Every mod/admin action writes a row with `actor_id`, `action`, `target_type`, `target_id`, `metadata` (jsonb), `created_at`. Readable for `mods+` only. No edits, no deletes via the app — admin SQL only for genuine mistakes.

### 7.5 Spam containment
- Probationary period: first 5 posts of any new account flagged via `is_probationary`. Posts get "new user" badge; reports against them auto-hide.
- Burst-rate trip (see §4.5).
- Link-only posts from probationary users go straight to mod queue (auto-hidden).
- Admin-managed domain blocklist on post body; matches auto-hide and auto-report.

### 7.6 Ban experience
- Logging in while banned redirects to `/banned` showing reason, ban length (or "permanent"), and a contact email for unban requests.
- Banned users can still read the forums (logged out) but cannot post.
- Existing posts authored before the ban remain visible (subject to reports/content review).

### 7.7 Edit history visibility
- Every edit (author or mod) appends a `post_edits` row.
- Post footer shows "edited Xm ago"; clicking opens a side panel with a diff.
- Visible to everyone — transparency is the phpBB-era trust-builder this design preserves.

### 7.8 Appeal
Out of scope for v1. `/banned` shows a contact email; appeals are handled manually via Resend-relayed mail.

### 7.9 No automated AI moderation in v1
Human-driven only. An LLM-based pre-filter (flag-but-don't-block) is a candidate for v2 and does not change the data model.

---

## 8. Deploy & ops

### 8.1 Repo layout

```
pokediscordcustomdiscordbot/
├─ src/                   (Discord bot — unchanged)
├─ recipes-site/           (existing — unchanged)
└─ forums-site/            (NEW)
   ├─ app/                 (Next.js App Router)
   ├─ components/
   ├─ lib/
   │  ├─ supabase/         (server + browser clients)
   │  ├─ rate-limit.ts     (Upstash wrapper)
   │  └─ markdown.tsx
   ├─ supabase/
   │  ├─ migrations/       (numbered SQL — checked in)
   │  └─ seed.sql          (dev fixtures)
   ├─ middleware.ts        (session refresh + bans + last_seen)
   ├─ next.config.mjs
   ├─ tailwind.config.ts
   ├─ package.json         (own deps, not hoisted)
   └─ vercel.json
```

### 8.2 Vercel
- New project `poke-forums` linked to the same git repo with **Root Directory = `forums-site/`**. The existing `recipes-site` project is untouched.
- Hobby plan to start, subdomain `poke-forums.vercel.app`. Custom domain swap is a one-click change in Vercel later.
- Preview deploys on PRs (default Vercel behavior).

### 8.3 Supabase
- Two projects: `poke-forums-prod` and `poke-forums-dev`. Both on the free tier.
- Migrations live in `forums-site/supabase/migrations/` and apply via `supabase db push` in CI on merge to `main`. No manual production SQL.

### 8.4 Environment variables (Vercel)

| Var | Where | Purpose |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | client + server | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | client + server | Anon key (RLS-bounded) |
| `SUPABASE_SERVICE_ROLE_KEY` | server only | Admin operations (never RSC) |
| `UPSTASH_REDIS_REST_URL` | server only | Rate limiting |
| `UPSTASH_REDIS_REST_TOKEN` | server only | Rate limiting |
| `TURNSTILE_SITE_KEY` | client | Captcha widget |
| `TURNSTILE_SECRET_KEY` | server only | Captcha verify |
| `RESEND_API_KEY` | server only | Ban-appeal mail relay |
| `SENTRY_DSN` | client + server | Error reporting |

### 8.5 Observability
- Vercel Analytics + Speed Insights — traffic and Core Web Vitals.
- Supabase Logs — slow queries, RLS denials, auth events.
- Sentry (free tier) — client + server errors.

### 8.6 Backups
Supabase free tier provides 7 days of point-in-time recovery — sufficient for v1. Upgrade to weekly long-term backups if/when the project moves to a paid tier.

### 8.7 Security checklist
- RLS enabled on every table; default-deny.
- Markdown sanitized via `rehype-sanitize` allowlist; no raw HTML.
- CSP header set in `next.config.mjs`.
- Turnstile on signup + probationary posting.
- Rate limits on every write route.
- Service role key never reaches the browser — verified by build-time grep in CI.
- Image uploads validated server-side (MIME, dimensions, size).

### 8.8 Cost forecast (v1, free-tier-bounded)

| Service | Tier | Cost |
|---|---|---|
| Vercel Hobby | Free | $0 |
| Supabase Free | 500 MB DB, 50k MAU | $0 |
| Upstash Redis Free | 10k commands/day | $0 |
| Cloudflare Turnstile | Free | $0 |
| Resend Free | 3k emails/mo | $0 |
| Sentry Free | 5k events/mo | $0 |
| **Total** | | **$0/month** |

First paid tier expected: Supabase Pro ($25/mo) when DB exceeds 500 MB or MAU exceeds 50k.

### 8.9 Out of scope for v1 (explicit)
DMs · rich profiles · mobile app · automated AI moderation · federation · webhooks · public API · push notifications · email digests · migration from any existing forum.

**Stretch goals (ship in v1 only if implementation time allows; otherwise punt to v2):**
- Light mode (toggle stub in `/settings` is in v1; the alternate palette is the stretch part).

---

## 9. Open implementation questions (to resolve in the plan)

These are deliberately deferred until the writing-plans step, but flagged here so they're not lost:

1. Exact initial category + subforum seed list (the user will supply these or we'll seed with `General`, `Help`, `Off-topic` and let admin edit).
2. Whether `body_html` is rendered server-side at write time (cached in DB) or per-request (re-rendered each read). Default assumption: server-side at write time, invalidated on edit.
3. Exact Markdown allowlist (tables yes, footnotes maybe, raw HTML no).
4. Whether `next/image` is allowed for user-uploaded images (it requires whitelisting Supabase Storage hostname).
5. CI provider (GitHub Actions assumed; not yet decided for migrations runner).

---

## 10. Disclaimers

The site footer must read: *"Unofficial fan-run forums. Not affiliated with Interaction Co. or Poke."* No Poke or Interaction Co. logos, brand colors, or trademarks may be used. The wordmark is text-only (`Poke Forums // unofficial`) until/unless an explicit license is granted.
