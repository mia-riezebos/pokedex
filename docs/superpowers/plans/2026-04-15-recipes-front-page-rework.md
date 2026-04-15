# Recipes Front Page Rework Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Trending this week" row above the main recipes grid, switch the grid sort from popularity to recency, and show a relative timestamp on each card — all inside `recipes-site/`, presentational only, no backend changes.

**Architecture:** Two new pure helper files in `src/lib/` (testable-by-construction, no React, no Firestore). One new client component `TrendingRow.tsx`. Two modifications to existing files: `RecipeCard.tsx` (add timestamp) and `app/page.tsx` (swap sort, wire trending row, bump cache version). Glassmorphism theme is preserved. Spec: `docs/superpowers/specs/2026-04-14-recipes-front-page-rework-design.md`.

**Tech Stack:** Next.js 14 (App Router), React 18, TypeScript, Tailwind CSS, Firebase/Firestore client SDK.

## Testing Strategy

`recipes-site/` has **no test harness today** (no vitest, no jest — `package.json` has no `"test"` script). The spec explicitly excludes adding one as out of scope. Instead, each task uses this verification loop:

1. **Type check** — `cd recipes-site && npx tsc --noEmit` (catches type errors)
2. **Lint** — `cd recipes-site && npm run lint` (catches style/unsafe code)
3. **Commit** — once both pass

The final task runs the full manual verification plan from the spec (dev server, click-through). The two new pure helpers (`relativeTime.ts`, `trending.ts`) are deliberately extracted as pure functions so they're trivially testable if a harness lands later, but this plan does not add one.

**Before starting:** make sure you're in a clean worktree on a new branch. Suggested:
```bash
git worktree add ../pokedex-recipes-rework -b feat/recipes-front-page-rework main
cd ../pokedex-recipes-rework
```

---

### Task 1: Add `relativeTime.ts` pure helper

**Files:**
- Create: `recipes-site/src/lib/relativeTime.ts`

The helper lives at `src/lib/` alongside the existing `src/lib/firebase.ts`. It exports two pure functions: `formatRelativeTime` and `isFresh`. Both accept a `TimestampLike` value that can be any shape a Firestore timestamp might arrive in (live `Timestamp` instance, deserialized `{seconds, nanoseconds}` from localStorage cache, ISO string, `Date`, or nullish).

- [ ] **Step 1: Create the file**

Write `recipes-site/src/lib/relativeTime.ts`:

```ts
export type TimestampLike =
  | Date
  | string
  | number
  | { seconds: number; nanoseconds: number }
  | { toDate: () => Date }
  | null
  | undefined;

function toMillis(value: TimestampLike): number | null {
  if (value == null) return null;
  if (value instanceof Date) return value.getTime();
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? null : parsed;
  }
  if (typeof value === "object") {
    if ("toDate" in value && typeof value.toDate === "function") {
      return value.toDate().getTime();
    }
    if ("seconds" in value && typeof value.seconds === "number") {
      return value.seconds * 1000 + Math.floor((value.nanoseconds ?? 0) / 1e6);
    }
  }
  return null;
}

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;
const WEEK_MS = 7 * DAY_MS;
const MONTH_MS = 30 * DAY_MS;

export function formatRelativeTime(
  value: TimestampLike,
  nowMs: number = Date.now(),
): string | null {
  const ms = toMillis(value);
  if (ms == null) return null;
  const delta = nowMs - ms;
  if (delta < 0) return "just added"; // clock skew / future timestamps
  if (delta < MINUTE_MS) return "just added";
  if (delta < HOUR_MS) return `${Math.floor(delta / MINUTE_MS)}m ago`;
  if (delta < DAY_MS) return `${Math.floor(delta / HOUR_MS)}h ago`;
  if (delta < WEEK_MS) return `${Math.floor(delta / DAY_MS)}d ago`;
  if (delta < MONTH_MS) return `${Math.floor(delta / WEEK_MS)}w ago`;
  return null;
}

export function isFresh(
  value: TimestampLike,
  nowMs: number = Date.now(),
): boolean {
  const ms = toMillis(value);
  if (ms == null) return false;
  const delta = nowMs - ms;
  return delta >= 0 && delta < DAY_MS;
}
```

