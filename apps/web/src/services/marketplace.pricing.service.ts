import { z } from 'zod';
import { apiClient } from '@/lib/api-client';

export const RepricingAnalysisItemSchema = z.object({
  listingId: z.string(),
  integrationId: z.string(),
  integrationName: z.string(),
  channel: z.enum(['TRENDYOL', 'HEPSIBURADA', 'N11', 'AMAZON_TR', 'B2B_PORTAL', 'WOOCOMMERCE', 'SHOPIFY']),
  productId: z.string(),
  productName: z.string(),
  externalSku: z.string(),
  currentPrice: z.number(),
  averageCost: z.number(),
  currentMarginPct: z.number(),
  recommendedPrice: z.number(),
  targetMarginPct: z.number(),
  status: z.enum(['OPTIMAL', 'REPRICE_NEEDED', 'MARGIN_RISK']),
});

export const ChannelStockAllocationItemSchema = z.object({
  productId: z.string(),
  productName: z.string(),
  totalOnHandStock: z.number(),
  channelAllocations: z.array(
    z.object({
      integrationId: z.string(),
      channelName: z.string(),
      currentAllocatedStock: z.number(),
      salesVelocity30Days: z.number(),
      recommendedStockQuota: z.number(),
    }),
  ),
});

export const BatchRepricingResultSchema = z.object({
  totalListingsScanned: z.number(),
  updatedCount: z.number(),
  marginRisksResolved: z.number(),
  optimizedAt: z.string(),
  updatedListings: z.array(
    z.object({
      listingId: z.string(),
      productName: z.string(),
      oldPrice: z.number(),
      newPrice: z.number(),
    }),
  ),
});

export type RepricingAnalysisItem = z.infer<typeof RepricingAnalysisItemSchema>;
export type ChannelStockAllocationItem = z.infer<typeof ChannelStockAllocationItemSchema>;
export type BatchRepricingResult = z.infer<typeof BatchRepricingResultSchema>;

export async function getRepricingAnalysis(): Promise<RepricingAnalysisItem[]> {
  const res = await apiClient.get('/api/marketplace-pricing/repricing-analysis');
  return res.data.data;
}

export async function executeReprice(listingId: string, targetPrice?: number): Promise<{ success: boolean; listingId: string; newPrice: number }> {
  const res = await apiClient.post('/api/marketplace-pricing/execute-reprice', { listingId, targetPrice });
  return res.data.data;
}

export async function getStockAllocations(): Promise<ChannelStockAllocationItem[]> {
  const res = await apiClient.get('/api/marketplace-pricing/stock-allocations');
  return res.data.data;
}

export async function reallocateStock(productId: string): Promise<{ success: boolean; message: string }> {
  const res = await apiClient.post('/api/marketplace-pricing/reallocate-stock', { productId });
  return res.data.data;
}

export async function runBatchRepricingScan(autoApply = true): Promise<BatchRepricingResult> {
  const res = await apiClient.post('/api/marketplace-pricing/run-batch-scan', { autoApply });
  return res.data.data;
}
