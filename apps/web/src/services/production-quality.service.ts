import { z } from 'zod';
import { apiClient } from '@/lib/api-client';

export const qualityDecisionSchema = z.object({
  decision: z.enum(['APPROVED', 'REJECTED']), reason: z.string().trim().min(3).max(1000), idempotencyKey: z.string().min(8),
});
export type QualityDecisionInput = z.infer<typeof qualityDecisionSchema>;

export async function decideProductionQuality(id: string, input: QualityDecisionInput): Promise<void> {
  const response = await apiClient.post<unknown>(`/api/production/work-orders/${id}/quality-decisions`, qualityDecisionSchema.parse(input));
  z.object({ data: z.object({ id: z.string(), qualityDecision: z.enum(['APPROVED', 'REJECTED']) }) }).parse(response.data);
}
