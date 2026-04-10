import { Hono } from 'hono';
import { requireServiceAuth } from '../middleware/requireServiceAuth';
import { prisma } from '../lib/prisma';
import { InvoiceStatus, InvoiceType } from '@prisma/client';

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

export const internalServiceRoutes = routes;