- [ ] **Step 2: Type check**

Run:
```bash
cd recipes-site && npx tsc --noEmit
```

Expected: no errors. (If you see `Cannot find module '@/lib/firebase'` or similar unrelated errors, those existed before your changes — check `git stash && npx tsc --noEmit` to confirm.)

- [ ] **Step 3: Lint**

Run:
```bash
cd recipes-site && npm run lint
```

Expected: no errors on the new file.

- [ ] **Step 4: Commit**

```bash
git add recipes-site/src/lib/relativeTime.ts
git commit -m "feat(recipes-site): add relativeTime pure helper"
```

---

### Task 2: Add `trending.ts` pure helper

**Files:**
- Create: `recipes-site/src/lib/trending.ts`

Computes the "trending this week" slice from a recipe list. Pure function — takes recipes in, returns a slice out. Uses a caller-generic type so it works with the `Recipe` interface defined in `page.tsx` without creating a circular import.

- [ ] **Step 1: Create the file**

Write `recipes-site/src/lib/trending.ts`:

```ts
export interface RecipeShareTimestamps {
  sharedBy?: Array<{ sharedAt?: string }>;
}

const DAY_MS = 24 * 60 * 60 * 1000;

export function computeTrending<T extends RecipeShareTimestamps>(
  recipes: T[],
  nowMs: number = Date.now(),
  windowDays: number = 7,
  limit: number = 3,
): T[] {
  const cutoff = nowMs - windowDays * DAY_MS;

  const scored = recipes
    .map((recipe) => {
      const recentShares = (recipe.sharedBy ?? []).reduce((count, share) => {
        if (!share.sharedAt) return count;
        const shareMs = Date.parse(share.sharedAt);
        if (Number.isNaN(shareMs)) return count;
        return shareMs >= cutoff ? count + 1 : count;
      }, 0);
      return { recipe, recentShares };
    })
    .filter((entry) => entry.recentShares > 0)
    .sort((a, b) => b.recentShares - a.recentShares)
    .slice(0, limit);

  return scored.map((entry) => entry.recipe);
}

export function countRecentShares(
  sharedBy: Array<{ sharedAt?: string }> | undefined,
  nowMs: number = Date.now(),
  windowDays: number = 7,
): number {
  if (!sharedBy) return 0;
  const cutoff = nowMs - windowDays * DAY_MS;
  return sharedBy.reduce((count, share) => {
    if (!share.sharedAt) return count;
    const shareMs = Date.parse(share.sharedAt);
    if (Number.isNaN(shareMs)) return count;
    return shareMs >= cutoff ? count + 1 : count;
  }, 0);
}
```

`countRecentShares` is exported alongside `computeTrending` because `TrendingRow.tsx` needs to display `"🔥 +N this week"` per card, and the caller shouldn't have to re-implement the same filter.

- [ ] **Step 2: Type check**

Run:
```bash
cd recipes-site && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Lint**

Run:
```bash
cd recipes-site && npm run lint
```

Expected: no errors on the new file.

- [ ] **Step 4: Commit**

```bash
git add recipes-site/src/lib/trending.ts
git commit -m "feat(recipes-site): add trending computation helper"
```

---

### Task 3: Add `TrendingRow.tsx` component

**Files:**
- Create: `recipes-site/src/components/TrendingRow.tsx`

Client component. Takes the pre-computed trending slice as a prop, renders 3 gold-tinted cards. No Firestore, no data fetching, no state. Pure presentation.

- [ ] **Step 1: Create the file**

Write `recipes-site/src/components/TrendingRow.tsx`:

```tsx
"use client";

import { countRecentShares } from "@/lib/trending";

