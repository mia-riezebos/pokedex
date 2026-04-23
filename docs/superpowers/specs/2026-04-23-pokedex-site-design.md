# Pokedex Marketing Site

**Date:** 2026-04-23
**Status:** Implemented

## Goal

Add the assets Discord requires for bot verification (Terms of Service URL, Privacy Policy URL) by extending the existing `recipes-site/` Next.js app into a small marketing/landing site for the Pokedex Discord bot.

## Non-Goals

- A separate marketing site project. We extend `recipes-site/` rather than scaffold a second app.
- New backend routes, auth, or admin features (those live in `dashboard-vercel/`).
- MDX, CMS, or i18n.
- Tests — `recipes-site/` has no test infra; this change does not introduce one.

## Design

### Routes

| Route       | Purpose                                                                 |
|-------------|-------------------------------------------------------------------------|
| `/`         | New landing page: hero, "Add to Discord" CTA, feature grid, how-it-works |
| `/recipes`  | Existing community recipes UI (moved from `/`)                          |
| `/feedback` | Existing community feedback UI (unchanged)                              |
| `/terms`    | Terms of Service (US/NY governing law, generic bot service terms)       |
| `/privacy`  | Privacy Policy (Firestore + OpenRouter disclosed; deletion rights)      |

### Shared chrome

- `components/SiteHeader.tsx` — sticky top nav with brand wordmark, links to Recipes / Feedback / Dashboard / Terms / Privacy, primary "Add to Discord" CTA. Mobile hamburger menu. Dashboard link points at the deployed `dashboard-vercel` (`https://dashboard-vercel-puce.vercel.app`) and opens in a new tab.
- `components/SiteFooter.tsx` — four-column footer (brand, product, legal, contact), copyright row, "Not affiliated with Discord Inc." disclaimer.
- Both rendered by `app/layout.tsx` so every page inherits chrome. Existing ambient orbs preserved.

### Configuration

`src/lib/constants.ts` is the single source for:
- `POKEDEX_APP_ID` — Discord application ID `1485773462927577189`
- `INVITE_PERMISSIONS` — bitmask `1632356527190` derived from actually-used Discord actions in `src/commands/` and `src/services/automod.js` (ban, kick, moderate, manage messages/channels/roles/threads, send/embed/attach/history, reactions, external emojis/stickers, mention everyone)
- `INVITE_URL` — composed OAuth2 URL with `bot+applications.commands` scopes
- `DASHBOARD_URL` — canonical Vercel URL for the admin dashboard
- `CONTACT_DISCORD_HANDLE` — `doubleanocap` (used on Terms, Privacy, footer)

### Legal pages

Plain TSX (no MDX) with a small `Section` helper. Both pages:
- Use US (New York) governing law as requested.
- List the contact channel as `@doubleanocap` on Discord (no email).
- Are written to be approvable by Discord verification reviewers — they describe the bot truthfully (Firestore storage, OpenRouter for AI, opt-in features, retention windows, deletion rights).

### Landing page sections

Hero → Features (8-card grid) → How it works (3 steps) → Live community (Recipes + Feedback teaser) → Final CTA. All content is static; nothing is fetched on the landing page.

### OG images

- `app/opengraph-image.tsx` — new generic landing-page OG (no DB read).
- `app/recipes/opengraph-image.tsx` — existing recipe-stats OG, moved from `/` to scope to `/recipes`.

### Deltas to existing pages

- `app/feedback/page.tsx` — breadcrumb "Recipes" link updated from `/` to `/recipes`; in-page footer block trimmed to just the version + refresh row (the duplicated "Powered by Pokedex" branding now lives in the global footer).
- `app/recipes/page.tsx` — same footer trim.
- `app/layout.tsx` — site-wide metadata updated from "Community Recipes" to a Pokedex-bot-level description; renders `SiteHeader` + `SiteFooter`.

## Discord verification readiness

- Terms URL: `https://pokedex-recipes.vercel.app/terms`
- Privacy URL: `https://pokedex-recipes.vercel.app/privacy`
- Landing URL (for "Privacy Policy URL" / "Terms of Service URL" / app description fields): `https://pokedex-recipes.vercel.app/`

(Once `pokedex-recipes.vercel.app` is replaced by a custom domain, only the host changes — the routes are stable.)

## Out of scope / future

- Custom domain setup.
- Per-server public pages (e.g. `/server/[id]/recipes`).
- Status page wiring (the bot has status incident features but no public status page).
