import { InvoiceStatus, InvoiceType, Prisma, type PrismaClient } from '@prisma/client';
import { ValidationError } from '../errors';

export type ReportingDatasetKey = 'invoices' | 'payments' | 'stock' | 'contacts';
export type ReportingChartType = 'number' | 'bar' | 'line' | 'pie';
export type ReportingDateRangePreset = 'THIS_MONTH' | 'LAST_30_DAYS' | 'THIS_YEAR' | 'CUSTOM';
export type ReportingScheduleFrequency = 'DAILY' | 'WEEKLY' | 'MONTHLY';

export interface ReportingMetricDefinition {
  key: string;
  label: string;
  format: 'currency' | 'number' | 'percent';
}

export interface ReportingDatasetDefinition {
  key: ReportingDatasetKey;
  label: string;
  module: string;
  dateField: string | null;
  metrics: ReportingMetricDefinition[];
  groupBy: { key: string; label: string }[];
  filters: { key: string; label: string; type: 'dateRange' | 'select' }[];
}

export interface KpiScheduleEmailConfig {
  enabled: boolean;
  frequency: ReportingScheduleFrequency;
  recipients: string[];
}

export interface KpiReportConfig {
  reportType: 'KPI';
  dataset: ReportingDatasetKey;
  metric: string;
  groupBy: string | null;
  dateRangePreset: ReportingDateRangePreset;
  dateFrom: string | null;
  dateTo: string | null;
  chartType: ReportingChartType;
  pinnedToDashboard: boolean;
  scheduleEmail: KpiScheduleEmailConfig;
}

export interface KpiPreviewResult {
  config: KpiReportConfig;
  datasetLabel: string;
  metricLabel: string;
  value: number;
  formattedValue: string;
  period: { from: string | null; to: string | null };
  chartType: ReportingChartType;
  pinnedToDashboard: boolean;
  scheduleEmail: KpiScheduleEmailConfig;
}

const DATASETS: readonly ReportingDatasetDefinition[] = [
  {
    key: 'invoices',
    label: 'Faturalar',
    module: 'invoicing',
    dateField: 'date',
    metrics: [
      { key: 'salesRevenue', label: 'Satış geliri', format: 'currency' },
      { key: 'purchaseExpense', label: 'Alış gideri', format: 'currency' },
      { key: 'invoiceCount', label: 'Fatura adedi', format: 'number' },
      { key: 'overdueInvoiceCount', label: 'Geciken fatura', format: 'number' },
    ],
    groupBy: [
      { key: 'status', label: 'Durum' },
      { key: 'type', label: 'Tip' },
      { key: 'month', label: 'Ay' },
    ],
    filters: [{ key: 'dateRange', label: 'Tarih aralığı', type: 'dateRange' }],
  },
  {
    key: 'payments',
    label: 'Ödemeler',
    module: 'accounting',
    dateField: 'date',
    metrics: [
      { key: 'receivedAmount', label: 'Tahsilat', format: 'currency' },
      { key: 'paidAmount', label: 'Ödeme', format: 'currency' },
      { key: 'paymentCount', label: 'Ödeme hareketi', format: 'number' },
    ],
    groupBy: [
      { key: 'type', label: 'Tip' },
      { key: 'month', label: 'Ay' },
    ],
    filters: [{ key: 'dateRange', label: 'Tarih aralığı', type: 'dateRange' }],
  },
  {
    key: 'stock',
    label: 'Stok',
    module: 'inventory',
    dateField: null,
    metrics: [
      { key: 'stockValue', label: 'Stok değeri', format: 'currency' },
      { key: 'lowStockCount', label: 'Kritik stok adedi', format: 'number' },
      { key: 'stockLineCount', label: 'Stok satırı', format: 'number' },
    ],
    groupBy: [
      { key: 'warehouse', label: 'Depo' },
      { key: 'product', label: 'Ürün' },
    ],
    filters: [],
  },
  {
    key: 'contacts',
    label: 'Cari hesaplar',
    module: 'contacts',
    dateField: null,
    metrics: [
      { key: 'receivableAmount', label: 'Toplam alacak', format: 'currency' },
      { key: 'payableAmount', label: 'Toplam borç', format: 'currency' },
      { key: 'activeContactCount', label: 'Aktif cari', format: 'number' },
    ],
    groupBy: [
      { key: 'type', label: 'Cari tipi' },
      { key: 'city', label: 'Şehir' },
    ],
    filters: [],
  },
] ;

const CHART_TYPES: readonly { key: ReportingChartType; label: string }[] = [
  { key: 'number', label: 'Sayı kartı' },
  { key: 'bar', label: 'Bar grafik' },
  { key: 'line', label: 'Çizgi grafik' },
  { key: 'pie', label: 'Pasta grafik' },
];

function datasetByKey(key: ReportingDatasetKey): ReportingDatasetDefinition {
  const dataset = DATASETS.find((item) => item.key === key);
  if (!dataset) throw new ValidationError('Geçerli bir dataset seçin.');
  return dataset;
}

