import { Hono } from 'hono';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { rateLimiter } from '../../../src/lib/rateLimiter.js';
import { globalRateLimit } from '../../../src/middleware/globalRateLimit.js';

afterEach(() => vi.restoreAllMocks());
describe('operational requests during a Redis outage', () => {
  it('keeps exact health/readiness reads reachable while protecting business requests', async () => {
    const app = new Hono();
    const check = vi.spyOn(rateLimiter, 'check').mockRejectedValue(new Error('Redis offline.'));
    app.use('*', globalRateLimit);
    app.onError(() => new Response('unavailable', { status: 503 }));
    for (const path of ['/health', '/ready', '/release', '/health/admin', '/api/payments']) app.get(path, (context) => context.json({ ok: true }));
    app.post('/ready', (context) => context.json({ ok: true }));
    for (const path of ['/health', '/ready', '/release']) expect((await app.request(path)).status).toBe(200);
    expect(check).not.toHaveBeenCalled();
    expect((await app.request('/api/payments')).status).toBe(503);
    expect((await app.request('/health/admin')).status).toBe(503);
    expect((await app.request('/ready', { method: 'POST' })).status).toBe(503);
    expect(check).toHaveBeenCalledTimes(3);
  });
});
