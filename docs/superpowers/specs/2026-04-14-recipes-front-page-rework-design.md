# Recipes front page rework — discovery improvements

**Date:** 2026-04-14
**Scope:** `recipes-site/` only (the standalone public Next.js site)
**Type:** UX feature; presentational only, no data model or backend changes

## Problem

The public recipes site at `recipes-site/` lands visitors straight into a grid of every approved recipe, sorted by all-time `shareCount` descending. Two discovery modes people actually want are poorly served:

1. **Trending** — what's getting shared *right now*. The current sort buries new momentum under years-old favorites with high cumulative share counts.
2. **New** — what's been added since the last visit. There is no way to see recent additions at all: no sort, no indicator, no "new" badge, and `shareCount` ordering pushes new entries to the bottom.

The page already has search, filter chips, and stats — those work and are not the problem.

## Goals

- Make "trending this week" a first-class, visible part of the page — no clicks required.
- Make "new" the default sort for the main grid, and make newness visible on every card.
- Do not break or regress the existing search, filter, stats, or theme.
- No backend changes. No schema changes. No new network calls.

## Non-goals

- Personalization, "for you" ranking, or any ML-flavored scoring.
- Sort dropdowns, tabs, or view modes. The page should expose two axes (trending + newest) simultaneously with no mode commitment from the user.
- A full redesign. The glassmorphism theme, ambient orbs, stats tiles, search, filter chips, and footer stay as-is.
- Test infrastructure for `recipes-site/`. The site has no test harness today and this spec does not introduce one; pure helpers are extracted to isolated files so they're testable if a harness lands later.
- Any changes to the Discord bot, the `pokedex-mcp` server, or the dashboard.

## Chosen structure: dual-zone layout

The page gets a new "Trending this week" row between the filter chips and the main grid. The main grid then sorts by newest-first instead of popularity.

```
┌─────────────────────────────────────┐
│ Community Recipes                   │
│ Shared by the community...          │
│ [4 stat tiles]                      │
│ [search input]                      │
│ [filter chips]                      │
│ ─────────────────────────────────── │
│ 🔥 Trending this week  (NEW)        │
│ ┌──────┐ ┌──────┐ ┌──────┐          │
│ │  #1  │ │  #2  │ │  #3  │          │
│ └──────┘ └──────┘ └──────┘          │
│ 🆕 Newest                           │
│ ┌──┐ ┌──┐ ┌──┐                      │
│ │  │ │  │ │  │ ... rest of grid    │
│ └──┘ └──┘ └──┘                      │
│ [footer]                            │
└─────────────────────────────────────┘
```

### Why this shape (not tabs, not smart-feed, not hero)

Tabs make users commit to one view. A smart single feed hides the ranking formula and is hard to tune. A big hero block eats above-the-fold space for a single recipe. The dual-zone layout puts both discovery axes on one scroll, lets each have a clear label, and collapses cleanly when the user takes explicit filtering action.

## Definitions

### "Trending this week"

For each recipe, count entries in `sharedBy[]` whose `sharedAt` is within the last 7 days (`Date.now() - new Date(s.sharedAt).getTime() < 7 * 86400 * 1000`). Sort descending by that count. Take the top 3. Drop any with a count of zero.

The trending row renders only if at least 2 recipes qualify after the drop. A single-item trending row looks broken, so hide the whole section in that case.

**Why not use `updatedAt` as a proxy:** `updatedAt` bumps on any mutation (e.g. a moderator editing tags), not only new shares. We want actual momentum, not "this doc was touched recently."

**Why not use `shareCount` of recipes created in the last 7 days:** that surfaces brand-new popular things but misses older recipes that are getting re-shared — which is exactly the "re-trending" behavior that makes a trending row interesting.

### "Newest"

Main grid sort changes from `shareCount desc` to `createdAt desc`. `createdAt` is a Firestore server timestamp written in `src/services/firestore.js:saveRecipe()` via `FieldValue.serverTimestamp()`.

