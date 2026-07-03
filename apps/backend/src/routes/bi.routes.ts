import { Hono } from 'hono';
import { prisma } from '../lib/prisma.js';

const biRoutes = new Hono<{ Variables: { tenantId: string } }>();

// Multi-tenant BI Token validation middleware
biRoutes.use('*', async (c, next) => {
  const authHeader = c.req.header('Authorization');
  const queryToken = c.req.query('token');
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7).trim() : queryToken?.trim();

  if (!token) {
    return c.json({
      error: 'Unauthorized',
      message: 'BI Connector token bulunamadı. Lütfen Authorization header veya token parametresi gönderin.',
    }, 401);
  }

  const setting = await prisma.tenantSetting.findFirst({
    where: { key: 'security.bi.token', value: token },
    select: { tenantId: true },
  });

  if (!setting) {
    return c.json({
      error: 'Unauthorized',
      message: 'Geçersiz veya süresi dolmuş BI Connector tokenı.',
    }, 401);
  }

  // Verify Enterprise Plan
  const tenant = await prisma.tenant.findUnique({
    where: { id: setting.tenantId },
    select: { plan: true },
  });

  if (tenant?.plan !== 'ENTERPRISE') {
    return c.json({
      error: 'Forbidden',
      message: 'BI veri ambarı bağlayıcısı özelliği sadece Enterprise plan müşterileri içindir.',
    }, 403);
  }

  c.set('tenantId', setting.tenantId);
  await next();
});

// GET /export/:entity
biRoutes.get('/export/:entity', async (c) => {
  const tenantId = c.get('tenantId');
  const entity = c.req.param('entity');
  const sinceParam = c.req.query('since');

  let sinceDate: Date | undefined;
  if (sinceParam) {
    const parsed = Date.parse(sinceParam);
    if (!Number.isNaN(parsed)) {
      sinceDate = new Date(parsed);
    }
  }

  const dateFilter = sinceDate ? { updatedAt: { gte: sinceDate } } : {};

  if (entity === 'products') {
    const data = await prisma.product.findMany({
      where: { tenantId, deletedAt: null, ...dateFilter },
      select: {
        id: true,
        code: true,
        name: true,
        barcode: true,
        salesPrice: true,
        purchasePrice: true,
        minStockLevel: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { updatedAt: 'asc' },
      take: 10000,
    });
    return c.json({ count: data.length, data });
  }

  if (entity === 'contacts') {
    const data = await prisma.contact.findMany({
      where: { tenantId, deletedAt: null, ...dateFilter },
      select: {
        id: true,
        type: true,
        code: true,
        name: true,
        taxNumber: true,
        taxOffice: true,
        email: true,
        phone: true,
        city: true,
        country: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { updatedAt: 'asc' },
      take: 10000,
    });
    return c.json({ count: data.length, data });
  }

  if (entity === 'invoices') {
    const data = await prisma.invoice.findMany({
      where: { tenantId, deletedAt: null, ...dateFilter },
      select: {
        id: true,
        number: true,
        type: true,
        status: true,
        date: true,
        dueDate: true,
        currencyCode: true,
        totalGross: true,
        totalNet: true,
        totalTax: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { updatedAt: 'asc' },
      take: 10000,
    });
    return c.json({ count: data.length, data });
  }

  if (entity === 'ledger') {
    const data = await prisma.journalEntry.findMany({
      where: { tenantId, ...dateFilter },
      include: {
        lines: {
          select: {
            id: true,
            debit: true,
            credit: true,
            description: true,
            account: {
              select: {
                code: true,
                name: true,
              },
            },
          },
        },
      },
      orderBy: { updatedAt: 'asc' },
      take: 5000,
    });
    return c.json({ count: data.length, data });
  }

  return c.json({
    error: 'Bad Request',
    message: `Bilinmeyen veya desteklenmeyen veri ambarı varlığı: ${entity}. Desteklenenler: products, contacts, invoices, ledger.`,
  }, 400);
});

export { biRoutes };
