# Changelog

All notable changes to Poke Forums are recorded here.
Versioning follows roughly [semver](https://semver.org/) with public releases tagged from `main`.

---

## v0.2.0 — Quick wins (2026-05-11)

**Added**
- `last_seen_at` updater in middleware (profile shows current "last seen" instead of permanent signup date)
- Thanks button (♥/♡) on every post with optimistic UI — three-layer self-thank block (UI + API + RLS)
- Quote-reply prefill — `[quote]` button on any post → composer prefilled with `> @username said:` and `reply_to_post_id` set
- Version label + this changelog page

**Security**
- Content-Security-Policy header (env-conditional: stricter in production, dev-friendly in local)
- `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy` for camera/mic/geo/cohort
- Banned users blocked from un-thanking via RLS (`current_user_active()` check on delete policy)
- Edge runtime fix: `last_seen_at` bump uses `evt.waitUntil()` so writes survive response flush

**Fixed**
- `thanks_count` zero-case semantics in the thread page enrichment
- Quote button disabled on locked, deleted, or hidden posts (no dead-end links)
- Tooltip on a disabled Thanks button now distinguishes "Sign in" vs "Cannot thank your own post"

---

## v0.1.0 — MVP (2026-05-10)

Initial public version. Plan A of 3 (see `docs/superpowers/plans/2026-05-08-poke-forums-mvp.md`).

**Added**
- Categories → subforums → threads → linear replies
- Email + Discord OAuth signup, onboarding username picker
- Markdown rendering with sanitization (no XSS, no `javascript:` links, no raw HTML)
- Create thread, reply, edit, soft-delete own posts (with audit history)
- Profile pages, identicon avatars, role badges
- phpBB-style post card layout with author sidebar
- Full Supabase schema + Row-Level Security on all tables
- Postgres triggers for ordinal `post_number`, denormalized counters, probation clear at 5 posts
- Full-text search infrastructure (`tsvector` + GIN, not yet UI-surfaced)
- Storage buckets for avatars + post images (2 MB image-only)
- 32 tests (unit + DB triggers + Playwright e2e signup-and-post flow)

**Not in this release (Plan B + Plan C):**
- Reactions beyond Thanks, notifications bell, activity feed, search UI, profile settings, reports, mod tools, admin panel, full anti-spam.