**Why `createdAt` instead of `updatedAt`:** "new to us" is a clearer mental model than "reddit-style bump on reshare." Users scrolling for new things want entries they haven't seen before, not old entries that resurfaced.

### Relative timestamp on cards

A pure formatter, `formatRelativeTime(value)`, returns one of:

| Age | Returned string |
|---|---|
| < 1 minute | `"just added"` |
| < 1 hour | `"Nm ago"` |
| < 24 hours | `"Nh ago"` |
| < 7 days | `"Nd ago"` |
| < 30 days | `"Nw ago"` |
| ≥ 30 days | `null` |

When the formatter returns `null` the card renders with no timestamp at all — old stuff shouldn't look stale, it should just look neutral.

## Interaction rules

### Search / filter interaction with trending

When any of `search`, `activeTag`, `activeSource` is truthy, **the trending row is hidden entirely**. The user has explicitly signaled intent to narrow the result set; a passive discovery row becomes noise in that state. The main grid filters normally.

When the user clears search and filters, the trending row returns.

### Loading state

The trending row also hides while `loading` is `true`. It renders in the same pass as the main grid once data has loaded.

### Click target

Each trending card links to `recipe.url` in a new tab, same as a regular `RecipeCard`. No modal, no detail page.

## Component architecture

### New: `src/lib/relativeTime.ts`

```ts
export type TimestampLike =
  | Date
  | string
  | { seconds: number; nanoseconds: number }  // serialized Firestore Timestamp
  | { toDate: () => Date }                    // live Firestore Timestamp instance
  | null
  | undefined;

export function formatRelativeTime(value: TimestampLike, nowMs?: number): string | null;
export function isFresh(value: TimestampLike, nowMs?: number): boolean;
```

Both pure. No React, no Firestore imports. Handle every shape `createdAt` can arrive in (live Firestore `Timestamp`, deserialized cache from `localStorage`, or already-normalized `Date`/ISO string). `isFresh` returns `true` when the timestamp is less than 24 hours old — used to apply the green tint on cards, rather than parsing the formatted label string.

### New: `src/lib/trending.ts`

```ts
export interface RecipeWithShares {
  id: string;
  sharedBy?: Array<{ sharedAt?: string }>;
}

export function computeTrending<T extends RecipeWithShares>(
  recipes: T[],
  nowMs?: number,
  windowDays?: number,   // defaults to 7
  limit?: number,        // defaults to 3
): T[];
```

Pure. Takes the full recipe list and returns a slice annotated with the caller's own type. The `nowMs` parameter makes the function deterministic for testing.

### New: `src/components/TrendingRow.tsx`

Client component. Receives the trending slice as a prop, renders 3 gold-tinted cards in a `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3` layout. Each card shows:

- A ghosted rank number (`1` / `2` / `3`) absolute-positioned top-right
- Title (larger than RecipeCard — `text-base` vs `text-sm`)
- Source badge (same color system as RecipeCard)
- `🔥 +N this week` badge instead of total share count
- Gold gradient background to distinguish from the main grid below

Does not fetch. Does not know about Firestore. Takes pre-computed data in, renders it, emits no events.

### Modified: `src/components/RecipeCard.tsx`

Adds a new optional prop: `createdAt?: TimestampLike` (the component already gets the recipe object spread; the cleanest path is to read `createdAt` off the recipe inside the card rather than plumb it as a separate prop).

Renders `formatRelativeTime(createdAt)` in the top-right corner of the card, absolute-positioned next to the existing external-link icon. Base style `text-[10px] text-gray-600`; applies a green tint (`text-emerald-400/70`) when `isFresh(createdAt)` returns `true` (less than 24 hours old), to visually reinforce freshness. When `formatRelativeTime` returns `null` (older than 30 days or missing), the timestamp span is not rendered at all.

### Modified: `src/app/page.tsx`

