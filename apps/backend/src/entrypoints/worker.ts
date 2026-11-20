import { logger } from '../lib/logger.js';
import { startWorkers } from '../bootstrap/workers.js';
import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { randomUUID } from 'node:crypto';
import { workerHeartbeat } from '../lib/rateLimiter.js';
import { runtimeHealth } from '../bootstrap/operations/runtime-health.js';
import { registerShutdown } from '../bootstrap/operations/register-shutdown.js';
import { MetricsController } from '../modules/platform/index.js';

export function startWorkerProcess(): void {
  logger.info('[Startup] APP_ROLE=worker; HTTP API server disabled.');
  startWorkers('worker');
  const id = randomUUID();
  const updateHeartbeat = async () => {
    const report = await runtimeHealth.read();
    await workerHeartbeat(report.status === 'ready' ? 'touch' : 'remove', id);
  };
  const heartbeat = setInterval(() => { void updateHeartbeat().catch(() => {}); }, 10_000);
  void updateHeartbeat().catch(() => {});
  const health = new Hono();
  health.get('/health', context => context.text('ok'));
  health.get('/metrics', MetricsController.prometheus);
  health.get('/ready', async context => {
    const report = await runtimeHealth.read();
    context.header('cache-control', 'no-store');
    return context.json(report, report.status === 'ready' ? 200 : 503);
  });
  const server = serve({ fetch: health.fetch, port: Number(process.env.WORKER_HEALTH_PORT ?? 3102), hostname: '0.0.0.0' });
  registerShutdown(async () => {
    await workerHeartbeat('remove', id).catch(() => {});
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }, () => { if ('closeAllConnections' in server) server.closeAllConnections(); }, () => clearInterval(heartbeat));
}
