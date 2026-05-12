import 'server-only';
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

let _redis: Redis | null = null;
let _warnedMissing = false;

function redis(): Redis | null {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) {
    if (!_warnedMissing) {
      console.warn(
        '[rate-limit] UPSTASH_REDIS_REST_URL or UPSTASH_REDIS_REST_TOKEN missing — rate limiting disabled (dev mode).',
      );
      _warnedMissing = true;
    }
    return null;
  }
  if (!_redis) {
    _redis = new Redis({ url, token });
  }
  return _redis;
}

const limiters: Record<string, Ratelimit> = {};

function get(name: string, limit: number, window: `${number} ${'s' | 'm' | 'h'}`): Ratelimit | null {
  const r = redis();
  if (!r) return null;
  if (!limiters[name]) {
    limiters[name] = new Ratelimit({
      redis: r,
      limiter: Ratelimit.slidingWindow(limit, window),
      prefix: `ratelimit:${name}`,
    });
  }
  return limiters[name];
}

// Open-by-default result for when Upstash isn't configured (dev).
const OK = { success: true, limit: 0, remaining: 0, reset: 0, pending: Promise.resolve() } as const;

export const limits = {
  postCreate: async (userId: string) => {
    const l = get('post-create', 10, '1 m');
    return l ? l.limit(`u:${userId}`) : OK;
  },
  reportCreate: async (userId: string) => {
    const l = get('report-create', 5, '1 h');
    return l ? l.limit(`u:${userId}`) : OK;
  },
  signup: async (ip: string) => {
    const l = get('signup', 5, '1 h');
    return l ? l.limit(`ip:${ip}`) : OK;
  },
  preview: async (userId: string) => {
    const l = get('preview', 30, '1 m');
    return l ? l.limit(`u:${userId}`) : OK;
  },
};
