import { Hono } from 'hono';
import { registerDomainEventListeners } from '../../domain-events/index.js';
import { registerChatWebSocket } from '../../modules/collaboration/index.js';
import type { RuntimeConfig } from '../runtime-config.js';
import { registerErrorHandlers } from './error-handlers.js';
import { registerPreRoutingMiddleware } from './middleware.js';
import { registerPublicRoutes, registerTenantRoutes } from './routes.js';

let listenersRegistered = false;

export function createApp(config: RuntimeConfig): Hono {
  if (!listenersRegistered) {
    registerDomainEventListeners();
    listenersRegistered = true;
  }

  const app = new Hono();
  registerPreRoutingMiddleware(app, config);
  registerChatWebSocket(app, config.allowedOrigins, config.isProduction);
  registerPublicRoutes(app);
  registerTenantRoutes(app);
  registerErrorHandlers(app, config.isProduction);
  return app;
}
