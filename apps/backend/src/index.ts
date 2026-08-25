import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { serve } from '@hono/node-server';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { prisma } from './lib/prisma';
import { logger, printBanner } from './lib/logger';
import { requireAuth } from './middleware/requireAuth';
import { csrfProtection } from './middleware/csrfProtection';
import { securityHeaders } from './middleware/securityHeaders';
import { validateJsonRequestBody } from './middleware/validateBody';
import { BaseError, ValidationError } from './errors';

// Professional Plan Route Imports
import { TrendyolWorker } from './services/trendyol-worker.service';
import { DomainEventOutboxWorker } from './services/domain-event-outbox-worker.service';
import { startMarketplaceMocks } from './mocks';
import { registerDomainEventListeners } from './domain-events';
import { recordHttpRequest, recordUnhandledError, runWithObservabilityContext } from './services/observability.service';
import { globalRateLimit } from './middleware/globalRateLimit';
import { assertValidStartupEnv } from './config/env';
import { tenantIsolationBypass } from './lib/tenant-isolation-context';
import { tenantModules } from './modules/index.js';
import {
  registerAdminHttpSurface,
  registerExternalHttpSurface,
  registerProgrammaticHttpSurface,
  registerPublicHttpSurface,
} from './modules/http-surfaces/index.js';

// ── Startup env var kontrolü ─────────────────
assertValidStartupEnv();

// OpenAI opsiyonel — sadece chat aktifse gerekli
if (!process.env.OPENAI_API_KEY) {
  logger.warn('[Startup] OPENAI_API_KEY tanımlı değil — AI chat devre dışı.');
}

export const app = new Hono();
const PORT = Number(process.env.PORT) || 3001;
const IS_PRODUCTION = process.env.NODE_ENV === 'production';
const APP_ROLE = process.env.APP_ROLE ?? 'api';
const REQUEST_HEADER_PATTERN = /^[a-zA-Z0-9._-]{1,128}$/;

registerDomainEventListeners();

function shouldStartHttpServer(): boolean {
  return APP_ROLE !== 'worker';
}

function shouldStartMarketplaceWorker(): boolean {
  if (process.env.MARKETPLACE_WORKER_ENABLED === 'true') return true;
  if (process.env.MARKETPLACE_WORKER_ENABLED === 'false') return false;

  return APP_ROLE === 'worker' || APP_ROLE === 'all';
}

function shouldStartDomainEventOutboxWorker(): boolean {
  if (process.env.DOMAIN_EVENT_OUTBOX_WORKER_ENABLED === 'true') return true;
  if (process.env.DOMAIN_EVENT_OUTBOX_WORKER_ENABLED === 'false') return false;

  return APP_ROLE === 'worker' || APP_ROLE === 'all';
}

function startBackgroundServices(): void {
  if (shouldStartDomainEventOutboxWorker()) {
    DomainEventOutboxWorker.start();
  } else {
    logger.info('[DomainEventOutboxWorker] Disabled. Set DOMAIN_EVENT_OUTBOX_WORKER_ENABLED=true or APP_ROLE=worker/all to enable.');
  }

  if (shouldStartMarketplaceWorker()) {
    TrendyolWorker.start();
  } else {
    logger.info('[TrendyolWorker] Disabled. Set MARKETPLACE_WORKER_ENABLED=true or APP_ROLE=worker to enable.');
  }
  startMarketplaceMocks();
}

function getRequestId(c: { req: { header: (name: string) => string | undefined } }): string {
  const candidate = c.req.header('x-request-id')?.trim();
  return candidate && REQUEST_HEADER_PATTERN.test(candidate) ? candidate : randomUUID();
}

function getCorrelationId(c: { req: { header: (name: string) => string | undefined } }, requestId: string): string {
  const candidate = c.req.header('x-correlation-id')?.trim();
  return candidate && REQUEST_HEADER_PATTERN.test(candidate) ? candidate : requestId;
}

// ── CORS & CSRF ───────────────────────────────
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || 'http://localhost:3000')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

app.use('*', securityHeaders);

app.use('*', cors({
  origin: (origin) => {
    // Production'da origin zorunlu — server-to-server için API key kullanılmalı
    if (!origin) return IS_PRODUCTION ? '' : '*';
    if (ALLOWED_ORIGINS.includes(origin)) return origin;
    if (!IS_PRODUCTION && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
      return origin;
    }
    return '';
  },
  allowMethods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization', 'x-api-key', 'x-request-id', 'x-correlation-id'],
  exposeHeaders: ['Content-Length', 'x-request-id', 'x-correlation-id'],
  maxAge: 86400,
  credentials: true,
}));

