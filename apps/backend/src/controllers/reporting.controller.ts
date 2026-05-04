import { Context } from 'hono';
import { InvoiceStatus, InvoiceType } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { ForbiddenError, ValidationError, NotFoundError } from '../errors';
import { requireTenantId } from '../utils/context.js';

// ─────────────────────────────────────────────
// DTOs
// ─────────────────────────────────────────────

interface DateRangeQuery {
  dateFrom?: string;
  dateTo?: string;
}

// ─────────────────────────────────────────────
// Reporting Controller
// Starter plan: temel raporlar (gelir/gider özeti, stok durumu, cari bakiye)
// ─────────────────────────────────────────────

export const ReportingController = {
  /**
   * GET /api/reports/revenue-summary
   * Belirli tarih aralığında satış faturası toplamları
   */
  async revenueSummary(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);

    const query = c.req.query() as DateRangeQuery;

    if (!query.dateFrom || !query.dateTo) {
      return c.json(
        new ValidationError('dateFrom ve dateTo parametreleri zorunludur.').toJSON(),
        400,
      );
    }

    const dateFrom = new Date(query.dateFrom);
    const dateTo = new Date(query.dateTo);

    const invoices = await prisma.invoice.findMany({
      where: {
        tenantId,
        type: InvoiceType.SALES,
        status: { not: InvoiceStatus.CANCELLED },
        date: { gte: dateFrom, lte: dateTo },
      },
      select: {
        id: true,
        number: true,
        date: true,
        status: true,
        totalNet: true,
        totalTax: true,
        totalGross: true,
      },
    });

    const totalNet = invoices.reduce((s, i) => s + Number(i.totalNet), 0);
    const totalTax = invoices.reduce((s, i) => s + Number(i.totalTax), 0);
    const totalGross = invoices.reduce((s, i) => s + Number(i.totalGross), 0);

    return c.json({
      data: {
        period: { from: query.dateFrom, to: query.dateTo },
        invoiceCount: invoices.length,
        totalNet,
        totalTax,
        totalGross,
      },
    });
  },

  /**
   * GET /api/reports/stock-summary
   * Depo bazlı stok durumu özeti
   */
  async stockSummary(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);

    const stockLevels = await prisma.stockLevel.findMany({
      where: { tenantId, quantity: { gt: 0 } },
      include: {
        product: {
          select: {
            id: true,
            code: true,
            name: true,
            salesPrice: true,
            averageCost: true,
            minStockLevel: true,
          },
        },
        warehouse: { select: { id: true, name: true, code: true } },
      },
      orderBy: [{ warehouse: { name: 'asc' } }, { product: { name: 'asc' } }],
    });

    // Minimum stok altındaki ürünler
    const belowMinStock = stockLevels.filter(
      (sl) => Number(sl.quantity) < Number(sl.product.minStockLevel),
    );

    const totalStockValue = stockLevels.reduce(
      (s, sl) => s + Number(sl.quantity) * Number(sl.product.averageCost),
      0,
    );

    return c.json({
      data: {
        stockLevels,
        summary: {
          totalLines: stockLevels.length,
          belowMinStockCount: belowMinStock.length,
          totalStockValue,
        },
        belowMinStock: belowMinStock.map((sl) => ({
          productId: sl.productId,
          productCode: sl.product.code,
          productName: sl.product.name,
          warehouseName: sl.warehouse.name,
          quantity: sl.quantity,
          minStockLevel: sl.product.minStockLevel,
        })),
      },
    });
  },

  /**
   * GET /api/reports/contact-balance
   * Cari hesap bakiye özeti
   */
  async contactBalance(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);

    // Her cari için son bakiye kaydını al
    const contacts = await prisma.contact.findMany({
      where: { tenantId, deletedAt: null, isActive: true },
      select: {
        id: true,
        name: true,
        code: true,
        type: true,
        accountEntries: {
          orderBy: { date: 'desc' },
          take: 1,
          select: { balance: true, date: true },
        },
      },
    });

    const result = contacts
      .map((c) => ({
        contactId: c.id,
        name: c.name,
        code: c.code,
        type: c.type,
        balance: c.accountEntries[0] ? Number(c.accountEntries[0].balance) : 0,
        lastEntryDate: c.accountEntries[0]?.date ?? null,
      }))
      .filter((c) => c.balance !== 0);

    const totalReceivable = result
      .filter((c) => c.balance > 0)
      .reduce((s, c) => s + c.balance, 0);

    const totalPayable = result
      .filter((c) => c.balance < 0)
      .reduce((s, c) => s + Math.abs(c.balance), 0);

    return c.json({
      data: {
        contacts: result,
        summary: { totalReceivable, totalPayable },
      },
    });
  },

  /**
   * GET /api/reports/expense-summary
   * Belirli tarih aralığında alış faturası toplamları
   */
  async expenseSummary(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);

    const query = c.req.query() as DateRangeQuery;

    if (!query.dateFrom || !query.dateTo) {
      return c.json(
        new ValidationError('dateFrom ve dateTo parametreleri zorunludur.').toJSON(),
        400,
      );
    }

    const invoices = await prisma.invoice.findMany({
      where: {
        tenantId,
        type: InvoiceType.PURCHASE,
        status: { not: InvoiceStatus.CANCELLED },
        date: { gte: new Date(query.dateFrom), lte: new Date(query.dateTo) },
      },
      select: {
        totalNet: true,
        totalTax: true,
        totalGross: true,
      },
    });

    const totalNet = invoices.reduce((s, i) => s + Number(i.totalNet), 0);
    const totalTax = invoices.reduce((s, i) => s + Number(i.totalTax), 0);
    const totalGross = invoices.reduce((s, i) => s + Number(i.totalGross), 0);

    return c.json({
      data: {
        period: { from: query.dateFrom, to: query.dateTo },
        invoiceCount: invoices.length,
        totalNet,
        totalTax,
        totalGross,
      },
    });
  },
};

