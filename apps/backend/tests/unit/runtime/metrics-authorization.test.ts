import { Hono } from 'hono';
import { afterEach, expect, it, vi } from 'vitest';
vi.mock('../../../src/lib/prisma.js', () => ({ prisma: {} }));
vi.mock('../../../src/bootstrap/operations/runtime-health.js', () => ({ runtimeHealth: { read: vi.fn(async () => ({ status: 'ready', checks: {} })) } }));
vi.mock('../../../src/modules/platform/application/observability/operational-probe.js', () => ({ operationalMetrics: vi.fn(async () => 'axon_operational_probe_up 1\n') }));
import { MetricsController } from '../../../src/modules/platform/http/controllers/metrics.controller.js';
import { globalRateLimit } from '../../../src/middleware/globalRateLimit.js';
import { rateLimiter } from '../../../src/lib/rateLimiter.js';
afterEach(() => vi.unstubAllEnvs());
it('keeps authenticated diagnostics available without depending on a failed Redis limiter', async () => {
  const check = vi.spyOn(rateLimiter, 'check').mockRejectedValue(new Error('Synthetic Redis outage'));
  try {
    vi.stubEnv('METRICS_ENABLED', 'true');
    vi.stubEnv('METRICS_BEARER_TOKEN', 'synthetic-independent-metrics-token');
    const app = new Hono();
    app.use('*', globalRateLimit);
    app.get('/metrics', MetricsController.prometheus);
    expect((await app.request('/metrics')).status).toBe(401);
    expect((await app.request('/metrics', { headers: { authorization: 'Bearer synthetic-independent-metrics-token' } })).status).toBe(200);
    expect(check).not.toHaveBeenCalled();
  }
  finally {
    check.mockRestore();
  }
});
it('requires an explicitly configured bearer in every environment and retains the disabled 404', async () => {
  const app = new Hono().get('/metrics', MetricsController.prometheus);
  vi.stubEnv('METRICS_ENABLED', 'true');
  vi.stubEnv('METRICS_BEARER_TOKEN', '');
  vi.stubEnv('NODE_ENV', 'development');
  expect((await app.request('/metrics')).status).toBe(401);
  vi.stubEnv('METRICS_BEARER_TOKEN', 'weak');
  expect((await app.request('/metrics', { headers: { authorization: 'Bearer weak' } })).status).toBe(401);
  const token = ['synthetic', 'metrics', 'token', 'of', 'at', 'least', '32', 'characters'].join('-');
  vi.stubEnv('METRICS_BEARER_TOKEN', token);
  expect((await app.request('/metrics', { headers: { authorization: token } })).status).toBe(401);
  expect((await app.request('/metrics', { headers: { authorization: 'Bearer wrong' } })).status).toBe(401);
  const allowed = await app.request('/metrics', { headers: { authorization: 'Bearer ' + token } });
  expect(allowed.status).toBe(200);
  expect(await allowed.text()).toContain('axon_operational_probe_up 1');
  expect(allowed.headers.get('cache-control')).toBe('no-store');
  vi.stubEnv('METRICS_ENABLED', 'false');
  expect((await app.request('/metrics')).status).toBe(404);
});
