import { serve } from '@hono/node-server';
import type { Hono } from 'hono';
import { printBanner } from '../lib/logger.js';
import type { RuntimeConfig } from '../bootstrap/runtime-config.js';
import { startWorkers } from '../bootstrap/workers.js';
import { injectChatWebSocket, closeChatWebSockets } from '../modules/collaboration/index.js';
import { registerShutdown } from '../bootstrap/operations/register-shutdown.js';

export function startApi(app: Hono, config: RuntimeConfig): void {
  const server = serve({ fetch: app.fetch, port: config.port }, () => {
    printBanner(config.port);
    startWorkers(config.role);
  });
  injectChatWebSocket(app, server);
  registerShutdown(async () => {
    const sockets = closeChatWebSockets(app);
    const http = new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
    if ('closeIdleConnections' in server) server.closeIdleConnections();
    await Promise.all([http, sockets]);
  }, () => { if ('closeAllConnections' in server) server.closeAllConnections(); });
}
