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
