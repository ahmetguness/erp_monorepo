import { randomUUID } from 'node:crypto';
import type { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from '../../lib/logger.js';
import { csrfProtection } from '../../middleware/csrfProtection.js';
import { globalRateLimit } from '../../middleware/globalRateLimit.js';
import { securityHeaders } from '../../middleware/securityHeaders.js';
import { validateJsonRequestBody } from '../../middleware/validateBody.js';
import { recordHttpRequest, runWithObservabilityContext } from '../../services/observability.service.js';
import type { RuntimeConfig } from '../runtime-config.js';

const REQUEST_HEADER_PATTERN = /^[a-zA-Z0-9._-]{1,128}$/;

interface RequestHeaders {
  req: { header: (name: string) => string | undefined };
}

function readRequestId(context: RequestHeaders): string {
  const candidate = context.req.header('x-request-id')?.trim();
  return candidate && REQUEST_HEADER_PATTERN.test(candidate) ? candidate : randomUUID();
}

function readCorrelationId(context: RequestHeaders, requestId: string): string {
  const candidate = context.req.header('x-correlation-id')?.trim();
  return candidate && REQUEST_HEADER_PATTERN.test(candidate) ? candidate : requestId;
}

export function registerPreRoutingMiddleware(app: Hono, config: RuntimeConfig): void {
  app.use('*', securityHeaders);
  app.use('*', cors({
    origin: (origin) => {
      if (!origin) return config.isProduction ? '' : '*';
      if (config.allowedOrigins.includes(origin)) return origin;
      return !config.isProduction && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin) ? origin : '';
    },
    allowMethods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization', 'x-api-key', 'x-request-id', 'x-correlation-id'],
    exposeHeaders: ['Content-Length', 'x-request-id', 'x-correlation-id'],
    maxAge: 86400,
    credentials: true,
  }));

  app.use('*', async (context, next) => {
    const start = Date.now();
    const requestId = readRequestId(context);
    const correlationId = readCorrelationId(context, requestId);
    context.header('x-request-id', requestId);
    context.header('x-correlation-id', correlationId);
    await runWithObservabilityContext({ requestId, correlationId }, next);

    const durationMs = Date.now() - start;
    const request = { method: context.req.method, path: context.req.path, status: context.res.status, durationMs, requestId, correlationId };
    recordHttpRequest(request);
    logger.http(request.method, request.path, request.status, durationMs, { requestId, correlationId });
    if (durationMs >= 1_000) logger.warn('[HTTP] Slow endpoint detected', request);
  });

  app.use('*', globalRateLimit);
  app.use('*', validateJsonRequestBody);
}

export function registerBrowserProtection(app: Hono): void {
  app.use('*', csrfProtection);
}