// ─────────────────────────────────────────────
// SavedReport Controller
// ─────────────────────────────────────────────

interface CreateSavedReportDTO {
  name: string;
  module: string;
  filters?: Record<string, unknown>;
  columns?: string[];
  isShared?: boolean;
}

export const SavedReportController = {
  async list(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);

    const reports = await prisma.savedReport.findMany({
      where: { tenantId },
      orderBy: { updatedAt: 'desc' },
    });

    return c.json({ data: reports });
  },

  async getById(c: Context): Promise<Response> {
    const tenantId = c.get('tenantId');
    const id = c.req.param('id')!;
    if (!tenantId || typeof tenantId !== 'string') {
      return c.json(new ForbiddenError('Tenant kimliği bulunamadı.').toJSON(), 403);
    }

    const report = await prisma.savedReport.findFirst({ where: { id, tenantId } });
    if (!report) return c.json(new NotFoundError('Rapor', id).toJSON(), 404);

    return c.json({ data: report });
  },

  async create(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);

    const body = await c.req.json<CreateSavedReportDTO>();

    if (!body.name || !body.module) {
      return c.json(new ValidationError('name ve module alanları zorunludur.').toJSON(), 400);
    }

    const report = await prisma.savedReport.create({
      data: {
        tenantId,
        name: body.name,
        module: body.module,
        filters: (body.filters ?? {}) as object,
        columns: body.columns ?? [],
        isShared: body.isShared ?? false,
      },
    });

    return c.json({ data: report }, 201);
  },

  async update(c: Context): Promise<Response> {
    const tenantId = c.get('tenantId');
    const reportId = c.req.param('id');
    if (!tenantId || typeof tenantId !== 'string') {
      return c.json(new ForbiddenError('Tenant kimliği bulunamadı.').toJSON(), 403);
    }

    const report = await prisma.savedReport.findFirst({ where: { id: reportId, tenantId } });
    if (!report) return c.json(new NotFoundError('Rapor', reportId).toJSON(), 404);

    const body = await c.req.json<Partial<CreateSavedReportDTO>>();

    const updated = await prisma.savedReport.update({
      where: { id: reportId },
      data: {
        ...(body.name !== undefined && { name: body.name }),
        ...(body.filters !== undefined && { filters: body.filters as object }),
        ...(body.columns !== undefined && { columns: body.columns }),
        ...(body.isShared !== undefined && { isShared: body.isShared }),
      },
    });

    return c.json({ data: updated });
  },

  async remove(c: Context): Promise<Response> {
    const tenantId = c.get('tenantId');
    const reportId = c.req.param('id');
    if (!tenantId || typeof tenantId !== 'string') {
      return c.json(new ForbiddenError('Tenant kimliği bulunamadı.').toJSON(), 403);
    }

    const report = await prisma.savedReport.findFirst({ where: { id: reportId, tenantId } });
    if (!report) return c.json(new NotFoundError('Rapor', reportId).toJSON(), 404);

    await prisma.savedReport.delete({ where: { id: reportId } });
    return c.json({ data: { success: true } });
  },
};