// ── HTTP istek logu ──────────────────────────
app.use('*', async (c, next) => {
  const start = Date.now();
  const requestId = getRequestId(c);
  const correlationId = getCorrelationId(c, requestId);
  c.header('x-request-id', requestId);
  c.header('x-correlation-id', correlationId);

  await runWithObservabilityContext({ requestId, correlationId }, next);
  const durationMs = Date.now() - start;
  recordHttpRequest({
    method: c.req.method,
    path: c.req.path,
    status: c.res.status,
    durationMs,
    requestId,
    correlationId,
  });
  logger.http(c.req.method, c.req.path, c.res.status, durationMs, { requestId, correlationId });
  if (durationMs >= 1_000) {
    logger.warn('[HTTP] Slow endpoint detected', {
      method: c.req.method,
      path: c.req.path,
      status: c.res.status,
      durationMs,
      requestId,
      correlationId,
    });
  }
});

// ── Routes ───────────────────────────────────
app.use('*', globalRateLimit);
app.use('*', validateJsonRequestBody);

app.get('/', (c) => c.json({ status: 'ok', service: 'Axon ERP API' }));

// ── Public Health Check ─────────────────────
app.get('/health', (c) => c.json({ status: 'ok' }));

// ── Public webhooks (CSRF'den önce — harici çağrıcılar Origin göndermez) ──
app.use('/api/public/*', tenantIsolationBypass('public-api'));
app.use('/api/scim/v2/*', tenantIsolationBypass('scim-provisioning'));
app.use('/api/bi/v1/*', tenantIsolationBypass('bi-connector'));
app.use('/api/portal/v1/*', tenantIsolationBypass('customer-portal'));
app.use('/api/auth/*', tenantIsolationBypass('auth-bootstrap'));
app.use('/api/admin/*', tenantIsolationBypass('admin-console'));

registerProgrammaticHttpSurface(app);

// ── CSRF koruması (state-changing isteklerde Origin/Referer doğrulaması) ──
app.use('*', csrfProtection);

// ── Auth (public) ────────────────────────────
registerPublicHttpSurface(app);

// ── Public routes (JWT gerektirmez) ──────────

// ── Admin Panel ──────────────────────────────
registerAdminHttpSurface(app);

// ── Tenant Routes (JWT protected) ────────────
const tenantApi = new Hono();
tenantApi.use('*', requireAuth);

for (const module of tenantModules) {
  module.register(tenantApi);
}

// ── External API (API Key auth) ──────────────
registerExternalHttpSurface(app);

// Mount tenant routes under /api (after more specific routes)
app.route('/api', tenantApi);

// ── Global error handler ─────────────────────
app.onError((err, c) => {
  const requestId = c.res.headers.get('x-request-id') ?? c.req.header('x-request-id') ?? 'unknown';
  const correlationId = c.res.headers.get('x-correlation-id') ?? c.req.header('x-correlation-id') ?? requestId;
  recordUnhandledError({
    method: c.req.method,
    path: c.req.path,
    message: err.message,
    requestId,
    correlationId,
  });

  if (err instanceof BaseError && err.isOperational) {
    logger.warn(`Operational error: ${err.message}`, { requestId, correlationId });
    return c.json(err.toJSON(), err.statusCode as 400);
  }

  if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
    const target = Array.isArray(err.meta?.target) ? err.meta.target.filter((field): field is string => typeof field === 'string') : [];
    const fieldLabels: Record<string, string> = {
      taxNumber: 'Vergi numarası',
      email: 'E-posta',
      code: 'Kod',
      slug: 'Slug',
      iban: 'IBAN',
      number: 'Numara',
    };
    const fields = Object.fromEntries(
      target.map((field) => [field, `${fieldLabels[field] ?? field} zaten kullanımda.`]),
    );
    const message = target.length === 1
      ? `${fieldLabels[target[0]] ?? target[0]} zaten kullanımda.`
      : 'Bu kayıt için benzersiz olması gereken bir alan zaten kullanımda.';
    const validationError = new ValidationError(message, Object.keys(fields).length > 0 ? fields : undefined);
    logger.warn(`Prisma unique constraint violation: ${target.join(', ') || 'unknown'}`, { requestId, correlationId });
    return c.json(validationError.toJSON(), 400);
  }

  logger.error(`Unhandled error: ${err.message}`, { requestId, correlationId });

  if (IS_PRODUCTION) {
    return c.json({
      error: { code: 'INTERNAL_ERROR', message: 'Beklenmeyen bir hata oluştu.' },
    }, 500);
  }

  return c.json({
    error: { code: 'INTERNAL_ERROR', message: err.message, stack: err.stack },
  }, 500);
});

// ── 404 handler ──────────────────────────────
app.notFound((c) => {
  return c.json({ error: { code: 'NOT_FOUND', message: 'Endpoint bulunamadı.' } }, 404);
});

// ── Başlangıç ────────────────────────────────
if (process.env.NODE_ENV !== 'test' && shouldStartHttpServer()) {
  serve({ fetch: app.fetch, port: PORT }, () => {
    printBanner(PORT);
    startBackgroundServices();
  });
} else if (process.env.NODE_ENV !== 'test') {
  logger.info('[Startup] APP_ROLE=worker; HTTP API server disabled.');
  startBackgroundServices();
}
