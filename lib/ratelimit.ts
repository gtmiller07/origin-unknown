/**
 * Upstash-backed rate limiting with graceful degradation. When
 * UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN are absent (local dev, or
 * before the instance is provisioned) every check is a no-op that allows the
 * call — so callers can wire limits in now and have them activate the moment the
 * env vars land. Limiter instances are cached per (limit, window).
 */
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

/** Duration literal accepted by Upstash, e.g. '1 h', '30 s' (extracted from its API). */
type Duration = Parameters<typeof Ratelimit.slidingWindow>[1];

export interface RateLimitResult {
  /** Whether the call is allowed. Always true when rate limiting is disabled. */
  success: boolean;
  /** Remaining events in the window (Infinity when disabled). */
  remaining: number;
  /** Unix ms when the window resets (0 when disabled). */
  reset: number;
  /** False when Upstash env is absent and this check was a no-op. */
  enabled: boolean;
}

// undefined = not yet resolved; null = unavailable (env missing).
let redis: Redis | null | undefined;

function getRedis(): Redis | null {
  if (redis !== undefined) return redis;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (url && token) {
    redis = new Redis({ url, token });
  } else {
    redis = null;
    console.warn('[ratelimit] Upstash env not set — rate limiting disabled (allowing all calls).');
  }
  return redis;
}

const limiters = new Map<string, Ratelimit>();

function getLimiter(limit: number, window: Duration): Ratelimit | null {
  const client = getRedis();
  if (!client) return null;
  const key = `${limit}:${window}`;
  let limiter = limiters.get(key);
  if (!limiter) {
    limiter = new Ratelimit({
      redis: client,
      limiter: Ratelimit.slidingWindow(limit, window),
      prefix: 'ou:rl',
      analytics: false,
    });
    limiters.set(key, limiter);
  }
  return limiter;
}

/** Check `identifier` against `limit` events per `window`. Allows (no-op) when disabled. */
export async function rateLimit(
  identifier: string,
  limit: number,
  window: Duration
): Promise<RateLimitResult> {
  const limiter = getLimiter(limit, window);
  if (!limiter) {
    return { success: true, remaining: Number.POSITIVE_INFINITY, reset: 0, enabled: false };
  }
  const res = await limiter.limit(identifier);
  return { success: res.success, remaining: res.remaining, reset: res.reset, enabled: true };
}

/** Per-source ingestion throttle: `limitPerHour` runs/hour keyed on the source id. */
export function checkSourceRateLimit(
  sourceId: string,
  limitPerHour: number
): Promise<RateLimitResult> {
  return rateLimit(`source:${sourceId}`, limitPerHour, '1 h');
}

/** Test seam: drop cached client + limiters so a later env change takes effect. */
export function __resetRateLimitForTests(): void {
  redis = undefined;
  limiters.clear();
}
