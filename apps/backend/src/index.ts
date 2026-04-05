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

// ── Admin Panel ──────────────────────────────
app.route('/api/admin', adminRoutes);

// ── Starter Plan Routes ──────────────────────
app.route('/api/users', userRoutes);
app.route('/api/products', productRoutes);
app.route('/api/warehouses', warehouseRoutes);
app.route('/api/contacts', contactRoutes);
app.route('/api/invoices', invoiceRoutes);
app.route('/api/sales-orders', salesOrderRoutes);
app.route('/api/purchase-orders', purchaseOrderRoutes);
app.route('/api/accounting', accountingRoutes);
app.route('/api/payments', paymentRoutes);
app.route('/api/stock', stockRoutes);
app.route('/api/master', masterDataRoutes);
app.route('/api/reports', reportingRoutes);
app.route('/api/settings', settingsRoutes);
app.route('/api/notifications', notificationRoutes);
app.route('/api/audit-logs', auditLogRoutes);
app.route('/api/attachments', attachmentRoutes);
app.get('/api/currency-rates/tcmb', CurrencyRatesController.getTcmbRates);

// ── Professional Plan Routes ─────────────────
app.route('/api/api-keys', apiKeyRoutes);
app.route('/api/approvals', approvalRoutes);
app.route('/api/delivery-notes', deliveryNoteRoutes);
app.route('/api/e-documents', eDocumentRoutes);
app.route('/api/bank-transactions', bankTransactionRoutes);
app.route('/api/check-promissory', checkPromissoryRoutes);
app.route('/api/reconciliations', reconciliationRoutes);
app.route('/api/stock-valuations', stockValuationRoutes);
app.route('/api/inventory-reservations', inventoryReservationRoutes);
app.route('/api/product-batches', productBatchRoutes);
app.route('/api/lot-serials', lotSerialRoutes);
app.route('/api/roles', roleRoutes);

// ── Başlangıç logu ───────────────────────────
serve({ fetch: app.fetch, port: PORT }, () => {
  printBanner(PORT);
});
