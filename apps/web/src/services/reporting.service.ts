import { z } from 'zod';
import { apiClient } from '@/lib/api-client';
import { safeParse } from '@/lib/safe-parse';
import { SingleResponseSchema } from '@/types/api.types';

// ─────────────────────────────────────────────
// Schemas
// ─────────────────────────────────────────────

const RevenueSummarySchema = SingleResponseSchema(z.object({
  period: z.object({ from: z.string(), to: z.string() }),
  invoiceCount: z.coerce.number(),
  totalNet: z.coerce.number(),
  totalTax: z.coerce.number(),
  totalGross: z.coerce.number(),
}));

const StockSummarySchema = SingleResponseSchema(z.object({
  summary: z.object({ totalLines: z.coerce.number(), belowMinStockCount: z.coerce.number(), totalStockValue: z.coerce.number() }),
  belowMinStock: z.array(z.object({
    productId: z.string(), productCode: z.string(), productName: z.string(),
    warehouseName: z.string(), quantity: z.coerce.number(), minStockLevel: z.coerce.number(),
  })),
  stockLevels: z.array(z.unknown()),
}));

const ContactBalanceSchema = SingleResponseSchema(z.object({
  contacts: z.array(z.object({
    contactId: z.string(), name: z.string(), code: z.string().nullable(),
    type: z.string(), balance: z.coerce.number(), lastEntryDate: z.string().nullable(),
  })),
  summary: z.object({ totalReceivable: z.coerce.number(), totalPayable: z.coerce.number() }),
}));

const SavedReportSchema = z.object({
  id: z.string(), tenantId: z.string(), name: z.string(), module: z.string(),
  filters: z.record(z.string(), z.unknown()), columns: z.array(z.string()),
  isShared: z.boolean(), createdBy: z.string().nullable(),
  createdAt: z.string(), updatedAt: z.string(),
});

const ReportingMetricDefinitionSchema = z.object({
  key: z.string(),
  label: z.string(),
  format: z.enum(['currency', 'number', 'percent']),
});

const ReportingDatasetDefinitionSchema = z.object({
  key: z.enum(['invoices', 'payments', 'stock', 'contacts']),
  label: z.string(),
  module: z.string(),
  dateField: z.string().nullable(),
  metrics: z.array(ReportingMetricDefinitionSchema),
  groupBy: z.array(z.object({ key: z.string(), label: z.string() })),
  filters: z.array(z.object({ key: z.string(), label: z.string(), type: z.enum(['dateRange', 'select']) })),
});

const ReportingRegistrySchema = z.object({
  datasets: z.array(ReportingDatasetDefinitionSchema),
  chartTypes: z.array(z.object({ key: z.enum(['number', 'bar', 'line', 'pie']), label: z.string() })),
  capabilities: z.object({
    savedKpi: z.boolean(),
    dashboardPinning: z.boolean(),
    scheduledReportEmail: z.boolean(),
    exportAudit: z.boolean(),
    permissionAwareDatasetFields: z.boolean(),
  }),
});

export const KpiReportConfigSchema = z.object({
  reportType: z.literal('KPI'),
  dataset: z.enum(['invoices', 'payments', 'stock', 'contacts']),
  metric: z.string(),
  groupBy: z.string().nullable(),
  dateRangePreset: z.enum(['THIS_MONTH', 'LAST_30_DAYS', 'THIS_YEAR', 'CUSTOM']),
  dateFrom: z.string().nullable(),
  dateTo: z.string().nullable(),
  chartType: z.enum(['number', 'bar', 'line', 'pie']),
  pinnedToDashboard: z.boolean(),
  scheduleEmail: z.object({
    enabled: z.boolean(),
    frequency: z.enum(['DAILY', 'WEEKLY', 'MONTHLY']),
    recipients: z.array(z.string()),
  }),
});

const KpiPreviewSchema = z.object({
  config: KpiReportConfigSchema,
  datasetLabel: z.string(),
  metricLabel: z.string(),
  value: z.coerce.number(),
  formattedValue: z.string(),
  period: z.object({ from: z.string().nullable(), to: z.string().nullable() }),
  chartType: z.enum(['number', 'bar', 'line', 'pie']),
  pinnedToDashboard: z.boolean(),
  scheduleEmail: KpiReportConfigSchema.shape.scheduleEmail,
});

const ReportExportAuditResultSchema = z.object({
  success: z.boolean(),
  reportId: z.string(),
  auditedAt: z.string(),
});

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

export type RevenueSummary = z.infer<typeof RevenueSummarySchema>['data'];
export type StockSummary = z.infer<typeof StockSummarySchema>['data'];
export type ContactBalance = z.infer<typeof ContactBalanceSchema>['data'];
export type SavedReport = z.infer<typeof SavedReportSchema>;
export type ReportingRegistry = z.infer<typeof ReportingRegistrySchema>;
export type ReportingDatasetDefinition = z.infer<typeof ReportingDatasetDefinitionSchema>;
export type KpiReportConfig = z.infer<typeof KpiReportConfigSchema>;
export type KpiPreview = z.infer<typeof KpiPreviewSchema>;
export type ReportExportAuditResult = z.infer<typeof ReportExportAuditResultSchema>;

// ─────────────────────────────────────────────
// Service functions
// ─────────────────────────────────────────────