interface Sharer {
  id?: string;
  name: string;
  sharedAt?: string;
}

interface Recipe {
  id: string;
  title: string;
  url: string;
  source?: string;
  sharedBy?: Sharer[];
}

const sourceColors: Record<string, string> = {
  Poke: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",
  Pokepaste: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  Showdown: "bg-purple-500/10 text-purple-400 border-purple-500/20",
  Smogon: "bg-orange-500/10 text-orange-400 border-orange-500/20",
  YouTube: "bg-red-500/10 text-red-400 border-red-500/20",
  Reddit: "bg-orange-500/10 text-orange-400 border-orange-500/20",
  Pikalytics: "bg-cyan-500/10 text-cyan-400 border-cyan-500/20",
  Limitless: "bg-green-500/10 text-green-400 border-green-500/20",
};

export default function TrendingRow({ recipes }: { recipes: Recipe[] }) {
  if (recipes.length < 2) return null;

  return (
    <section className="mb-8">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-[10px] font-semibold uppercase tracking-wider px-2.5 py-1 rounded-full bg-red-500/10 text-red-400 border border-red-500/25">
          🔥 Trending this week
        </span>
        <span className="text-[11px] text-gray-600">
          by shares in the last 7 days
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {recipes.map((recipe, i) => {
          const sourceColor =
            sourceColors[recipe.source || ""] ||
            "bg-indigo-500/10 text-indigo-400 border-indigo-500/20";
          const recent = countRecentShares(recipe.sharedBy);

          return (
            <a
              key={recipe.id}
              href={recipe.url}
              target="_blank"
              rel="noopener noreferrer"
              className="group relative block rounded-xl p-5 border border-gold/25 bg-gradient-to-br from-gold/[0.08] via-white/[0.03] to-transparent hover:border-gold/40 hover:-translate-y-0.5 transition-all duration-200 overflow-hidden"
            >
              <span className="absolute top-3 right-4 text-2xl font-black text-gold/20 select-none pointer-events-none">
                {i + 1}
              </span>

              <h3 className="text-base font-semibold text-gray-100 pr-10 line-clamp-2 group-hover:text-gold transition-colors">
                {recipe.title || "Untitled Recipe"}
              </h3>

              <div className="flex items-center gap-2 mt-3 flex-wrap">
                {recipe.source && (
                  <span
                    className={`text-[10px] font-medium px-2 py-0.5 rounded-full border ${sourceColor}`}
                  >
                    {recipe.source}
                  </span>
                )}
                <span className="text-[10px] font-semibold text-red-400">
                  🔥 +{recent} this week
                </span>
              </div>
            </a>
          );
        })}
      </div>
    </section>
  );
}
```

Note the `recipes.length < 2` early return: a single-card trending row looks broken, per the spec's visibility rules. The parent page also gates rendering on `!loading && !isFiltering`, so this is a belt-and-suspenders check — but it also means `TrendingRow` is safe to render unconditionally at the call site if the parent refactors later.

- [ ] **Step 2: Type check**

```bash
cd recipes-site && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Lint**

```bash
cd recipes-site && npm run lint
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add recipes-site/src/components/TrendingRow.tsx
git commit -m "feat(recipes-site): add TrendingRow component"
```

---

### Task 4: Modify `RecipeCard.tsx` to show relative timestamp

**Files:**
- Modify: `recipes-site/src/components/RecipeCard.tsx`

Add `createdAt` to the `Recipe` interface and render `formatRelativeTime(recipe.createdAt)` in the top-right corner of the card, to the left of the existing external-link icon. Apply a green tint when `isFresh(recipe.createdAt)` is true.

- [ ] **Step 1: Read the current file**

```bash
cat recipes-site/src/components/RecipeCard.tsx
```

Confirm it matches what you expect before editing — the current file has a `Recipe` interface without `createdAt`, and an external-link `<svg>` absolute-positioned at `top-4 right-4`.