function metricByKey(dataset: ReportingDatasetDefinition, metricKey: string): ReportingMetricDefinition {
  const metric = dataset.metrics.find((item) => item.key === metricKey);
  if (!metric) throw new ValidationError('Seçilen dataset için geçerli bir metrik seçin.');
  return metric;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readString(value: Record<string, unknown>, key: string): string | null {
  const item = value[key];
  return typeof item === 'string' && item.trim() ? item.trim() : null;
}

function readBoolean(value: Record<string, unknown>, key: string): boolean {
  return value[key] === true;
}

function readStringArray(value: Record<string, unknown>, key: string): string[] {
  const item = value[key];
  if (!Array.isArray(item)) return [];
  return Array.from(new Set(item.filter((entry): entry is string => typeof entry === 'string').map((entry) => entry.trim()).filter(Boolean)));
}

function isDatasetKey(value: string | null): value is ReportingDatasetKey {
  return value === 'invoices' || value === 'payments' || value === 'stock' || value === 'contacts';
}

function isChartType(value: string | null): value is ReportingChartType {
  return value === 'number' || value === 'bar' || value === 'line' || value === 'pie';
}

function isDateRangePreset(value: string | null): value is ReportingDateRangePreset {
  return value === 'THIS_MONTH' || value === 'LAST_30_DAYS' || value === 'THIS_YEAR' || value === 'CUSTOM';
}

function isScheduleFrequency(value: string | null): value is ReportingScheduleFrequency {
  return value === 'DAILY' || value === 'WEEKLY' || value === 'MONTHLY';
}

function parseDate(value: string | null): Date | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new ValidationError('Geçerli bir tarih aralığı seçin.');
  return date;
}

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function resolveDateRange(config: KpiReportConfig): { dateFrom: Date | null; dateTo: Date | null; from: string | null; to: string | null } {
  const now = new Date();
  if (config.dateRangePreset === 'THIS_MONTH') {
    const from = new Date(now.getFullYear(), now.getMonth(), 1);
    const to = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    return { dateFrom: from, dateTo: to, from: isoDate(from), to: isoDate(to) };
  }
  if (config.dateRangePreset === 'LAST_30_DAYS') {
    const from = new Date(now);
    from.setDate(from.getDate() - 30);
    return { dateFrom: from, dateTo: now, from: isoDate(from), to: isoDate(now) };
  }
  if (config.dateRangePreset === 'THIS_YEAR') {
    const from = new Date(now.getFullYear(), 0, 1);
    const to = new Date(now.getFullYear(), 11, 31);
    return { dateFrom: from, dateTo: to, from: isoDate(from), to: isoDate(to) };
  }
  const dateFrom = parseDate(config.dateFrom);
  const dateTo = parseDate(config.dateTo);
  if (!dateFrom || !dateTo) throw new ValidationError('Özel tarih aralığı için başlangıç ve bitiş zorunludur.');
  return { dateFrom, dateTo, from: config.dateFrom, to: config.dateTo };
}

function formatKpiValue(value: number, format: ReportingMetricDefinition['format']): string {
  if (format === 'currency') {
    return new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY', maximumFractionDigits: 0 }).format(value);
  }
  if (format === 'percent') return `${value.toFixed(1)}%`;
  return new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 0 }).format(value);
}

function normalizeSchedule(value: Record<string, unknown>): KpiScheduleEmailConfig {
  const rawSchedule = value.scheduleEmail;
  const schedule = isRecord(rawSchedule) ? rawSchedule : {};
  const frequency = readString(schedule, 'frequency');
  return {
    enabled: readBoolean(schedule, 'enabled'),
    frequency: isScheduleFrequency(frequency) ? frequency : 'WEEKLY',
    recipients: readStringArray(schedule, 'recipients').slice(0, 10),
  };
}

export function normalizeKpiConfig(value: unknown): KpiReportConfig {
  if (!isRecord(value)) throw new ValidationError('KPI yapılandırması zorunludur.');

  const datasetKey = readString(value, 'dataset');
  if (!isDatasetKey(datasetKey)) throw new ValidationError('Geçerli bir dataset seçin.');
  const dataset = datasetByKey(datasetKey);
  const metric = readString(value, 'metric');
  if (!metric) throw new ValidationError('Metrik zorunludur.');
  metricByKey(dataset, metric);

  const groupBy = readString(value, 'groupBy');
  if (groupBy && !dataset.groupBy.some((item) => item.key === groupBy)) {
    throw new ValidationError('Seçilen dataset için geçerli bir group by seçin.');
  }

  const dateRangePreset = readString(value, 'dateRangePreset');
  const chartType = readString(value, 'chartType');

  return {
    reportType: 'KPI',
    dataset: datasetKey,
    metric,
    groupBy,
    dateRangePreset: isDateRangePreset(dateRangePreset) ? dateRangePreset : 'THIS_MONTH',
    dateFrom: readString(value, 'dateFrom'),
    dateTo: readString(value, 'dateTo'),
    chartType: isChartType(chartType) ? chartType : 'number',
    pinnedToDashboard: readBoolean(value, 'pinnedToDashboard'),
    scheduleEmail: normalizeSchedule(value),
  };
}

