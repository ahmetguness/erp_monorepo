import { z } from 'zod';
import { apiClient } from '../lib/api-client';
import { SingleResponseSchema } from '../types/api.types';

// ─────────────────────────────────────────────
// Schemas
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
