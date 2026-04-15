export interface RecipeShareTimestamps {
  sharedBy?: Array<{ sharedAt?: string }>;
}

const DAY_MS = 24 * 60 * 60 * 1000;

// sharedAt is always written as an ISO 8601 string by the Discord bot's write path
// (src/commands/recipes.js and src/triggers/autoscrape.js both call .toISOString()),
// so parsing with Date.parse is correct and no TimestampLike coercion is needed here.
function countSharesSinceCutoff(
  sharedBy: Array<{ sharedAt?: string }> | undefined,
  cutoffMs: number,
): number {
  if (!sharedBy) return 0;
  return sharedBy.reduce((count, share) => {
    if (!share.sharedAt) return count;
    const shareMs = Date.parse(share.sharedAt);
    if (Number.isNaN(shareMs)) return count;
    return shareMs >= cutoffMs ? count + 1 : count;
  }, 0);
}

export interface TrendingEntry<T> {
  recipe: T;
  recentShares: number;
}

export function computeTrending<T extends RecipeShareTimestamps>(
  recipes: T[],
  nowMs: number = Date.now(),
  windowDays: number = 7,
  limit: number = 3,
): TrendingEntry<T>[] {
  const cutoff = nowMs - windowDays * DAY_MS;

  return recipes
    .map((recipe) => ({
      recipe,
      recentShares: countSharesSinceCutoff(recipe.sharedBy, cutoff),
    }))
    .filter((entry) => entry.recentShares > 0)
    .sort((a, b) => b.recentShares - a.recentShares)
    .slice(0, limit);
}

export function countRecentShares(
  sharedBy: Array<{ sharedAt?: string }> | undefined,
  nowMs: number = Date.now(),
  windowDays: number = 7,
): number {
  return countSharesSinceCutoff(sharedBy, nowMs - windowDays * DAY_MS);
}
