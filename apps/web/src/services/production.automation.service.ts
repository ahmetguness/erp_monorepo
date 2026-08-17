import { z } from 'zod';
import { apiClient } from '@/lib/api-client';

export const ProductionDerivationResultSchema = z.object({
  workOrderId: z.string(),
  previousStatus: z.string(),
  derivedStatus: z.string(),
  plannedQty: z.number(),
  producedQty: z.number(),
  materialReservationCount: z.number(),
  autoCompleted: z.boolean(),
});

export type ProductionDerivationResult = z.infer<typeof ProductionDerivationResultSchema>;

export async function deriveWorkOrderStatus(id: string): Promise<ProductionDerivationResult> {
  const res = await apiClient.post(`/api/production/work-orders/${encodeURIComponent(id)}/automation/derive-status`);
  return res.data.data;
}

export async function autoCompleteProduction(id: string, outputQty?: number): Promise<{ workOrderId: string; status: string }> {
  const res = await apiClient.post(`/api/production/work-orders/${encodeURIComponent(id)}/automation/auto-complete`, {
    outputQty,
  });
  return res.data.data;
}
