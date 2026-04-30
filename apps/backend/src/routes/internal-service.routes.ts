import { Hono } from 'hono';
import { requireServiceAuth } from '../middleware/requireServiceAuth';
import { prisma } from '../lib/prisma';
import { InvoiceStatus, InvoiceType, PaymentStatus, OrderStatus, PurchaseOrderStatus, MarketplaceChannel } from '@prisma/client';

/**
 * Internal Service API — n8n chatbot workflow'u için.
 *
 * Güvenlik kuralları:
 * 1. Service JWT zorunlu (short-lived, scope'lu)
 * 2. tenantId HER ZAMAN JWT'den alınır — query/body'den ASLA
 * 3. Sadece okuma işlemleri (read scope'ları)
 * 4. Yanıtlar sınırlı (max 50 kayıt) — AI context window koruması
 */

const routes = new Hono();

// ── Faturalar ────────────────────────────────
routes.get(
  '/invoices',
  requireServiceAuth('read:invoices'),
  async (c) => {
    const tenantId = c.get('tenantId'); // JWT'den — güvenilir
    const status = c.req.query('status') as InvoiceStatus | undefined;
    const type = c.req.query('type') as InvoiceType | undefined;
    const limit = Math.min(Number(c.req.query('limit')) || 20, 50);

    const invoices = await prisma.invoice.findMany({
      where: {
        tenantId, // ← HER ZAMAN JWT'den
        ...(status && { status }),
        ...(type && { type }),
      },
      select: {
        id: true, number: true, date: true, dueDate: true,
        status: true, type: true, totalGross: true,
        contact: { select: { name: true } },
      },
      orderBy: { date: 'desc' },
      take: limit,
    });

    return c.json({ data: invoices, count: invoices.length });
  },
);

// ── Gelir Özeti ──────────────────────────────
routes.get(
  '/reports/revenue',
  requireServiceAuth('read:reports'),
  async (c) => {
    const tenantId = c.get('tenantId');
    const dateFrom = c.req.query('dateFrom');
    const dateTo = c.req.query('dateTo');

    if (!dateFrom || !dateTo) {
      return c.json({ error: 'dateFrom ve dateTo zorunlu.' }, 400);
    }

    const invoices = await prisma.invoice.findMany({
      where: {
        tenantId,
        type: InvoiceType.SALES,
        status: { not: InvoiceStatus.CANCELLED },
        date: { gte: new Date(dateFrom), lte: new Date(dateTo) },
      },
      select: { totalNet: true, totalTax: true, totalGross: true },
    });

    return c.json({
      data: {
        period: { from: dateFrom, to: dateTo },
        invoiceCount: invoices.length,
        totalNet: invoices.reduce((s, i) => s + Number(i.totalNet), 0),
        totalGross: invoices.reduce((s, i) => s + Number(i.totalGross), 0),
      },
    });
  },
);

// ── Cari Bakiyeler ───────────────────────────
routes.get(
  '/reports/balances',
  requireServiceAuth('read:contacts'),
  async (c) => {
    const tenantId = c.get('tenantId');
    const limit = Math.min(Number(c.req.query('limit')) || 20, 50);

    const contacts = await prisma.contact.findMany({
      where: { tenantId, deletedAt: null, isActive: true },
      select: {
        id: true, name: true, code: true, type: true,
        accountEntries: {
          orderBy: { date: 'desc' },
          take: 1,
          select: { balance: true, date: true },
        },
      },
      take: limit,
    });

    const result = contacts
      .map((ct) => ({
        name: ct.name,
        code: ct.code,
        type: ct.type,
        balance: ct.accountEntries[0] ? Number(ct.accountEntries[0].balance) : 0,
      }))
      .filter((ct) => ct.balance !== 0);

    const totalReceivable = result.filter((r) => r.balance > 0).reduce((s, r) => s + r.balance, 0);
    const totalPayable = result.filter((r) => r.balance < 0).reduce((s, r) => s + Math.abs(r.balance), 0);

    return c.json({
      data: { contacts: result, summary: { totalReceivable, totalPayable } },
    });
  },
);

// ── Stok Durumu ──────────────────────────────
routes.get(
  '/reports/stock',
  requireServiceAuth('read:stock'),
  async (c) => {
    const tenantId = c.get('tenantId');

    const stockLevels = await prisma.stockLevel.findMany({
      where: { tenantId, quantity: { gt: 0 } },
      include: {
        product: {
          select: { code: true, name: true, minStockLevel: true, averageCost: true },
        },
        warehouse: { select: { name: true } },
      },
      take: 50,
    });

    const belowMin = stockLevels.filter(
      (sl) => Number(sl.quantity) < Number(sl.product.minStockLevel),
    );

    return c.json({
      data: {
        totalItems: stockLevels.length,
        belowMinStockCount: belowMin.length,
        totalStockValue: stockLevels.reduce(
          (s, sl) => s + Number(sl.quantity) * Number(sl.product.averageCost), 0,
        ),
        belowMinStock: belowMin.map((sl) => ({
          product: sl.product.name,
          warehouse: sl.warehouse.name,
          quantity: Number(sl.quantity),
          minLevel: Number(sl.product.minStockLevel),
        })),
      },
    });
  },
);

