import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { serve } from '@hono/node-server';
import { randomUUID } from 'crypto';
import { prisma } from './lib/prisma';
import { logger, printBanner } from './lib/logger';
import { userRoutes } from './routes/user.routes';
import { productRoutes } from './routes/product.routes';
import { warehouseRoutes } from './routes/warehouse.routes';
import { contactRoutes } from './routes/contact.routes';
import { invoiceRoutes } from './routes/invoice.routes';
import { accountingRoutes } from './routes/accounting.routes';
import { reportingRoutes } from './routes/reporting.routes';
import { masterDataRoutes } from './routes/master-data.routes';
import { stockRoutes } from './routes/stock.routes';
import { salesOrderRoutes } from './routes/sales-order.routes';
import { purchaseOrderRoutes } from './routes/purchase-order.routes';
import { paymentRoutes } from './routes/payment.routes';
import { authRoutes } from './routes/auth.routes';
import { settingsRoutes } from './routes/settings.routes';
import { notificationRoutes } from './routes/notification.routes';
import { taskRoutes } from './routes/task.routes';
import { searchRoutes } from './routes/search.routes';
import { dataExchangeRoutes } from './routes/data-exchange.routes';
import { intelligenceRoutes } from './routes/intelligence.routes';
import { automationRuleRoutes } from './routes/automation-rule.routes';
import { auditLogRoutes } from './routes/audit-log.routes';
import { attachmentRoutes } from './routes/attachment.routes';
import { CurrencyRatesController } from './controllers/currency-rates.controller';
import { adminRoutes } from './routes/admin.routes';
import { requireAuth } from './middleware/requireAuth';
import { requirePermission } from './middleware/requirePermission';
import { csrfProtection } from './middleware/csrfProtection';
import { securityHeaders } from './middleware/securityHeaders';
import { BaseError } from './errors';

// Professional Plan Route Imports
import { apiKeyRoutes } from './routes/api-key.routes';
import { approvalRoutes } from './routes/approval.routes';
import { deliveryNoteRoutes } from './routes/delivery-note.routes';
import { eDocumentRoutes } from './routes/e-document.routes';
import { bankTransactionRoutes } from './routes/bank-transaction.routes';
import { checkPromissoryRoutes } from './routes/check-promissory.routes';
import { reconciliationRoutes } from './routes/reconciliation.routes';
import { stockValuationRoutes } from './routes/stock-valuation.routes';
import { inventoryReservationRoutes } from './routes/inventory-reservation.routes';
import { productBatchRoutes } from './routes/product-batch.routes';
import { lotSerialRoutes } from './routes/lot-serial.routes';
import { roleRoutes } from './routes/role.routes';
import { externalRoutes } from './routes/external.routes';
import { productionRoutes } from './routes/production.routes';
import { serviceRoutes } from './routes/service.routes';
import { marketplaceRoutes } from './routes/marketplace.routes';
import { hrRoutes } from './routes/hr.routes';
import { payrollRoutes } from './routes/payroll.routes';
import { mailRoutes } from './routes/mail.routes';
import { demoPublicRoutes, demoAdminRoutes } from './routes/demo.routes';
import { invitationRoutes, invitationPublicRoutes } from './routes/invitation.routes';
import { SetPasswordController } from './controllers/set-password.controller';
import { chatRoutes } from './routes/chat.routes';
import { publicChatRoutes } from './routes/public-chat.routes';
import { activityRoutes } from './routes/activity.routes';
import { savedViewRoutes } from './routes/saved-view.routes';
import { domainEventRoutes } from './routes/domain-event.routes';
import { TrendyolWebhookController } from './controllers/trendyol-webhook.controller';
import { TrendyolWorker } from './services/trendyol-worker.service';
import { DomainEventOutboxWorker } from './services/domain-event-outbox-worker.service';
import { startMarketplaceMocks } from './mocks';
import { registerDomainEventListeners } from './domain-events';
import { recordHttpRequest, recordUnhandledError, runWithObservabilityContext } from './services/observability.service';
import { globalRateLimit } from './middleware/globalRateLimit';
import { assertValidStartupEnv, getRuntimeConfigChecks } from './config/env';

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

// ── CORS ─────────────────────────────────────
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || 'http://localhost:3000')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

app.use('*', securityHeaders);

