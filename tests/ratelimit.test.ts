import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { __resetRateLimitForTests, checkSourceRateLimit, rateLimit } from '../lib/ratelimit';

// These tests cover the graceful-degradation contract: with no Upstash env, every
// check must allow the call (no-op) so wiring limits in is always safe.
describe('rateLimit without Upstash env (fallback)', () => {
  beforeEach(() => {
    // Force the env absent. Use '' (falsy) rather than delete/undefined: getRedis()
    // gates on `url && token`, and a var assigned undefined reads back as the
    // truthy string "undefined", which would wrongly enable the live Redis path.
    vi.stubEnv('UPSTASH_REDIS_REST_URL', '');
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', '');
    __resetRateLimitForTests();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    __resetRateLimitForTests();
  });

  it('allows the call and reports disabled', async () => {
    const res = await rateLimit('k', 1, '1 h');
    expect(res.success).toBe(true);
    expect(res.enabled).toBe(false);
    expect(res.remaining).toBe(Number.POSITIVE_INFINITY);
  });

  it('does not throttle even when called past the nominal limit', async () => {
    const first = await rateLimit('same-key', 1, '1 h');
    const second = await rateLimit('same-key', 1, '1 h');
    expect(first.success).toBe(true);
    expect(second.success).toBe(true);
  });

  it('checkSourceRateLimit is a no-op when disabled', async () => {
    const res = await checkSourceRateLimit('source-123', 10);
    expect(res.success).toBe(true);
    expect(res.enabled).toBe(false);
  });
});
