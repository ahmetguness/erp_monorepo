import { Context } from 'hono';
import { AuditAction, EntityType, InvoiceStatus, InvoiceType, Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { ValidationError, NotFoundError } from '../errors';
import { requireTenantId, requireUserId, requireParam } from '../utils/context.js';
import { ReportingBuilderService, isKpiConfig, normalizeKpiConfig } from '../services/reporting-builder.service';
import { getCashflowForecast } from '../services/cashflow-forecast.service';
import { ReportScheduleService } from '../services/report-schedule.service';
import { createAuditLog, getRequestMeta } from '../utils/audit.js';

interface TopSellingProductRow {
  productId: string;
  productCode: string;
  productName: string;
  quantity: number;
  revenue: number;
  invoiceCount: number;
}

function parseReportLimit(value: string | undefined, fallback: number, max: number): number {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return Math.min(parsed, max);
}

// ─────────────────────────────────────────────
// DTOs
// ─────────────────────────────────────────────

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

    const query = { dateFrom: c.req.query('dateFrom'), dateTo: c.req.query('dateTo') };

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

    const query = { dateFrom: c.req.query('dateFrom'), dateTo: c.req.query('dateTo') };

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

  async collectionList(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const dateFrom = c.req.query('dateFrom');
    const dateTo = c.req.query('dateTo');

    const payments = await prisma.payment.findMany({
      where: {
        tenantId,
        direction: 'RECEIVE',
        deletedAt: null,
        ...(dateFrom || dateTo
          ? {
              date: {
                ...(dateFrom && { gte: new Date(dateFrom) }),
                ...(dateTo && { lte: new Date(dateTo) }),
              },
            }
          : {}),
      },
      include: {
        contact: { select: { id: true, name: true, code: true } },
        bankAccount: { select: { id: true, name: true } },
        cashAccount: { select: { id: true, name: true } },
      },
      orderBy: { date: 'desc' },
    });

    const totalCollected = payments.reduce((sum, p) => sum + Number(p.amount), 0);

    return c.json({
      data: {
        payments,
        summary: {
          totalCollected,
          count: payments.length,
        },
      },
    });
  },

  async topProducts(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const query = {
      dateFrom: c.req.query('dateFrom'),
      dateTo: c.req.query('dateTo'),
      limit: c.req.query('limit'),
    };

    if (!query.dateFrom || !query.dateTo) {
      return c.json(
        new ValidationError('dateFrom ve dateTo parametreleri zorunludur.').toJSON(),
        400,
      );
    }

    const limit = parseReportLimit(query.limit, 10, 50);
    const lines = await prisma.invoiceLine.findMany({
      where: {
        tenantId,
        productId: { not: null },
        invoice: {
          tenantId,
          type: InvoiceType.SALES,
          status: { not: InvoiceStatus.CANCELLED },
          deletedAt: null,
          date: { gte: new Date(query.dateFrom), lte: new Date(query.dateTo) },
        },
      },
      select: {
        productId: true,
        quantity: true,
        lineTotal: true,
        invoiceId: true,
        product: { select: { id: true, code: true, name: true } },
      },
    });

    const productMap = new Map<string, TopSellingProductRow & { invoiceIds: Set<string> }>();

    for (const line of lines) {
      const product = line.product;
      if (!product || !line.productId) continue;

      const current = productMap.get(product.id) ?? {
        productId: product.id,
        productCode: product.code,
        productName: product.name,
        quantity: 0,
        revenue: 0,
        invoiceCount: 0,
        invoiceIds: new Set<string>(),
      };

      current.quantity += Number(line.quantity);
      current.revenue += Number(line.lineTotal);
      current.invoiceIds.add(line.invoiceId);
      current.invoiceCount = current.invoiceIds.size;
      productMap.set(product.id, current);
    }

    const products = Array.from(productMap.values())
      .map((product) => ({
        productId: product.productId,
        productCode: product.productCode,
        productName: product.productName,
        quantity: product.quantity,
        revenue: product.revenue,
        invoiceCount: product.invoiceCount,
      }))
      .sort((left, right) => {
        if (right.quantity !== left.quantity) return right.quantity - left.quantity;
        return right.revenue - left.revenue;
      })
      .slice(0, limit);

    const totalQuantity = products.reduce((sum, product) => sum + product.quantity, 0);
    const totalRevenue = products.reduce((sum, product) => sum + product.revenue, 0);

    return c.json({
      data: {
        period: { from: query.dateFrom, to: query.dateTo },
        products,
        summary: {
          count: products.length,
          totalQuantity,
          totalRevenue,
        },
      },
    });
  },

  async cashflowForecast(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);

    const forecast = await getCashflowForecast(prisma, tenantId);

    return c.json({
      data: forecast,
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function toJsonValue(value: unknown): Prisma.InputJsonValue | null {
  if (value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value;
  if (Array.isArray(value)) return value.map((item) => toJsonValue(item));
  if (!isRecord(value)) return null;
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, toJsonValue(item)]));
}

function toSavedReportFilters(input: unknown): Prisma.InputJsonObject {
  if (!isRecord(input)) return {};
  if (input.reportType !== 'KPI') {
    return Object.fromEntries(Object.entries(input).map(([key, value]) => [key, toJsonValue(value)]));
  }
  const config = normalizeKpiConfig(input);
  return {
    reportType: config.reportType,
    dataset: config.dataset,
    metric: config.metric,
    groupBy: config.groupBy,
    dateRangePreset: config.dateRangePreset,
    dateFrom: config.dateFrom,
    dateTo: config.dateTo,
    chartType: config.chartType,
    pinnedToDashboard: config.pinnedToDashboard,
    scheduleEmail: {
      enabled: config.scheduleEmail.enabled,
      frequency: config.scheduleEmail.frequency,
      recipients: config.scheduleEmail.recipients,
    },
  };
}

function isDashboardPinnedReport(report: { filters: Prisma.JsonValue }): boolean {
  return isKpiConfig(report.filters) && report.filters.pinnedToDashboard === true;
}

function isReportAllowedByDataset(report: { filters: Prisma.JsonValue }, allowedDatasetKeys: ReadonlySet<string>): boolean {
  if (!isKpiConfig(report.filters)) return true;
  try {
    const config = normalizeKpiConfig(report.filters);
    return allowedDatasetKeys.has(config.dataset);
  } catch {
    return false;
  }
}

async function canAccessSavedReport(tenantId: string, userId: string, report: { filters: Prisma.JsonValue }): Promise<boolean> {
  const registry = await new ReportingBuilderService(prisma).registry(tenantId, userId);
  const allowedDatasetKeys = new Set(registry.datasets.map((dataset) => dataset.key));
  return isReportAllowedByDataset(report, allowedDatasetKeys);
}

export const ReportingBuilderController = {
  async registry(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const userId = requireUserId(c);
    const service = new ReportingBuilderService(prisma);
    const registry = await service.registry(tenantId, userId);
    return c.json({ data: registry });
  },

  async preview(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const userId = requireUserId(c);
    const body = await c.req.json<unknown>();
    const service = new ReportingBuilderService(prisma);
    const preview = await service.preview(tenantId, userId, body);
    return c.json({ data: preview });
  },
};

export const SavedReportController = {
  async list(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const userId = requireUserId(c);
    const dashboardOnly = c.req.query('dashboard') === '1';

    const reports = await prisma.savedReport.findMany({
      where: { tenantId },
      orderBy: { updatedAt: 'desc' },
    });
    const registry = await new ReportingBuilderService(prisma).registry(tenantId, userId);
    const allowedDatasetKeys = new Set(registry.datasets.map((dataset) => dataset.key));
    const accessibleReports = reports.filter((report) => isReportAllowedByDataset(report, allowedDatasetKeys));

    return c.json({ data: dashboardOnly ? accessibleReports.filter(isDashboardPinnedReport) : accessibleReports });
  },

  async getById(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const userId = requireUserId(c);
    const id = requireParam(c, 'id');

    const report = await prisma.savedReport.findFirst({ where: { id, tenantId } });
    if (!report) return c.json(new NotFoundError('Rapor', id).toJSON(), 404);
    if (!(await canAccessSavedReport(tenantId, userId, report))) return c.json(new NotFoundError('Rapor', id).toJSON(), 404);

    return c.json({ data: report });
  },

  async create(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const userId = requireUserId(c);

    const body = await c.req.json<CreateSavedReportDTO>();

    if (!body.name || !body.module) {
      return c.json(new ValidationError('name ve module alanları zorunludur.').toJSON(), 400);
    }
    const filters = toSavedReportFilters(body.filters ?? {});
    const kpiConfig = isKpiConfig(filters) ? normalizeKpiConfig(filters) : null;
    if (kpiConfig) {
      await new ReportingBuilderService(prisma).assertCanUseConfig(tenantId, userId, kpiConfig);
    }

    const report = await prisma.savedReport.create({
      data: {
        tenantId,
        name: body.name,
        module: body.module,
        filters,
        columns: body.columns ?? [],
        isShared: body.isShared ?? false,
        createdBy: userId,
      },
    });

    return c.json({ data: report }, 201);
  },

  async update(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const reportId = c.req.param('id');

    const report = await prisma.savedReport.findFirst({ where: { id: reportId, tenantId } });
    if (!report) return c.json(new NotFoundError('Rapor', reportId).toJSON(), 404);
    if (!(await canAccessSavedReport(tenantId, requireUserId(c), report))) return c.json(new NotFoundError('Rapor', reportId).toJSON(), 404);

    const body = await c.req.json<Partial<CreateSavedReportDTO>>();
    const filters = body.filters !== undefined ? toSavedReportFilters(body.filters) : undefined;
    const kpiConfig = filters && isKpiConfig(filters) ? normalizeKpiConfig(filters) : null;
    if (kpiConfig) {
      await new ReportingBuilderService(prisma).assertCanUseConfig(tenantId, requireUserId(c), kpiConfig);
    }

    const updated = await prisma.savedReport.update({
      where: { id: reportId },
      data: {
        ...(body.name !== undefined && { name: body.name }),
        ...(filters !== undefined && { filters }),
        ...(body.columns !== undefined && { columns: body.columns }),
        ...(body.isShared !== undefined && { isShared: body.isShared }),
      },
    });

    return c.json({ data: updated });
  },

  async remove(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const reportId = c.req.param('id');

    const report = await prisma.savedReport.findFirst({ where: { id: reportId, tenantId } });
    if (!report) return c.json(new NotFoundError('Rapor', reportId).toJSON(), 404);
    if (!(await canAccessSavedReport(tenantId, requireUserId(c), report))) return c.json(new NotFoundError('Rapor', reportId).toJSON(), 404);

    await prisma.savedReport.delete({ where: { id: reportId } });
    return c.json({ data: { success: true } });
  },

  async exportAudit(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const userId = requireUserId(c);
    const reportId = c.req.param('id');

    const report = await prisma.savedReport.findFirst({ where: { id: reportId, tenantId } });
    if (!report) return c.json(new NotFoundError('Rapor', reportId).toJSON(), 404);
    if (!(await canAccessSavedReport(tenantId, userId, report))) return c.json(new NotFoundError('Rapor', reportId).toJSON(), 404);

    const { ipAddress, userAgent } = getRequestMeta(c);
    await createAuditLog(prisma, {
      tenantId,
      userId,
      module: 'reporting',
      entityType: EntityType.OTHER,
      entityId: report.id,
      action: AuditAction.EXPORT,
      newValues: {
        reportId: report.id,
        reportName: report.name,
        reportModule: report.module,
        exportType: 'saved-report',
      },
      ipAddress,
      userAgent,
    });

    return c.json({ data: { success: true, reportId: report.id, auditedAt: new Date().toISOString() } });
  },

  async runSchedule(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const userId = requireUserId(c);
    const reportId = requireParam(c, 'id');

    const report = await prisma.savedReport.findFirst({ where: { id: reportId, tenantId } });
    if (!report) return c.json(new NotFoundError('Rapor', reportId).toJSON(), 404);
    if (!(await canAccessSavedReport(tenantId, userId, report))) return c.json(new NotFoundError('Rapor', reportId).toJSON(), 404);

    const result = await new ReportScheduleService(prisma).dispatchSavedReport(tenantId, userId, report);

    return c.json({ data: result });
  },
};
