import { z } from 'zod';
import { apiClient } from '../lib/api-client';
import { SingleResponseSchema } from '../types/api.types';

// ─────────────────────────────────────────────
// FAZ 2: Executive Mobile Dashboard Schemas
// ─────────────────────────────────────────────

export const MobileDashboardActivitySchema = z.object({
  id: z.string(),
  type: z.enum(['INVOICE', 'ORDER', 'APPROVAL', 'PAYMENT', 'STOCK', 'SYSTEM']),
  title: z.string(),
  subtitle: z.string(),
  timestamp: z.string(),
  status: z.string(),
  module: z.string(),
});

export const SalesTrendPointSchema = z.object({
  date: z.string(),
  dayLabel: z.string(),
  amount: z.coerce.number(),
  count: z.coerce.number(),
});

export const CashFlowTrendPointSchema = z.object({
  date: z.string(),
  dayLabel: z.string(),
  inflow: z.coerce.number(),
  outflow: z.coerce.number(),
  net: z.coerce.number(),
});

export const CategoryShareSchema = z.object({
  name: z.string(),
  amount: z.coerce.number(),
  percentage: z.coerce.number(),
  color: z.string(),
});

export const MobileAnalyticsSchema = z.object({
  salesTrend: z.array(SalesTrendPointSchema).default([]),
  cashFlowTrend: z.array(CashFlowTrendPointSchema).default([]),
  categoryDistribution: z.array(CategoryShareSchema).default([]),
});

export const MobileDashboardDataSchema = z.object({
  salesSummary: z.object({
    todayGross: z.coerce.number(),
    todayCount: z.coerce.number(),
    yesterdayGross: z.coerce.number(),
    changePercent: z.coerce.number(),
    targetProgress: z.coerce.number(),
  }),
  financeSummary: z.object({
    cashBankTotal: z.coerce.number(),
    overdueTotal: z.coerce.number(),
    overdueCount: z.coerce.number(),
  }),
  operationsSummary: z.object({
    pendingOrders: z.coerce.number(),
    criticalStockCount: z.coerce.number(),
    pendingApprovals: z.coerce.number(),
  }),
  activities: z.array(MobileDashboardActivitySchema),
  unreadNotificationCount: z.coerce.number(),
  analytics: MobileAnalyticsSchema.optional(),
});

export const MobileDashboardResponseSchema = SingleResponseSchema(MobileDashboardDataSchema);

export type MobileDashboardData = z.infer<typeof MobileDashboardDataSchema>;
export type MobileDashboardActivity = z.infer<typeof MobileDashboardActivitySchema>;
export type SalesTrendPoint = z.infer<typeof SalesTrendPointSchema>;
export type CashFlowTrendPoint = z.infer<typeof CashFlowTrendPointSchema>;
export type CategoryShare = z.infer<typeof CategoryShareSchema>;
export type MobileAnalytics = z.infer<typeof MobileAnalyticsSchema>;

// ─────────────────────────────────────────────
// Legacy / Supplementary Schemas
// ─────────────────────────────────────────────

const RevenueSummarySchema = SingleResponseSchema(
  z.object({
    period: z.unknown(),
    invoiceCount: z.coerce.number(),
    totalNet: z.coerce.number(),
    totalTax: z.coerce.number(),
    totalGross: z.coerce.number(),
  })
);

const StockSummarySchema = SingleResponseSchema(
  z.object({
    summary: z.object({
      totalLines: z.coerce.number(),
      belowMinStockCount: z.coerce.number(),
      totalStockValue: z.coerce.number(),
    }),
    belowMinStock: z.array(
      z.object({
        productId: z.string(),
        productCode: z.string(),
        productName: z.string(),
        warehouseName: z.string(),
        quantity: z.coerce.number(),
        minStockLevel: z.coerce.number(),
      })
    ),
    stockLevels: z.array(z.unknown()),
  })
);

const ContactBalanceSchema = SingleResponseSchema(
  z.object({
    contacts: z.array(z.unknown()),
    summary: z.object({
      totalReceivable: z.coerce.number(),
      totalPayable: z.coerce.number(),
    }),
  })
);

const InvoiceItemSchema = z.object({
  id: z.string(),
  number: z.string(),
  date: z.string(),
  status: z.string(),
  type: z.string(),
  totalGross: z.coerce.number(),
  contact: z.object({ name: z.string().optional() }).nullable().optional(),
});

const InvoiceListSchema = z.object({
  data: z.array(InvoiceItemSchema),
  meta: z.object({
    total: z.number(),
    page: z.number(),
    pageSize: z.number(),
    totalPages: z.number(),
  }),
});

const NotificationItemSchema = z.object({
  id: z.string(),
  title: z.string(),
  message: z.string().nullable(),
  status: z.string(),
  createdAt: z.string(),
  module: z.string().nullable(),
});

const NotificationsSchema = SingleResponseSchema(z.array(NotificationItemSchema));

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

export type RevenueSummary = z.infer<typeof RevenueSummarySchema>['data'];
export type StockSummary = z.infer<typeof StockSummarySchema>['data'];
export type ContactBalance = z.infer<typeof ContactBalanceSchema>['data'];
export type InvoiceItem = z.infer<typeof InvoiceItemSchema>;
export type NotificationItem = z.infer<typeof NotificationItemSchema>;

// ─────────────────────────────────────────────
// Service Functions
// ─────────────────────────────────────────────

/**
 * Fetch executive aggregated KPI dashboard data for Mobile
 */
export async function getMobileDashboard(): Promise<MobileDashboardData> {
  const res = await apiClient.get('/api/mobile/dashboard');
  return MobileDashboardResponseSchema.parse(res.data).data;
}

export async function getRevenueSummary(dateFrom: string, dateTo: string): Promise<RevenueSummary> {
  const res = await apiClient.get('/api/reports/revenue-summary', { params: { dateFrom, dateTo } });
  return RevenueSummarySchema.parse(res.data).data;
}

export async function getExpenseSummary(dateFrom: string, dateTo: string): Promise<RevenueSummary> {
  const res = await apiClient.get('/api/reports/expense-summary', { params: { dateFrom, dateTo } });
  return RevenueSummarySchema.parse(res.data).data;
}

export async function getStockSummary(): Promise<StockSummary> {
  const res = await apiClient.get('/api/reports/stock-summary');
  return StockSummarySchema.parse(res.data).data;
}

export async function getContactBalance(): Promise<ContactBalance> {
  const res = await apiClient.get('/api/reports/contact-balance');
  return ContactBalanceSchema.parse(res.data).data;
}

export async function getRecentInvoices(limit = 5): Promise<InvoiceItem[]> {
  const res = await apiClient.get('/api/invoices', { params: { limit } });
  return InvoiceListSchema.parse(res.data).data;
}

export async function getNotifications(limit = 5): Promise<NotificationItem[]> {
  const res = await apiClient.get('/api/notifications', { params: { limit } });
  return NotificationsSchema.parse(res.data).data;
}