export async function getRevenueSummary(dateFrom: string, dateTo: string): Promise<RevenueSummary> {
  const res = await apiClient.get('/api/reports/revenue-summary', { params: { dateFrom, dateTo } });
  return safeParse(RevenueSummarySchema, res.data, 'getRevenueSummary').data;
}

export async function getExpenseSummary(dateFrom: string, dateTo: string): Promise<RevenueSummary> {
  const res = await apiClient.get('/api/reports/expense-summary', { params: { dateFrom, dateTo } });
  return safeParse(RevenueSummarySchema, res.data, 'getExpenseSummary').data;
}

export async function getStockSummary(): Promise<StockSummary> {
  const res = await apiClient.get('/api/reports/stock-summary');
  return safeParse(StockSummarySchema, res.data, 'getStockSummary').data;
}

export async function getContactBalance(): Promise<ContactBalance> {
  const res = await apiClient.get('/api/reports/contact-balance');
  return safeParse(ContactBalanceSchema, res.data, 'getContactBalance').data;
}

export async function getReportingRegistry(): Promise<ReportingRegistry> {
  const res = await apiClient.get('/api/reports/registry');
  return safeParse(SingleResponseSchema(ReportingRegistrySchema), res.data, 'getReportingRegistry').data;
}

export async function previewKpi(config: KpiReportConfig): Promise<KpiPreview> {
  const res = await apiClient.post('/api/reports/kpi/preview', config);
  return safeParse(SingleResponseSchema(KpiPreviewSchema), res.data, 'previewKpi').data;
}

export async function getSavedReports(params?: { dashboard?: boolean }): Promise<SavedReport[]> {
  const res = await apiClient.get('/api/reports/saved', { params: params?.dashboard ? { dashboard: '1' } : undefined });
  return safeParse(SingleResponseSchema(z.array(SavedReportSchema)), res.data, 'getSavedReports').data;
}

export async function getPinnedKpiReports(): Promise<SavedReport[]> {
  return getSavedReports({ dashboard: true });
}

export async function getPinnedKpiPreviews(): Promise<KpiPreview[]> {
  const reports = await getPinnedKpiReports();
  const configs = reports
    .map((report) => KpiReportConfigSchema.safeParse(report.filters))
    .filter((result): result is z.ZodSafeParseSuccess<KpiReportConfig> => result.success)
    .map((result) => result.data);
  return Promise.all(configs.map((config) => previewKpi(config)));
}

export async function createSavedReport(data: { name: string; module: string; filters?: Record<string, unknown>; columns?: string[]; isShared?: boolean }): Promise<SavedReport> {
  const res = await apiClient.post('/api/reports/saved', data);
  return safeParse(SingleResponseSchema(SavedReportSchema), res.data, 'createSavedReport').data;
}

export async function deleteSavedReport(id: string): Promise<void> {
  await apiClient.delete(`/api/reports/saved/${id}`);
}

export async function updateSavedReport(id: string, data: { name?: string; filters?: Record<string, unknown>; columns?: string[]; isShared?: boolean }): Promise<SavedReport> {
  const res = await apiClient.patch(`/api/reports/saved/${id}`, data);
  return safeParse(SingleResponseSchema(SavedReportSchema), res.data, 'updateSavedReport').data;
}

export async function recordSavedReportExportAudit(id: string): Promise<ReportExportAuditResult> {
  const res = await apiClient.post(`/api/reports/saved/${id}/export-audit`);
  return safeParse(SingleResponseSchema(ReportExportAuditResultSchema), res.data, 'recordSavedReportExportAudit').data;
}

const CollectionListSchema = SingleResponseSchema(z.object({
  payments: z.array(z.object({
    id: z.string(),
    amount: z.coerce.number(),
    date: z.string(),
    description: z.string().nullable(),
    contact: z.object({ id: z.string(), name: z.string(), code: z.string().nullable() }),
    bankAccount: z.object({ id: z.string(), name: z.string() }).nullable(),
    cashAccount: z.object({ id: z.string(), name: z.string() }).nullable(),
  })),
  summary: z.object({ totalCollected: z.coerce.number(), count: z.coerce.number() }),
}));

export type CollectionList = z.infer<typeof CollectionListSchema>['data'];

export async function getCollectionList(dateFrom?: string, dateTo?: string): Promise<CollectionList> {
  const res = await apiClient.get('/api/reports/collection-list', { params: { dateFrom, dateTo } });
  return safeParse(CollectionListSchema, res.data, 'getCollectionList').data;
}

export const CashflowForecastSchema = z.object({
  startingBalance: z.coerce.number(),
  periods: z.array(z.object({
    label: z.string(),
    range: z.string(),
    inflow: z.object({
      invoices: z.coerce.number(),
      checks: z.coerce.number(),
      total: z.coerce.number(),
    }),
    outflow: z.object({
      invoices: z.coerce.number(),
      total: z.coerce.number(),
    }),
    netFlow: z.coerce.number(),
    endingBalance: z.coerce.number(),
  })),
});
export type CashflowForecast = z.infer<typeof CashflowForecastSchema>;

export async function getCashflowForecast(): Promise<CashflowForecast> {
  const res = await apiClient.get('/api/reports/cashflow-forecast');
  return safeParse(SingleResponseSchema(CashflowForecastSchema), res.data, 'getCashflowForecast').data;
}