export function isKpiConfig(value: Prisma.JsonValue): value is Prisma.JsonObject {
  return isRecord(value) && value.reportType === 'KPI';
}

export class ReportingBuilderService {
  constructor(private readonly db: PrismaClient) {}

  registry(): { datasets: readonly ReportingDatasetDefinition[]; chartTypes: readonly { key: ReportingChartType; label: string }[] } {
    return { datasets: DATASETS, chartTypes: CHART_TYPES };
  }

  async preview(tenantId: string, input: unknown): Promise<KpiPreviewResult> {
    const config = normalizeKpiConfig(input);
    const dataset = datasetByKey(config.dataset);
    const metric = metricByKey(dataset, config.metric);
    const range = resolveDateRange(config);
    const value = await this.metricValue(tenantId, config, range.dateFrom, range.dateTo);

    return {
      config,
      datasetLabel: dataset.label,
      metricLabel: metric.label,
      value,
      formattedValue: formatKpiValue(value, metric.format),
      period: { from: range.from, to: range.to },
      chartType: config.chartType,
      pinnedToDashboard: config.pinnedToDashboard,
      scheduleEmail: config.scheduleEmail,
    };
  }

  private async metricValue(tenantId: string, config: KpiReportConfig, dateFrom: Date | null, dateTo: Date | null): Promise<number> {
    if (config.dataset === 'invoices') return this.invoiceMetric(tenantId, config.metric, dateFrom, dateTo);
    if (config.dataset === 'payments') return this.paymentMetric(tenantId, config.metric, dateFrom, dateTo);
    if (config.dataset === 'stock') return this.stockMetric(tenantId, config.metric);
    return this.contactMetric(tenantId, config.metric);
  }

  private async invoiceMetric(tenantId: string, metric: string, dateFrom: Date | null, dateTo: Date | null): Promise<number> {
    const dateFilter = dateFrom && dateTo ? { date: { gte: dateFrom, lte: dateTo } } : {};
    if (metric === 'invoiceCount') {
      return this.db.invoice.count({ where: { tenantId, status: { not: InvoiceStatus.CANCELLED }, ...dateFilter } });
    }
    if (metric === 'overdueInvoiceCount') {
      return this.db.invoice.count({ where: { tenantId, status: InvoiceStatus.OVERDUE, ...dateFilter } });
    }
    const type = metric === 'purchaseExpense' ? InvoiceType.PURCHASE : InvoiceType.SALES;
    const result = await this.db.invoice.aggregate({
      where: { tenantId, type, status: { not: InvoiceStatus.CANCELLED }, ...dateFilter },
      _sum: { totalGross: true },
    });
    return Number(result._sum.totalGross ?? 0);
  }

  private async paymentMetric(tenantId: string, metric: string, dateFrom: Date | null, dateTo: Date | null): Promise<number> {
    const dateFilter = dateFrom && dateTo ? { date: { gte: dateFrom, lte: dateTo } } : {};
    if (metric === 'paymentCount') return this.db.payment.count({ where: { tenantId, deletedAt: null, ...dateFilter } });
    if (metric === 'paidAmount') {
      const result = await this.db.accountEntry.aggregate({
        where: { tenantId, refType: 'PAYMENT', ...dateFilter },
        _sum: { debit: true },
      });
      return Number(result._sum.debit ?? 0);
    }
    const result = await this.db.accountEntry.aggregate({
      where: { tenantId, refType: 'PAYMENT', ...dateFilter },
      _sum: { credit: true },
    });
    return Number(result._sum.credit ?? 0);
  }

  private async stockMetric(tenantId: string, metric: string): Promise<number> {
    const rows = await this.db.stockLevel.findMany({
      where: { tenantId },
      select: { quantity: true, product: { select: { averageCost: true, minStockLevel: true } } },
    });
    if (metric === 'lowStockCount') {
      return rows.filter((row) => Number(row.quantity) < Number(row.product.minStockLevel)).length;
    }
    if (metric === 'stockLineCount') return rows.length;
    return rows.reduce((sum, row) => sum + Number(row.quantity) * Number(row.product.averageCost), 0);
  }

  private async contactMetric(tenantId: string, metric: string): Promise<number> {
    if (metric === 'activeContactCount') return this.db.contact.count({ where: { tenantId, deletedAt: null, isActive: true } });
    const contacts = await this.db.contact.findMany({
      where: { tenantId, deletedAt: null, isActive: true },
      select: { accountEntries: { orderBy: { date: 'desc' }, take: 1, select: { balance: true } } },
    });
    const balances = contacts.map((contact) => Number(contact.accountEntries[0]?.balance ?? 0));
    if (metric === 'payableAmount') return balances.filter((balance) => balance < 0).reduce((sum, balance) => sum + Math.abs(balance), 0);
    return balances.filter((balance) => balance > 0).reduce((sum, balance) => sum + balance, 0);
  }
}
