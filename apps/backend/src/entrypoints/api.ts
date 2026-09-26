import { serve } from '@hono/node-server';
import type { Hono } from 'hono';
import { printBanner } from '../lib/logger.js';
import type { RuntimeConfig } from '../bootstrap/runtime-config.js';
import { startWorkers } from '../bootstrap/workers.js';
import { injectChatWebSocket } from '../modules/collaboration/index.js';

export function startApi(app: Hono, config: RuntimeConfig): void {
  const server = serve({ fetch: app.fetch, port: config.port }, () => {
    printBanner(config.port);
    startWorkers(config.role);
  });
  injectChatWebSocket(app, server);
}
