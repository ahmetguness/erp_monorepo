import { z } from 'zod';
import { apiClient } from '@/lib/api-client';
import { SingleResponseSchema } from '@/types/api.types';

// ─────────────────────────────────────────────
// Schemas
// ─────────────────────────────────────────────

const RevenueSummarySchema = SingleResponseSchema(z.object({
  period: z.object({ from: z.string(), to: z.string() }),
  invoiceCount: z.number(),
  totalNet: z.number(),
  totalTax: z.number(),
  totalGross: z.number(),
}));

const StockSummarySchema = SingleResponseSchema(z.object({
  summary: z.object({ totalLines: z.number(), belowMinStockCount: z.number(), totalStockValue: z.number() }),
  belowMinStock: z.array(z.object({
    productId: z.string(), productCode: z.string(), productName: z.string(),
    warehouseName: z.string(), quantity: z.number(), minStockLevel: z.number(),
  })),
  stockLevels: z.array(z.unknown()),
}));

const ContactBalanceSchema = SingleResponseSchema(z.object({
  contacts: z.array(z.object({
    contactId: z.string(), name: z.string(), code: z.string().nullable(),
    type: z.string(), balance: z.number(), lastEntryDate: z.string().nullable(),
  })),
  summary: z.object({ totalReceivable: z.number(), totalPayable: z.number() }),
}));

const SavedReportSchema = z.object({
  id: z.string(), tenantId: z.string(), name: z.string(), module: z.string(),
  filters: z.record(z.string(), z.unknown()), columns: z.array(z.string()),
  isShared: z.boolean(), createdBy: z.string().nullable(),
  createdAt: z.string(), updatedAt: z.string(),
});

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

export type RevenueSummary = z.infer<typeof RevenueSummarySchema>['data'];
export type StockSummary = z.infer<typeof StockSummarySchema>['data'];
export type ContactBalance = z.infer<typeof ContactBalanceSchema>['data'];
export type SavedReport = z.infer<typeof SavedReportSchema>;

// ─────────────────────────────────────────────
// Service functions
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

export async function getSavedReports(): Promise<SavedReport[]> {
  const res = await apiClient.get('/api/reports/saved');
  return SingleResponseSchema(z.array(SavedReportSchema)).parse(res.data).data;
}

export async function createSavedReport(data: { name: string; module: string; filters?: Record<string, unknown>; columns?: string[] }): Promise<SavedReport> {
  const res = await apiClient.post('/api/reports/saved', data);
  return SingleResponseSchema(SavedReportSchema).parse(res.data).data;
}

export async function deleteSavedReport(id: string): Promise<void> {
  await apiClient.delete(`/api/reports/saved/${id}`);
}
