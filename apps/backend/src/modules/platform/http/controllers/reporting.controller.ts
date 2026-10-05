import { AuditAction,EntityType,InvoiceStatus,InvoiceType,Prisma } from '@prisma/client';
import { Context } from 'hono';
import { NotFoundError,ValidationError } from '../../../../errors/index.js';
import { prisma } from '../../../../lib/prisma.js';
import { getCashflowForecast } from '../../../../services/cashflow-forecast.service.js';
import { ReportScheduleService } from '../../../../services/report-schedule.service.js';
import { ReportingBuilderService,isKpiConfig,normalizeKpiConfig } from '../../../../services/reporting-builder.service.js';
import { createAuditLog,getRequestMeta } from '../../../../utils/audit.js';
import { requireParam,requireTenantId,requireUserId } from '../../../../utils/context.js';

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

function parseReportDateRange(dateFromValue: string | undefined, dateToValue: string | undefined):
  | { dateFrom: Date; dateTo: Date }
  | { error: string } {
  if (!dateFromValue || !dateToValue) return { error: 'dateFrom ve dateTo parametreleri zorunludur.' };
  const datePattern = /^\d{4}-\d{2}-\d{2}$/;
  if (!datePattern.test(dateFromValue) || !datePattern.test(dateToValue)) return { error: 'Tarih formati YYYY-MM-DD olmalidir.' };
  const dateFrom = new Date(`${dateFromValue}T00:00:00.000Z`);
  const dateTo = new Date(`${dateToValue}T23:59:59.999Z`);
  if (Number.isNaN(dateFrom.getTime()) || Number.isNaN(dateTo.getTime()) || dateFrom.toISOString().slice(0, 10) !== dateFromValue || dateTo.toISOString().slice(0, 10) !== dateToValue) {
    return { error: 'Gecerli bir tarih araligi girilmelidir.' };
  }
  if (dateFrom > dateTo) return { error: 'dateFrom, dateTo tarihinden sonra olamaz.' };
  return { dateFrom, dateTo };
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

    const range = parseReportDateRange(query.dateFrom, query.dateTo);
    if ('error' in range) return c.json(new ValidationError(range.error).toJSON(), 400);

    const invoices = await prisma.invoice.findMany({
      where: {
        tenantId,
        type: InvoiceType.SALES,
        status: { not: InvoiceStatus.CANCELLED },
        deletedAt: null,
        date: { gte: range.dateFrom, lte: range.dateTo },
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
      where: { tenantId, quantity: { gt: 0 }, product: { deletedAt: null, isActive: true } },
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

    const range = parseReportDateRange(query.dateFrom, query.dateTo);
    if ('error' in range) return c.json(new ValidationError(range.error).toJSON(), 400);

    const invoices = await prisma.invoice.findMany({
      where: {
        tenantId,
        type: InvoiceType.PURCHASE,
        status: { not: InvoiceStatus.CANCELLED },
        deletedAt: null,
        date: { gte: range.dateFrom, lte: range.dateTo },
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

    let range: { dateFrom: Date; dateTo: Date } | null = null;
    if (dateFrom || dateTo) {
      const parsed = parseReportDateRange(dateFrom, dateTo);
      if ('error' in parsed) return c.json(new ValidationError(parsed.error).toJSON(), 400);
      range = parsed;
    }

    const payments = await prisma.payment.findMany({
      where: {
        tenantId,
        direction: 'RECEIVE',
        deletedAt: null,
        ...(range ? { date: { gte: range.dateFrom, lte: range.dateTo } } : {}),
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

    const range = parseReportDateRange(query.dateFrom, query.dateTo);
    if ('error' in range) return c.json(new ValidationError(range.error).toJSON(), 400);

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
          date: { gte: range.dateFrom, lte: range.dateTo },
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
  sharedRoleIds?: string[];
  sharedUserIds?: string[];
  columnTemplateName?: string | null;
  pinnedToDashboard?: boolean;
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

function sanitizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0).map((item) => item.trim())));
}

function readOptionalString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function isDashboardPinnedReport(report: { filters: Prisma.JsonValue; pinnedToDashboard?: boolean }): boolean {
  return report.pinnedToDashboard === true || (isKpiConfig(report.filters) && report.filters.pinnedToDashboard === true);
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

async function getTenantUserRoleId(tenantId: string, userId: string): Promise<string | null> {
  const tenantUser = await prisma.tenantUser.findUnique({
    where: { tenantId_userId: { tenantId, userId } },
    select: { roleId: true },
  });
  return tenantUser?.roleId ?? null;
}

async function canAccessSavedReport(
  tenantId: string,
  userId: string,
  report: { filters: Prisma.JsonValue; createdBy: string | null; isShared: boolean; sharedUserIds: string[]; sharedRoleIds: string[] },
): Promise<boolean> {
  const roleId = await getTenantUserRoleId(tenantId, userId);
  const hasShareAccess =
    report.createdBy === null ||
    report.createdBy === userId ||
    report.isShared ||
    report.sharedUserIds.includes(userId) ||
    (roleId !== null && report.sharedRoleIds.includes(roleId));
  if (!hasShareAccess) return false;

  const registry = await new ReportingBuilderService(prisma).registry(tenantId, userId);
  const allowedDatasetKeys = new Set(registry.datasets.map((dataset) => dataset.key));
  return isReportAllowedByDataset(report, allowedDatasetKeys);
}

function canMutateSavedReport(userId: string, report: { createdBy: string | null }): boolean {
  return report.createdBy === null || report.createdBy === userId;
}

function validateSavedReportName(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return null;
  const name = value.trim();
  return name.length <= 120 && !/[\r\n\0]/.test(name) ? name : null;
}

function validateSavedReportShape(body: Record<string, unknown>): string | null {
  if (body.filters !== undefined && !isRecord(body.filters)) return 'filters nesne olmalıdır.';
  for (const key of ['columns', 'sharedRoleIds', 'sharedUserIds'] as const) {
    const value = body[key];
    if (value !== undefined && (!Array.isArray(value) || value.some((item) => typeof item !== 'string'))) return `${key} metin dizisi olmalıdır.`;
  }
  for (const key of ['isShared', 'pinnedToDashboard'] as const) {
    if (body[key] !== undefined && typeof body[key] !== 'boolean') return `${key} boolean olmalıdır.`;
  }
  return null;
}

async function validateShareTargets(tenantId: string, roleIds: string[], userIds: string[]): Promise<boolean> {
  const [roleCount, userCount] = await Promise.all([
    prisma.role.count({ where: { tenantId, id: { in: roleIds } } }),
    prisma.tenantUser.count({ where: { tenantId, userId: { in: userIds }, isActive: true } }),
  ]);
  return roleCount === roleIds.length && userCount === userIds.length;
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
    const roleId = await getTenantUserRoleId(tenantId, userId);
    const visibleReports = reports.filter((report) =>
      report.createdBy === userId ||
      report.createdBy === null ||
      report.isShared ||
      report.sharedUserIds.includes(userId) ||
      (roleId !== null && report.sharedRoleIds.includes(roleId)),
    );
    const registry = await new ReportingBuilderService(prisma).registry(tenantId, userId);
    const allowedDatasetKeys = new Set(registry.datasets.map((dataset) => dataset.key));
    const accessibleReports = visibleReports.filter((report) => isReportAllowedByDataset(report, allowedDatasetKeys));

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

    const rawBody: unknown = await c.req.json();
    if (!isRecord(rawBody)) return c.json(new ValidationError('Geçersiz istek gövdesi.').toJSON(), 400);
    const shapeError = validateSavedReportShape(rawBody);
    if (shapeError) return c.json(new ValidationError(shapeError).toJSON(), 400);
    const body = rawBody as unknown as CreateSavedReportDTO;

    const name = validateSavedReportName(body.name);
    const moduleName = typeof body.module === 'string' ? body.module.trim() : '';
    if (!name || !moduleName || moduleName.length > 80) {
      return c.json(new ValidationError('name ve module alanları zorunludur.').toJSON(), 400);
    }
    const filters = toSavedReportFilters(body.filters ?? {});
    const kpiConfig = isKpiConfig(filters) ? normalizeKpiConfig(filters) : null;
    if (kpiConfig) {
      await new ReportingBuilderService(prisma).assertCanUseConfig(tenantId, userId, kpiConfig);
    }
    const sharedRoleIds = sanitizeStringArray(body.sharedRoleIds);
    const sharedUserIds = sanitizeStringArray(body.sharedUserIds);
    if (!(await validateShareTargets(tenantId, sharedRoleIds, sharedUserIds))) {
      return c.json(new ValidationError('Paylaşım hedefleri bu tenant içinde bulunamadı.').toJSON(), 400);
    }

    const report = await prisma.savedReport.create({
      data: {
        tenantId,
        name,
        module: moduleName,
        filters,
        columns: body.columns ?? [],
        isShared: body.isShared ?? false,
        sharedRoleIds,
        sharedUserIds,
        columnTemplateName: readOptionalString(body.columnTemplateName),
        pinnedToDashboard: body.pinnedToDashboard ?? kpiConfig?.pinnedToDashboard ?? false,
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
    const userId = requireUserId(c);
    if (!(await canAccessSavedReport(tenantId, userId, report)) || !canMutateSavedReport(userId, report)) return c.json(new NotFoundError('Rapor', reportId).toJSON(), 404);

    const rawBody: unknown = await c.req.json();
    if (!isRecord(rawBody)) return c.json(new ValidationError('Geçersiz istek gövdesi.').toJSON(), 400);
    const shapeError = validateSavedReportShape(rawBody);
    if (shapeError) return c.json(new ValidationError(shapeError).toJSON(), 400);
    const body = rawBody as Partial<CreateSavedReportDTO>;
    const name = body.name !== undefined ? validateSavedReportName(body.name) : undefined;
    if (body.name !== undefined && !name) return c.json(new ValidationError('Geçerli bir rapor adı girilmelidir.').toJSON(), 400);
    const filters = body.filters !== undefined ? toSavedReportFilters(body.filters) : undefined;
    const kpiConfig = filters && isKpiConfig(filters) ? normalizeKpiConfig(filters) : null;
    if (kpiConfig) {
      await new ReportingBuilderService(prisma).assertCanUseConfig(tenantId, requireUserId(c), kpiConfig);
    }
    const sharedRoleIds = body.sharedRoleIds !== undefined ? sanitizeStringArray(body.sharedRoleIds) : undefined;
    const sharedUserIds = body.sharedUserIds !== undefined ? sanitizeStringArray(body.sharedUserIds) : undefined;
    if (!(await validateShareTargets(tenantId, sharedRoleIds ?? report.sharedRoleIds, sharedUserIds ?? report.sharedUserIds))) {
      return c.json(new ValidationError('Paylaşım hedefleri bu tenant içinde bulunamadı.').toJSON(), 400);
    }

    const updated = await prisma.savedReport.update({
      where: { id: reportId },
      data: {
        ...(typeof name === 'string' && { name }),
        ...(filters !== undefined && { filters }),
        ...(body.columns !== undefined && { columns: body.columns }),
        ...(body.isShared !== undefined && { isShared: body.isShared }),
        ...(sharedRoleIds !== undefined && { sharedRoleIds }),
        ...(sharedUserIds !== undefined && { sharedUserIds }),
        ...(body.columnTemplateName !== undefined && { columnTemplateName: readOptionalString(body.columnTemplateName) }),
        ...(body.pinnedToDashboard !== undefined && { pinnedToDashboard: body.pinnedToDashboard }),
      },
    });

    return c.json({ data: updated });
  },

  async remove(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const reportId = c.req.param('id');

    const report = await prisma.savedReport.findFirst({ where: { id: reportId, tenantId } });
    if (!report) return c.json(new NotFoundError('Rapor', reportId).toJSON(), 404);
    const userId = requireUserId(c);
    if (!(await canAccessSavedReport(tenantId, userId, report)) || !canMutateSavedReport(userId, report)) return c.json(new NotFoundError('Rapor', reportId).toJSON(), 404);

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