app.use('*', cors({
  origin: (origin) => {
    // Production'da origin zorunlu — server-to-server için API key kullanılmalı
    if (!origin) return IS_PRODUCTION ? '' : '*';
    return ALLOWED_ORIGINS.includes(origin) ? origin : '';
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

app.get('/', (c) => c.json({ status: 'ok', service: 'Axon ERP API' }));

// ── Health Check (genişletilmiş) ─────────────
app.get('/health', async (c) => {
  const checks: Record<string, 'ok' | 'error' | 'disabled'> = {};

  // DB kontrolü
  try {
    await prisma.$queryRaw`SELECT 1`;
    checks.db = 'ok';
  } catch {
    checks.db = 'error';
  }

  // OpenAI kontrolü (opsiyonel)
  checks.openai = process.env.OPENAI_API_KEY ? 'ok' : 'disabled';

  // Resend (mail) kontrolü (opsiyonel)
  checks.mail = process.env.RESEND_API_KEY ? 'ok' : 'disabled';

  // Redis kontrolü (opsiyonel)
  checks.redis = process.env.REDIS_URL ? 'ok' : 'disabled';

  const runtimeConfig = getRuntimeConfigChecks();
  const hasError = Object.values(checks).includes('error') || runtimeConfig.some((check) => check.status === 'error');
  const status = hasError ? 'degraded' : 'ok';

  return c.json({ status, checks, runtimeConfig, uptime: process.uptime() }, hasError ? 503 : 200);
});

// ── Public webhooks (CSRF'den önce — harici çağrıcılar Origin göndermez) ──
app.post('/api/public/trendyol/webhook/:integrationId', TrendyolWebhookController.handle);
app.post('/api/public/marketplace/webhook/:integrationId', TrendyolWebhookController.handle);

// ── CSRF koruması (state-changing isteklerde Origin/Referer doğrulaması) ──
app.use('*', csrfProtection);

// ── Auth (public) ────────────────────────────
app.route('/api/auth', authRoutes);

// ── Public routes (JWT gerektirmez) ──────────
app.route('/api/public', demoPublicRoutes);
app.route('/api/public', invitationPublicRoutes);
app.route('/api/public', publicChatRoutes);
app.post('/api/public/set-password', SetPasswordController.setPassword);
app.post('/api/public/set-password/validate', SetPasswordController.validateToken);

// ── Admin Panel ──────────────────────────────
app.route('/api/admin', adminRoutes);
app.route('/api/admin', demoAdminRoutes);

// ── Tenant Routes (JWT protected) ────────────
const tenantApi = new Hono();
tenantApi.use('*', requireAuth);

// Starter Plan Routes (tüm planlara açık)
tenantApi.route('/users', userRoutes);
tenantApi.route('/products', productRoutes);
tenantApi.route('/warehouses', warehouseRoutes);
tenantApi.route('/contacts', contactRoutes);
tenantApi.route('/invoices', invoiceRoutes);
tenantApi.route('/sales-orders', salesOrderRoutes);
tenantApi.route('/purchase-orders', purchaseOrderRoutes);
tenantApi.route('/accounting', accountingRoutes);
tenantApi.route('/payments', paymentRoutes);
tenantApi.route('/stock', stockRoutes);
tenantApi.route('/master', masterDataRoutes);
tenantApi.route('/reports', reportingRoutes);
tenantApi.route('/settings', settingsRoutes);
tenantApi.route('/notifications', notificationRoutes);
tenantApi.route('/tasks', taskRoutes);
tenantApi.route('/search', searchRoutes);
tenantApi.route('/data-exchange', dataExchangeRoutes);
tenantApi.route('/intelligence', intelligenceRoutes);
tenantApi.route('/automation-rules', automationRuleRoutes);
tenantApi.route('/audit-logs', auditLogRoutes);
tenantApi.route('/activity', activityRoutes);
tenantApi.route('/saved-views', savedViewRoutes);
tenantApi.route('/domain-events', domainEventRoutes);
tenantApi.route('/attachments', attachmentRoutes);
tenantApi.route('/invitations', invitationRoutes);
tenantApi.get('/currency-rates/tcmb', requirePermission('settings', 'READ'), CurrencyRatesController.getTcmbRates);
tenantApi.get('/currency-rates', requirePermission('settings', 'READ'), CurrencyRatesController.listRates);
tenantApi.post('/currency-rates', requirePermission('settings', 'UPDATE'), CurrencyRatesController.createRate);

// Professional Plan Routes
tenantApi.route('/api-keys', apiKeyRoutes);
tenantApi.route('/approvals', approvalRoutes);
tenantApi.route('/delivery-notes', deliveryNoteRoutes);
tenantApi.route('/e-documents', eDocumentRoutes);
tenantApi.route('/bank-transactions', bankTransactionRoutes);
tenantApi.route('/check-promissory', checkPromissoryRoutes);
tenantApi.route('/reconciliations', reconciliationRoutes);
tenantApi.route('/stock-valuations', stockValuationRoutes);
tenantApi.route('/inventory-reservations', inventoryReservationRoutes);
tenantApi.route('/product-batches', productBatchRoutes);
tenantApi.route('/lot-serials', lotSerialRoutes);
tenantApi.route('/roles', roleRoutes);

// Enterprise Plan Routes
tenantApi.route('/production', productionRoutes);
tenantApi.route('/service', serviceRoutes);
tenantApi.route('/marketplace', marketplaceRoutes);
tenantApi.route('/hr', hrRoutes);
tenantApi.route('/payroll', payrollRoutes);
tenantApi.route('/mail', mailRoutes);
tenantApi.route('/chat', chatRoutes);

// ── External API (API Key auth) ──────────────
app.route('/api/external', externalRoutes);

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