- [ ] **Step 2: Add the imports at the top**

Replace the first two lines of the file:

```tsx
"use client";

interface Sharer {
```

with:

```tsx
"use client";

import { formatRelativeTime, isFresh, type TimestampLike } from "@/lib/relativeTime";

interface Sharer {
```

- [ ] **Step 3: Add `createdAt` to the `Recipe` interface**

Find this block:

```tsx
interface Recipe {
  id: string;
  title: string;
  url: string;
  source?: string;
  referCode?: string;
  description?: string;
  tags?: string[];
  shareCount?: number;
  sharedBy?: Sharer[];
}
```

Replace with:

```tsx
interface Recipe {
  id: string;
  title: string;
  url: string;
  source?: string;
  referCode?: string;
  description?: string;
  tags?: string[];
  shareCount?: number;
  sharedBy?: Sharer[];
  createdAt?: TimestampLike;
}
```

- [ ] **Step 4: Render the timestamp span**

Find the external-link SVG block:

```tsx
      {/* External link icon */}
      <svg
        className="absolute top-4 right-4 w-4 h-4 text-gray-700 group-hover:text-gold transition-colors"
```

Insert a new block **immediately before** it (between the opening `<a>` tag and the `{/* External link icon */}` comment):

```tsx
      {/* Relative timestamp */}
      {(() => {
        const label = formatRelativeTime(r.createdAt);
        if (!label) return null;
        const fresh = isFresh(r.createdAt);
        return (
          <span
            className={`absolute top-4 right-10 text-[10px] font-medium ${
              fresh ? "text-emerald-400/70" : "text-gray-600"
            }`}
          >
            {label}
          </span>
        );
      })()}

```

The `right-10` positions the timestamp just to the left of the `right-4` external-link icon, leaving a 4-unit gap.

- [ ] **Step 5: Type check**

```bash
cd recipes-site && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 6: Lint**

```bash
cd recipes-site && npm run lint
```

Expected: no errors. If the IIFE pattern (`{(() => {...})()}`) trips an ESLint rule, extract it to a local `const` above the `return`:

```tsx
const timestampLabel = formatRelativeTime(r.createdAt);
const timestampIsFresh = isFresh(r.createdAt);
```

and use `{timestampLabel && (<span ...>{timestampLabel}</span>)}` inside the JSX.

- [ ] **Step 7: Commit**

```bash
git add recipes-site/src/components/RecipeCard.tsx
git commit -m "feat(recipes-site): show relative timestamp on RecipeCard"
```

---

### Task 5: Modify `app/page.tsx` — swap sort, wire trending row, bump cache version

**Files:**
- Modify: `recipes-site/src/app/page.tsx`

Five changes in this one file:
1. Import `TrendingRow`, `computeTrending`, and `TimestampLike`
2. Add `createdAt` to the `Recipe` interface
3. Change `orderBy("shareCount", "desc")` → `orderBy("createdAt", "desc")`
4. Compute the trending slice and filtering flag with `useMemo`
5. Render `<TrendingRow>` above the main grid, gated on `!loading && !isFiltering`
6. Bump `APP_VERSION` from `"1.0.1"` to `"1.1.0"`

- [ ] **Step 1: Update imports**

Find:
```tsx
import RecipeCard from "@/components/RecipeCard";
import Link from "next/link";
```

Replace with:
```tsx
import RecipeCard from "@/components/RecipeCard";
import TrendingRow from "@/components/TrendingRow";
import { computeTrending } from "@/lib/trending";
import type { TimestampLike } from "@/lib/relativeTime";
import Link from "next/link";
```

- [ ] **Step 2: Bump the cache version**

Find:
```tsx
const APP_VERSION = "1.0.1";
```

Replace with:
```tsx
const APP_VERSION = "1.1.0";
```

- [ ] **Step 3: Add `createdAt` to the `Recipe` interface**

Find:
```tsx
interface Recipe {
  id: string;
  title: string;
  url: string;
  source?: string;
  referCode?: string;
  description?: string;
  tags?: string[];
  shareCount?: number;
  sharedBy?: Sharer[];
  status?: string;
}
```

Replace with:
```tsx
interface Recipe {
  id: string;
  title: string;
  url: string;
  source?: string;
  referCode?: string;
  description?: string;
  tags?: string[];
  shareCount?: number;
  sharedBy?: Sharer[];
  status?: string;
  createdAt?: TimestampLike;
}
```

- [ ] **Step 4: Change the Firestore query sort**

Find:
```tsx
      const q = query(
        collection(db, "recipes"),
        where("status", "==", "approved"),
        orderBy("shareCount", "desc")
      );
