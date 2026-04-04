import { Hono } from 'hono';
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
import { paymentRoutes } from './routes/payment.routes';
import { authRoutes } from './routes/auth.routes';

const app = new Hono();
const PORT = Number(process.env.PORT) || 3001;

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

// ── Starter Plan Routes ──────────────────────
app.route('/api/users', userRoutes);
app.route('/api/products', productRoutes);
app.route('/api/warehouses', warehouseRoutes);
app.route('/api/contacts', contactRoutes);
app.route('/api/invoices', invoiceRoutes);
app.route('/api/sales-orders', salesOrderRoutes);
app.route('/api/accounting', accountingRoutes);
app.route('/api/payments', paymentRoutes);
app.route('/api/stock', stockRoutes);
app.route('/api/master', masterDataRoutes);
app.route('/api/reports', reportingRoutes);

// ── Başlangıç logu ───────────────────────────
serve({ fetch: app.fetch, port: PORT }, () => {
  printBanner(PORT);
});
