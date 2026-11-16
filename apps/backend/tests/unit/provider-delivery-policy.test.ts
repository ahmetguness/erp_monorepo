import { describe, expect, it } from 'vitest';
import { ProviderHttpError, parseRetryAfter, providerRetryDelay } from '../../src/infrastructure/providers/retry-policy.js';
import { runWithProviderDeadline } from '../../src/infrastructure/providers/request-context.js';
import { retryDelayMs } from '../../src/domain-events/delivery/retry-policy.js';
import { sleep } from '../../src/services/trendyol/transport.js';

describe('provider delivery policy', () => {
  it('distinguishes transient network, timeout, rate limit and server failures from permanent client errors', () => {
    for (const status of [0, 408, 429, 500, 503]) expect(new ProviderHttpError('Injected', status).retryable).toBe(true);
    for (const status of [400, 401, 403, 404, 422]) expect(new ProviderHttpError('Injected', status).retryable).toBe(false);
    expect(new ProviderHttpError('Busy', 409, 0, 'concurrent_idempotent_requests').retryable).toBe(true);
    expect(new ProviderHttpError('Changed payload', 409, 0, 'invalid_idempotent_request').retryable).toBe(false);
  });
  it('honors Retry-After seconds and HTTP dates while bounding malformed or excessive delays', () => {
    const now = Date.parse('2026-11-16T12:00:00Z');
    expect(parseRetryAfter('60', now)).toBe(60_000);
    expect(parseRetryAfter('Mon, 16 Nov 2026 12:01:00 GMT', now)).toBe(60_000);
    expect(parseRetryAfter('invalid', now)).toBe(0);
    expect(parseRetryAfter('-1', now)).toBe(0);
    expect(parseRetryAfter('999999', now)).toBe(900_000);
  });
  it('uses positive bounded jitter and never shortens the provider retry deadline', () => {
    expect(retryDelayMs(1, () => 0)).toBe(2_500);
    expect(retryDelayMs(1, () => 1)).toBe(5_000);
    expect(retryDelayMs(30, () => 1)).toBe(900_000);
    expect(providerRetryDelay(1, 60_000, () => 0)).toBe(60_000);
  });
  it('cancels the actual polling/backoff sleep instead of leaving work behind a rejected race', async () => {
    let continued = false;
    await expect(runWithProviderDeadline(1, async () => { await sleep(50); continued = true; })).rejects.toThrow();
    expect(continued).toBe(false);
  });
});
