import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { serve } from '@hono/node-server';
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
import { auditLogRoutes } from './routes/audit-log.routes';
import { attachmentRoutes } from './routes/attachment.routes';
import { CurrencyRatesController } from './controllers/currency-rates.controller';
import { adminRoutes } from './routes/admin.routes';
import { requireAuth } from './middleware/requireAuth';

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
import { SetPasswordController } from './controllers/set-password.controller';

const app = new Hono();
const PORT = Number(process.env.PORT) || 3001;

// ── CORS ─────────────────────────────────────
app.use('*', cors({
  origin: (origin) => origin ?? '*',
  allowMethods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization', 'x-tenant-id'],
  exposeHeaders: ['Content-Length'],
  maxAge: 86400,
}));

// ── HTTP istek logu ──────────────────────────
app.use('*', async (c, next) => {
  const start = Date.now();
  await next();
  logger.http(c.req.method, c.req.path, c.res.status, Date.now() - start);
});

// ── Routes ───────────────────────────────────
app.get('/', (c) => c.json({ status: 'ok', service: 'Axon ERP API' }));

app.get('/health', async (c) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return c.json({ status: 'ok', db: 'connected' });
  } catch {
    return c.json({ status: 'error', db: 'disconnected' }, 500);
  }
});

// ── Auth (public) ────────────────────────────
app.route('/api/auth', authRoutes);

// ── Public routes (JWT gerektirmez) ──────────
app.route('/api/public', demoPublicRoutes);
app.post('/api/public/set-password', SetPasswordController.setPassword);
app.post('/api/public/set-password/validate', SetPasswordController.validateToken);

// ── Admin Panel ──────────────────────────────
app.route('/api/admin', adminRoutes);
app.route('/api/admin', demoAdminRoutes);

// ── Tenant Routes (JWT protected) ────────────
const tenantApi = new Hono();
tenantApi.use('*', requireAuth);

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
tenantApi.route('/audit-logs', auditLogRoutes);
tenantApi.route('/attachments', attachmentRoutes);
tenantApi.get('/currency-rates/tcmb', CurrencyRatesController.getTcmbRates);

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

// ── External API (API Key auth) ──────────────
app.route('/api/external', externalRoutes);

// Mount tenant routes under /api (after more specific routes)
app.route('/api', tenantApi);

// ── Başlangıç logu ───────────────────────────
serve({ fetch: app.fetch, port: PORT }, () => {
  printBanner(PORT);
});
