// In-memory rate limiting for the MCP server.
// Extracted from index.ts so handlers can be unit-tested independently.
// Uses module-level state — tests that care about limits must call resetRateLimits()
// in beforeEach to isolate between cases.

import { sanitizeRateLimitKey } from "./validators.js";

const rateLimitBuckets = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_WRITE = 10;
const RATE_LIMIT_MAX_READ = 30;
const RATE_LIMIT_EVICT_INTERVAL_MS = 300_000;

function evictExpiredBuckets(): void {
  const now = Date.now();
  for (const [key, bucket] of rateLimitBuckets) {
    if (now > bucket.resetAt) {
      rateLimitBuckets.delete(key);
    }
  }
}

// Periodically evict expired entries to prevent unbounded memory growth.
// .unref() ensures this timer doesn't hold the process open (important for tests).
setInterval(evictExpiredBuckets, RATE_LIMIT_EVICT_INTERVAL_MS).unref();

export function checkRateLimit(key: string, isWrite: boolean): boolean {
  const now = Date.now();
  const max = isWrite ? RATE_LIMIT_MAX_WRITE : RATE_LIMIT_MAX_READ;
  const safeKey = sanitizeRateLimitKey(key);
  const bucket = rateLimitBuckets.get(safeKey);

  if (!bucket || now > bucket.resetAt) {
    rateLimitBuckets.set(safeKey, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return true;
  }

  if (bucket.count >= max) return false;
  bucket.count++;
  return true;
}

// Test helper: clear all rate-limit state between test cases.
export function resetRateLimits(): void {
  rateLimitBuckets.clear();
}