1. Add `import TrendingRow from "@/components/TrendingRow"` and the helper imports.
2. Remove the Firestore `orderBy` entirely. Add a client-side `sortByCreatedAtDesc` helper (using `toMillis` exported from `relativeTime.ts`) and apply it after fetching. This approach was chosen over `orderBy("createdAt", "desc")` because Firestore silently excludes documents missing the ordered field — any legacy recipe without `createdAt` would vanish from the list.
3. Add `createdAt` to the `Recipe` interface as `TimestampLike`.
4. Compute `const trending = useMemo(() => computeTrending(recipes), [recipes])`.
5. Compute `const isFiltering = Boolean(search || activeTag || activeSource)`.
6. Render `<TrendingRow entries={trending} />` between the filter chips and the grid, gated on `!loading && !isFiltering`. (`TrendingEntry<Recipe>[]` is passed as the `entries` prop; `TrendingRow` handles the `< 2` guard internally.)
7. Bump `APP_VERSION` from `"1.0.1"` to `"1.1.0"` so existing localStorage caches invalidate (older cached shapes may lack `createdAt`).

## Cache compatibility

The page uses a localStorage cache with a 60-second TTL and a version string. `Recipe` objects in the cache came through `JSON.stringify`, which turns a Firestore `Timestamp` into `{seconds, nanoseconds}`. `formatRelativeTime` handles that shape. `APP_VERSION` bumps from `"1.0.1"` to `"1.1.0"` so users loading the site for the first time after deploy get a clean fetch instead of a stale cache with the old shape.

## Error handling

No new error paths. All new logic is pure and derived from the data already fetched by the existing `fetchRecipes()`. If that fetch fails, the existing error handling (console.error + loading state) handles both zones — the trending row and the main grid hide together.

If `computeTrending` or `formatRelativeTime` throw on malformed data (they shouldn't — they're defensive), the error propagates to React's error boundary, same as any other render error on the page. No new try/catch.

## Firestore query compatibility

The final implementation fetches all approved recipes without a Firestore `orderBy` and sorts client-side. No composite index is required. This approach was chosen because Firestore's `orderBy` silently excludes documents missing the ordered field, which would have hidden any legacy recipe documents lacking `createdAt`. The query is simply `where("status", "==", "approved")`, and `sortByCreatedAtDesc` runs in the client after the snapshot is returned, treating missing `createdAt` as `-Infinity` (sorted to the bottom) so no documents are dropped.

## File manifest

| File | Change | Notes |
|---|---|---|
| `recipes-site/src/lib/relativeTime.ts` | New | ~25 lines, pure |
| `recipes-site/src/lib/trending.ts` | New | ~20 lines, pure |
| `recipes-site/src/components/TrendingRow.tsx` | New | ~60 lines, client component |
| `recipes-site/src/components/RecipeCard.tsx` | Modified | Add timestamp in top-right |
| `recipes-site/src/app/page.tsx` | Modified | Sort change, wire-up, `APP_VERSION` bump |
| `recipes-site/package.json` | Modified | `1.0.0` → `1.1.0` |

**Not changing:** `layout.tsx`, `globals.css`, Tailwind config, Firestore rules, the root Discord bot code, `pokedex-mcp`, or `dashboard-vercel`.

## Manual verification plan

Before opening the PR:

1. `cd recipes-site && npm run dev` — open `localhost:3001`
2. Trending row appears above the main grid with 3 cards, gold-tinted, rank numbers visible
3. Type in the search box → trending row disappears
4. Clear search → trending row returns
5. Click a filter chip → trending row disappears
6. Clear chip → trending row returns
7. Recent recipes show a relative timestamp; a recipe under 24 hours old shows it in green
8. Recipes older than 30 days show no timestamp at all
9. Resize to mobile viewport — trending collapses to 1 column and layout still looks right
10. `npm run build` — no TypeScript errors, no ESLint errors
11. Check browser console for Firestore "missing index" errors on the new `createdAt` sort — if present, create the index before merging

## Rollout

Vercel auto-deploys `recipes-site/` from `main` per `recipes-site/vercel.json`. Merge → build → live in ~2 minutes. No feature flag, no staged rollout — the change is purely presentational, reads the same data via the same query, and degrades gracefully on any field that isn't present on older docs.
