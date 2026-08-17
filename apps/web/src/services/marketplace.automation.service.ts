import { z } from 'zod';
import { apiClient } from '@/lib/api-client';
import { safeParse } from '@/lib/safe-parse';
import { SingleResponseSchema } from '@/types/api.types';

export const MarketplaceAutomationPolicySchema = z.object({
  autoCreateContact: z.boolean(),
  autoCreateSalesOrder: z.boolean(),
  autoReserveStock: z.boolean(),
  autoCreateInvoice: z.boolean(),
  autoSyncErpStockToMarketplace: z.boolean(),
});

export type MarketplaceAutomationPolicy = z.infer<typeof MarketplaceAutomationPolicySchema>;

export const OrderAutomationResultSchema = z.object({
  marketplaceOrderId: z.string(),
  externalId: z.string(),
  contactId: z.string().nullable(),
  contactCreated: z.boolean(),
  matchedSkuCount: z.number(),
  unmatchedSkuCount: z.number(),
  salesOrderId: z.string().nullable(),
  reservationIds: z.array(z.string()),
  statusSynced: z.boolean(),
  errors: z.array(z.string()),
});

export type OrderAutomationResult = z.infer<typeof OrderAutomationResultSchema>;

export const MarketplaceAutomationSummarySchema = z.object({
  policy: MarketplaceAutomationPolicySchema,
  totalMarketplaceOrders: z.number(),
  matchedContactCount: z.number(),
  salesOrderCount: z.number(),
  reservationCount: z.number(),
  unmatchedSkuCount: z.number(),
});

export type MarketplaceAutomationSummary = z.infer<typeof MarketplaceAutomationSummarySchema>;

export async function getMarketplaceAutomationSummary(): Promise<MarketplaceAutomationSummary> {
  const res = await apiClient.get('/api/marketplace/automation/summary');
  return safeParse(SingleResponseSchema(MarketplaceAutomationSummarySchema), res.data, 'getMarketplaceAutomationSummary').data;
}

export async function getMarketplaceAutomationPolicy(): Promise<MarketplaceAutomationPolicy> {
  const res = await apiClient.get('/api/marketplace/automation/policy');
  return safeParse(SingleResponseSchema(MarketplaceAutomationPolicySchema), res.data, 'getMarketplaceAutomationPolicy').data;
}

export async function updateMarketplaceAutomationPolicy(data: Partial<MarketplaceAutomationPolicy>): Promise<MarketplaceAutomationPolicy> {
  const res = await apiClient.post('/api/marketplace/automation/policy', data);
  return safeParse(SingleResponseSchema(MarketplaceAutomationPolicySchema), res.data, 'updateMarketplaceAutomationPolicy').data;
}

export async function triggerOrderAutomation(id: string): Promise<OrderAutomationResult> {
  const res = await apiClient.post(`/api/marketplace/orders/${encodeURIComponent(id)}/automate`);
  return safeParse(SingleResponseSchema(OrderAutomationResultSchema), res.data, 'triggerOrderAutomation').data;
}

export async function triggerStockSync(productId: string): Promise<{ syncedListings: number; errors: string[] }> {
  const res = await apiClient.post(`/api/marketplace/products/${encodeURIComponent(productId)}/sync-stock`);
  return res.data.data;
}
