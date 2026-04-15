export type TimestampLike =
  | Date
  | string
  | number
  | { seconds: number; nanoseconds: number }
  | { toDate: () => Date }
  | null
  | undefined;

export function toMillis(value: TimestampLike): number | null {
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