// ── Gecikmiş Faturalar ───────────────────────
routes.get(
  '/reports/overdue',
  requireServiceAuth('read:invoices'),
  async (c) => {
    const tenantId = c.get('tenantId');

    const overdue = await prisma.invoice.findMany({
      where: {
        tenantId,
        status: InvoiceStatus.OVERDUE,
      },
      select: {
        number: true, date: true, dueDate: true, totalGross: true,
        contact: { select: { name: true } },
      },
      orderBy: { dueDate: 'asc' },
      take: 30,
    });

    return c.json({
      data: overdue,
      count: overdue.length,
      totalOverdue: overdue.reduce((s, i) => s + Number(i.totalGross), 0),
    });
  },
);

// ── Satış Siparişleri ─────────────────────────
routes.get(
  '/orders/sales',
  requireServiceAuth('read:orders'),
  async (c) => {
    const tenantId = c.get('tenantId');
    const status = c.req.query('status');
    const limit = Math.min(Number(c.req.query('limit')) || 20, 50);

    const orders = await prisma.salesOrder.findMany({
      where: {
        tenantId,
        deletedAt: null,
        ...(status && { status: status as OrderStatus }),
      },
      select: {
        number: true, date: true, dueDate: true, status: true,
        totalGross: true, invoicedAmount: true,
        contact: { select: { name: true } },
      },
      orderBy: { date: 'desc' },
      take: limit,
    });

    return c.json({ data: orders, count: orders.length });
  },
);

// ── Bekleyen Ödemeler ────────────────────────
routes.get(
  '/payments/pending',
  requireServiceAuth('read:payments'),
  async (c) => {
    const tenantId = c.get('tenantId');

    const payments = await prisma.payment.findMany({
      where: {
        tenantId,
        deletedAt: null,
        status: PaymentStatus.PENDING,
      },
      select: {
        date: true, amount: true, method: true, reference: true,
        contact: { select: { name: true } },
      },
      orderBy: { date: 'desc' },
      take: 30,
    });

    const totalPending = payments.reduce((s, p) => s + Number(p.amount), 0);

    return c.json({
      data: payments,
      count: payments.length,
      totalPending,
    });
  },
);

// ── Gider Özeti ──────────────────────────────
routes.get(
  '/reports/expenses',
  requireServiceAuth('read:reports'),
  async (c) => {
    const tenantId = c.get('tenantId');
    const dateFrom = c.req.query('dateFrom');
    const dateTo = c.req.query('dateTo');

    if (!dateFrom || !dateTo) {
      return c.json({ error: 'dateFrom ve dateTo zorunlu.' }, 400);
    }

    const invoices = await prisma.invoice.findMany({
      where: {
        tenantId,
        type: InvoiceType.PURCHASE,
        status: { not: InvoiceStatus.CANCELLED },
        date: { gte: new Date(dateFrom), lte: new Date(dateTo) },
      },
      select: { totalNet: true, totalTax: true, totalGross: true },
    });

    return c.json({
      data: {
        period: { from: dateFrom, to: dateTo },
        invoiceCount: invoices.length,
        totalNet: invoices.reduce((s, i) => s + Number(i.totalNet), 0),
        totalGross: invoices.reduce((s, i) => s + Number(i.totalGross), 0),
      },
    });
  },
);

// ── Satın Alma Siparişleri ───────────────────
routes.get(
  '/orders/purchase',
  requireServiceAuth('read:orders'),
  async (c) => {
    const tenantId = c.get('tenantId');
    const status = c.req.query('status');
    const limit = Math.min(Number(c.req.query('limit')) || 20, 50);

    const orders = await prisma.purchaseOrder.findMany({
      where: {
        tenantId,
        deletedAt: null,
        ...(status && { status: status as PurchaseOrderStatus }),
      },
      select: {
        number: true, date: true, dueDate: true, status: true, totalGross: true,
        contact: { select: { name: true } },
      },
      orderBy: { date: 'desc' },
      take: limit,
    });

    return c.json({ data: orders, count: orders.length });
  },
);

