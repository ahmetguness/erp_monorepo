import { z } from 'zod';
import { apiClient } from '@/lib/api-client';

export const ProcurementProjectionItemSchema = z.object({
  productId: z.string(),
  productName: z.string(),
  productSku: z.string(),
  onHandQty: z.number(),
  reservedQty: z.number(),
  incomingQty: z.number(),
  projectedStock: z.number(),
  minStockLevel: z.number(),
  dailyBurnRate: z.number(),
  daysOfSupply: z.number(),
  reorderStatus: z.enum(['OK', 'REORDER_NEEDED', 'CRITICAL_REORDER']),
  preferredSupplierId: z.string().optional(),
  preferredSupplierName: z.string().optional(),
});

export const SupplierReliabilityItemSchema = z.object({
  supplierId: z.string(),
  supplierName: z.string(),
  totalOrders: z.number(),
  onTimeDeliveryRatePct: z.number(),
  priceStabilityScore: z.number(),
  reliabilityScore: z.number(),
  riskCategory: z.enum(['LOW', 'MEDIUM', 'HIGH']),
});

export const ZeroTouchPoDispatchResultSchema = z.object({
  purchaseOrderId: z.string(),
  purchaseOrderNumber: z.string(),
  supplierName: z.string(),
  productName: z.string(),
  quantity: z.number(),
  unitPrice: z.number(),
  totalAmount: z.number(),
  status: z.string(),
  dispatchedAt: z.string(),
});

export type ProcurementProjectionItem = z.infer<typeof ProcurementProjectionItemSchema>;
export type SupplierReliabilityItem = z.infer<typeof SupplierReliabilityItemSchema>;
export type ZeroTouchPoDispatchResult = z.infer<typeof ZeroTouchPoDispatchResultSchema>;

export async function getProcurementProjections(): Promise<ProcurementProjectionItem[]> {
  const res = await apiClient.get('/api/procurement-autonomy/projections');
  return res.data.data;
}

export async function getSupplierReliabilityScores(): Promise<SupplierReliabilityItem[]> {
  const res = await apiClient.get('/api/procurement-autonomy/suppliers');
  return res.data.data;
}

export async function dispatchZeroTouchPo(productId: string, autoDispatch = true): Promise<ZeroTouchPoDispatchResult> {
  const res = await apiClient.post('/api/procurement-autonomy/dispatch-po', { productId, autoDispatch });
  return res.data.data;
}

export async function runProcurementBatchScan(autoDispatch = true): Promise<{ scannedProducts: number; dispatchedOrders: ZeroTouchPoDispatchResult[] }> {
  const res = await apiClient.post('/api/procurement-autonomy/run-scan', { autoDispatch });
  return res.data.data;
}