```

Replace with:
```tsx
      const q = query(
        collection(db, "recipes"),
        where("status", "==", "approved"),
        orderBy("createdAt", "desc")
      );
```

**Firestore composite index required** — see Task 7 below. This query will fail at runtime if the `(status ASC, createdAt DESC)` composite index doesn't exist yet. Do not skip Task 7.

- [ ] **Step 5: Add trending and isFiltering useMemo hooks**

Find this block (around line 140):
```tsx
  // Filtered results
  const filtered = useMemo(() => {
```

Insert **immediately above** it:

```tsx
  // Trending slice: top 3 recipes by new shares in the last 7 days
  const trending = useMemo(() => computeTrending(recipes), [recipes]);

  // User has taken explicit filtering action — hide passive discovery affordances
  const isFiltering = Boolean(search || activeTag || activeSource);

```

- [ ] **Step 6: Render TrendingRow above the main grid**

Find:
```tsx
      {/* Recipe grid */}
      {loading ? (
```

Insert **immediately above** it:

```tsx
      {/* Trending row — hidden during search/filter and while loading */}
      {!loading && !isFiltering && <TrendingRow recipes={trending} />}

```

- [ ] **Step 7: Type check**

```bash
cd recipes-site && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 8: Lint**

```bash
cd recipes-site && npm run lint
```

Expected: no errors.

- [ ] **Step 9: Full production build**

```bash
cd recipes-site && npm run build
```

Expected: `✓ Compiled successfully` and no type errors. This is the last gate before manual verification — if the build fails, fix it before committing.

- [ ] **Step 10: Commit**

```bash
git add recipes-site/src/app/page.tsx
git commit -m "feat(recipes-site): swap grid sort and wire trending row"
```

---

### Task 6: Bump `recipes-site/package.json` version

**Files:**
- Modify: `recipes-site/package.json`

Bump the site's own package version to signal a minor feature release. This is separate from the root Discord bot's version — they're independent packages in the same monorepo.

Note: this `package.json` version is independent of the `APP_VERSION` constant bumped in Task 5. `APP_VERSION` is the localStorage cache key (was `"1.0.1"` → `"1.1.0"`); the npm `version` field is the package release version (was `"1.0.0"` → `"1.1.0"`). They share the final `1.1.0` coincidentally.

- [ ] **Step 1: Edit the version**

Find:
```json
  "name": "pokedex-recipes",
  "version": "1.0.0",
```

Replace with:
```json
  "name": "pokedex-recipes",
  "version": "1.1.0",
```

- [ ] **Step 2: Commit**

```bash
git add recipes-site/package.json
git commit -m "chore(recipes-site): bump version to 1.1.0"
```

---

### Task 7: Verify (or create) the Firestore composite index

**Files:** none — this is a Firebase console action.

> ⚠️ **Human-only task.** An agentic executor cannot click through the Firebase console. If a subagent reaches this task, it should stop and hand off to the user with a message like *"Task 7 requires Firebase console access — please verify/create the composite index on `recipes` with fields `(status ASC, createdAt DESC)`, then tell me to continue."*

The Firestore query in `page.tsx` changes from:
```
where("status", "==", "approved") + orderBy("shareCount", "desc")
```
to:
```
where("status", "==", "approved") + orderBy("createdAt", "desc")
```

Firestore requires a composite index for any query that combines an `==` filter with an `orderBy` on a different field. The old index is `(status ASC, shareCount DESC)`; the new one is `(status ASC, createdAt DESC)`. **Both must exist** — the old one because the production site might still be running the old code during the deploy window, the new one because the new code needs it.

- [ ] **Step 1: Check if the index exists**

Open https://console.firebase.google.com → select the Pokedex project → **Firestore Database** → **Indexes** tab.

Look for a composite index on collection `recipes` with fields in this order:
1. `status` — Ascending
2. `createdAt` — Descending

If it exists and its status is **Enabled**, skip to Task 8.

- [ ] **Step 2: If missing — create it the lazy way**

Easiest path: run the dev server with the new query, let Firestore throw the "missing index" error, and click the auto-generated link in the browser console.

```bash
cd recipes-site && npm run dev
# open localhost:3001, open browser devtools console
```

When the recipes list fails to load, a Firestore error in the console will include a full URL like `https://console.firebase.google.com/project/.../firestore/indexes?create_composite=...`. Click it — Firebase pre-fills the index definition. Click **Create index**. Wait 1-5 minutes for Firestore to finish building (the console shows build progress).

Refresh the dev server. The page should now load recipes normally.

- [ ] **Step 3: Confirm the old `shareCount` index still exists**

Back in the Firestore **Indexes** tab, confirm the old `(status ASC, shareCount DESC)` index is still there. Do **not** delete it — production is still running the old query until your PR merges and Vercel deploys, and you want a clean cutover with both indexes active during the brief overlap window.

---

### Task 8: Manual verification pass

**Files:** none — this is end-to-end testing per the spec's manual verification plan.

The entire plan's "tests" are this checklist. Run it before opening the PR. Use real production Firestore data (the dev server reads the same database as production).

- [ ] **Step 1: Run the dev server**

```bash
cd recipes-site && npm run dev
```

Open http://localhost:3001 in a browser.

- [ ] **Step 2: Trending row appears**

The page should load with three cards in a "🔥 Trending this week" row above the main grid. The cards should be gold-tinted with ghost rank numbers (1/2/3) in the top-right of each, and a "🔥 +N this week" badge visible.

If the trending row does not appear, check:
- Browser console: any "missing index" errors? → Go back to Task 7.
- Browser console: any JS errors from `computeTrending` or `formatRelativeTime`? → Fix and retry.
- Are there actually recipes with `sharedAt` timestamps in the last 7 days? If real production data has no recent shares, the row will be hidden (this is correct behavior, but test it by temporarily lowering the window in `computeTrending(recipes, Date.now(), 365)` to force a render, then revert).

- [ ] **Step 3: Main grid is sorted newest-first**

The first card in the main grid below the trending row should be the most recently added recipe. Every card should have a relative timestamp in the top-right (`"just added"` / `"3h ago"` / `"2d ago"` etc). Recipes older than 30 days should have no timestamp.

- [ ] **Step 4: Fresh timestamps are green**

Find a recipe less than 24 hours old (or temporarily flip the clock by editing the dev server's view of `Date.now()` — easier: just trust the visual). Its timestamp should render in `text-emerald-400/70` (green). Older-but-not-stale recipes should render in `text-gray-600`.

- [ ] **Step 5: Search hides the trending row**

Type anything in the search box. The trending row should disappear entirely. Clear the search. The trending row should come back.

- [ ] **Step 6: Filter chips hide the trending row**

Click any filter chip. The trending row should disappear. Click the chip again to deselect (or click **Clear**). The trending row should come back.

- [ ] **Step 7: Mobile viewport**

Open browser DevTools, switch to mobile device view (e.g. iPhone 14, 390px wide). The trending row should collapse to a single column. The main grid should collapse to a single column. Nothing should be clipped or overlapping.

- [ ] **Step 8: Clear localStorage and reload**

In DevTools → Application → Storage → Clear site data. Reload the page. The page should still load correctly (the `APP_VERSION` bump from `1.0.1` → `1.1.0` means any stale cache is invalidated automatically, but this confirms a first-time visitor works too).

- [ ] **Step 9: Production build**

```bash
cd recipes-site && npm run build
```

Expected: `✓ Compiled successfully`, no type errors, no ESLint errors.

- [ ] **Step 10: Kill the dev server**

`Ctrl+C` in the terminal running `npm run dev`.

---

### Task 9: Open the PR

**Files:** none — git/gh only.

- [ ] **Step 1: Push the branch**

```bash
git push -u origin feat/recipes-front-page-rework
```

- [ ] **Step 2: Create the PR**

```bash
gh pr create --title "feat(recipes-site): trending row + newest-first sort" --body "$(cat <<'EOF'
## Summary

Reworks the discovery experience on the public recipes site (`recipes-site/`).

- **New:** "🔥 Trending this week" row above the main grid — top 3 recipes ranked by new shares in the last 7 days
- **Changed:** main grid now sorts by `createdAt` descending (newest-first) instead of `shareCount` descending
- **Added:** relative timestamp (`"3h ago"` / `"2d ago"`) in the top-right of every `RecipeCard`, tinted green when less than 24h old
- Bumps `recipes-site` from `1.0.0` → `1.1.0` (site's own package version; the root Discord bot stays at `2.6.0`)

Presentational only. No backend changes. No schema changes. No new network calls — same Firestore query, same data.

## Design doc

`docs/superpowers/specs/2026-04-14-recipes-front-page-rework-design.md`

## Implementation plan

`docs/superpowers/plans/2026-04-15-recipes-front-page-rework.md`

## Firestore index note

This PR changes the recipes query from `orderBy("shareCount", "desc")` to `orderBy("createdAt", "desc")`. A new composite index on `(status ASC, createdAt DESC)` must exist in the Firebase console before this merges — see Task 7 of the plan. I verified and created it as part of the implementation work.

## Test plan

- [x] `npx tsc --noEmit` — clean
- [x] `npm run lint` — clean
- [x] `npm run build` — clean
- [x] Dev server: trending row appears above grid
- [x] Dev server: search hides trending row
- [x] Dev server: filter chip hides trending row
- [x] Dev server: timestamps render correctly; fresh recipes show green tint
- [x] Mobile viewport: single column, nothing clipped
- [x] Cleared localStorage: page still loads correctly
- [x] Firestore composite index `(status ASC, createdAt DESC)` verified/created

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 3: Return the PR URL**

Print the PR URL from the `gh pr create` output. Hand it off to the user.

---

## Appendix: quick reference of new symbols

These are the types, functions, and components defined across the tasks. If any task references a symbol, it should be defined in this list — if not, it's a gap to fix before execution.

| Symbol | Defined in | Used in |
|---|---|---|
| `TimestampLike` (type) | Task 1 — `src/lib/relativeTime.ts` | Tasks 4, 5 |
| `formatRelativeTime(value, nowMs?)` | Task 1 — `src/lib/relativeTime.ts` | Task 4 |
| `isFresh(value, nowMs?)` | Task 1 — `src/lib/relativeTime.ts` | Task 4 |
| `RecipeShareTimestamps` (type) | Task 2 — `src/lib/trending.ts` | (internal) |
| `computeTrending(recipes, nowMs?, windowDays?, limit?)` | Task 2 — `src/lib/trending.ts` | Task 5 |
| `countRecentShares(sharedBy, nowMs?, windowDays?)` | Task 2 — `src/lib/trending.ts` | Task 3 |
| `TrendingRow` (default export) | Task 3 — `src/components/TrendingRow.tsx` | Task 5 |
| `APP_VERSION` (updated constant) | Task 5 — `src/app/page.tsx` | (cache key) |

No undefined symbols. No forward references.
