import { logger } from '../lib/logger.js';
import { startWorkers } from '../bootstrap/workers.js';
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { workerHeartbeat } from '../lib/rateLimiter.js';
import { runtimeHealth } from '../bootstrap/operations/runtime-health.js';
import { registerShutdown } from '../bootstrap/operations/register-shutdown.js';

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
  const server = createServer((request, response) => {
    if (request.url === '/health') { response.writeHead(200); response.end('ok'); return; }
    if (request.url !== '/ready') { response.writeHead(404); response.end(); return; }
    void runtimeHealth.read().then((report) => {
      response.writeHead(report.status === 'ready' ? 200 : 503, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      response.end(JSON.stringify(report));
    }).catch(() => { response.writeHead(503); response.end(); });
  });
  server.listen(Number(process.env.WORKER_HEALTH_PORT ?? 3102), '0.0.0.0');
  registerShutdown(async () => {
    await workerHeartbeat('remove', id).catch(() => {});
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }, () => server.closeAllConnections(), () => clearInterval(heartbeat));
}
