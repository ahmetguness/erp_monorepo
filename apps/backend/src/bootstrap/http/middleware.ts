import { randomUUID } from 'node:crypto';
import type { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from '../../lib/logger.js';
import { csrfProtection } from '../../middleware/csrfProtection.js';
import { globalRateLimit } from '../../middleware/globalRateLimit.js';
import { securityHeaders } from '../../middleware/securityHeaders.js';
import { validateJsonRequestBody } from '../../middleware/validateBody.js';
import { enforceResponseContract } from '../../modules/shared/index.js';
import { recordHttpRequest, runWithObservabilityContext } from '../../services/observability.service.js';
import type { RuntimeConfig } from '../runtime-config.js';
import { matchedRoutes } from 'hono/route';
import { withSpan } from '../../lib/telemetry/tracing.js';
import { traceparent, traceContext, type TraceContext } from '../../lib/telemetry/context.js';
import { observeTelemetry, countTelemetry, trackHttpRequest } from '../../lib/telemetry/metrics.js';

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
  app.use('*', enforceResponseContract);
  app.use('*', securityHeaders);
  app.use('*', cors({
    origin: (origin) => {
      if (!origin) return config.isProduction ? '' : '*';
      if (config.allowedOrigins.includes(origin)) return origin;
      return !config.isProduction && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin) ? origin : '';
    },
    allowMethods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
    allowHeaders: [
      'Content-Type',
      'Authorization',
      'x-api-key',
      'x-request-id',
      'x-correlation-id',
      'X-Support-Session',
      'X-Support-Tenant',
      'Idempotency-Key',
      'idempotency-key',
      'x-change-reason',
      'x-approval-id',
      'x-sandbox-mode',
      'x-api-sandbox',
      'traceparent',
      'X-Portal-Token',
      'X-Contact-Id',
    ],
    exposeHeaders: ['Content-Length', 'x-request-id', 'x-correlation-id', 'x-axon-release', 'traceparent', 'x-content-sha256'],
    maxAge: 86400,
    credentials: true,
  }));

  app.use('*', async (context, next) => {
    const start = Date.now();
    const requestId = readRequestId(context);
    const correlationId = readCorrelationId(context, requestId);
    context.set('requestId', requestId);
    context.set('correlationId', correlationId);
    context.header('x-request-id', requestId);
    context.header('x-correlation-id', correlationId);
    context.header('x-axon-release', process.env.RELEASE_GIT_SHA ?? 'development');
    const attributes: Record<string, string | number> = { 'http.request.method': context.req.method };
    let requestTrace: TraceContext | undefined;
    await withSpan('http.request', 2, attributes, async () => {
      requestTrace = traceContext.getStore();
      const untrack = trackHttpRequest();
      context.header('traceparent', traceparent() ?? '');
      // Finalize route/status before either request span is exported.
      await runWithObservabilityContext({ requestId, correlationId }, () => withSpan('application.request', 1, attributes, async () => {
        try { await next(); }
        finally {
          untrack();
          const route = matchedRoutes(context).filter(row => row.method === context.req.method && !['*', '/*'].includes(row.path)).at(-1)?.path ?? 'unmatched';
          attributes['http.route'] = route;
          attributes['http.response.status_code'] = context.res.status;
          countTelemetry('axon_http_requests_total');
          if (context.res.status >= 500) countTelemetry('axon_http_errors_total');
          if (context.res.status >= 500 && (route.startsWith('/api/payments') || route.includes('/webhook'))) countTelemetry('axon_payment_webhook_failures_total');
          if (context.res.status >= 400 && /\/(?:login|mfa\/verify|mfa\/challenge)$/.test(route)) countTelemetry('axon_authentication_failures_total');
          observeTelemetry('axon_http_request_duration_seconds', (Date.now() - start) / 1000, { method: context.req.method, route, status: String(context.res.status) });
          if (context.res.status >= 400) countTelemetry(context.res.status >= 500 ? 'axon_http_server_errors_total' : 'axon_http_client_errors_total');
        }
      }));
    }, context.req.header('traceparent') ?? null);

    const durationMs = Date.now() - start;
    const path = typeof attributes['http.route'] === 'string' ? attributes['http.route'] : 'unmatched';
    const request = { method: context.req.method, path, status: context.res.status, durationMs, requestId, correlationId };
    recordHttpRequest(request);
    const log = () => {
      logger.http(request.method, request.path, request.status, durationMs, { requestId, correlationId, operation: 'http.request', result: request.status < 400 ? 'success' : 'failure' });
      if (durationMs >= 1_000) logger.warn('[HTTP] Slow endpoint detected', request);
    };
    if (requestTrace) traceContext.run(requestTrace, log); else log();
  });

  app.use('*', globalRateLimit);
  app.use('*', validateJsonRequestBody);
}

export function registerBrowserProtection(app: Hono): void {
  app.use('*', csrfProtection);
}