// ── Açık Servis Talepleri ────────────────────
routes.get(
  '/service/open',
  requireServiceAuth('read:service'),
  async (c) => {
    const tenantId = c.get('tenantId');

    const requests = await prisma.serviceRequest.findMany({
      where: {
        tenantId,
        deletedAt: null,
        status: { in: ['OPEN', 'IN_PROGRESS', 'WAITING_PARTS', 'WAITING_CUSTOMER'] },
      },
      select: {
        number: true, subject: true, status: true, priority: true,
        createdAt: true,
        contact: { select: { name: true } },
        customerAsset: { select: { name: true, brand: true, model: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 30,
    });

    return c.json({ data: requests, count: requests.length });
  },
);

// ── Çek/Senet Durumu ─────────────────────────
routes.get(
  '/checks/due',
  requireServiceAuth('read:payments'),
  async (c) => {
    const tenantId = c.get('tenantId');
    const now = new Date();
    const thirtyDaysLater = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    const checks = await prisma.checkPromissoryNote.findMany({
      where: {
        tenantId,
        deletedAt: null,
        status: { in: ['PENDING', 'DEPOSITED'] },
        dueDate: { lte: thirtyDaysLater },
      },
      select: {
        number: true, type: true, amount: true, dueDate: true,
        bankName: true, status: true,
      },
      orderBy: { dueDate: 'asc' },
      take: 30,
    });

    const overdue = checks.filter((ch) => new Date(ch.dueDate) < now);
    const upcoming = checks.filter((ch) => new Date(ch.dueDate) >= now);

    return c.json({
      data: {
        overdue,
        upcoming,
        totalOverdue: overdue.reduce((s, ch) => s + Number(ch.amount), 0),
        totalUpcoming: upcoming.reduce((s, ch) => s + Number(ch.amount), 0),
      },
    });
  },
);

// ── Bekleyen İzin Talepleri ──────────────────
routes.get(
  '/hr/leaves',
  requireServiceAuth('read:hr'),
  async (c) => {
    const tenantId = c.get('tenantId');

    const leaves = await prisma.leaveRequest.findMany({
      where: {
        tenantId,
        deletedAt: null,
        status: 'PENDING',
      },
      select: {
        type: true, startDate: true, endDate: true, days: true, status: true,
        employee: { select: { firstName: true, lastName: true, department: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 30,
    });

    return c.json({ data: leaves, count: leaves.length });
  },
);

// ── Açık İş Emirleri ─────────────────────────
routes.get(
  '/production/open',
  requireServiceAuth('read:production'),
  async (c) => {
    const tenantId = c.get('tenantId');

    const workOrders = await prisma.workOrder.findMany({
      where: {
        tenantId,
        deletedAt: null,
        status: { in: ['PLANNED', 'IN_PROGRESS', 'PAUSED'] },
      },
      select: {
        number: true, status: true, plannedQty: true, producedQty: true,
        startDate: true, endDate: true,
        product: { select: { name: true, code: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 30,
    });

    return c.json({ data: workOrders, count: workOrders.length });
  },
);

// ── Pazaryeri Siparişleri ────────────────────
routes.get(
  '/marketplace/orders',
  requireServiceAuth('read:marketplace'),
  async (c) => {
    const tenantId = c.get('tenantId');
    const channel = c.req.query('channel');

    const orders = await prisma.marketplaceOrder.findMany({
      where: {
        tenantId,
        ...(channel && { channel: channel as MarketplaceChannel }),
        status: { in: ['PENDING', 'PROCESSING'] },
      },
      select: {
        externalId: true, channel: true, status: true,
        customerName: true, totalAmount: true, orderDate: true,
      },
      orderBy: { orderDate: 'desc' },
      take: 30,
    });

    return c.json({ data: orders, count: orders.length });
  },
);

// ── Günlük Özet ──────────────────────────────
routes.get(
  '/reports/daily-summary',
  requireServiceAuth('read:reports'),
  async (c) => {
    const tenantId = c.get('tenantId');
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const [
      todayInvoices,
      overdueInvoices,
      pendingPayments,
      openOrders,
      lowStock,
    ] = await Promise.all([
      prisma.invoice.count({
        where: { tenantId, date: { gte: today, lt: tomorrow }, status: { not: 'CANCELLED' } },
      }),
      prisma.invoice.count({
        where: { tenantId, status: 'OVERDUE' },
      }),
      prisma.payment.count({
        where: { tenantId, deletedAt: null, status: 'PENDING' },
      }),
      prisma.salesOrder.count({
        where: { tenantId, deletedAt: null, status: { in: ['DRAFT', 'CONFIRMED'] } },
      }),
      prisma.stockLevel.count({
        where: {
          tenantId,
          quantity: { gt: 0 },
          product: { minStockLevel: { gt: 0 } },
        },
      }).then(async () => {
        const levels = await prisma.stockLevel.findMany({
          where: { tenantId, quantity: { gt: 0 } },
          include: { product: { select: { minStockLevel: true } } },
        });
        return levels.filter((sl) => Number(sl.quantity) < Number(sl.product.minStockLevel)).length;
      }),
    ]);

    return c.json({
      data: {
        todayInvoices,
        overdueInvoices,
        pendingPayments,
        openOrders,
        lowStockItems: lowStock,
      },
    });
  },
);

export const internalServiceRoutes = routes;