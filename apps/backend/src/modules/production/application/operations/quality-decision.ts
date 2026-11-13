import { z } from 'zod';

export const qualityDecisionSchema = z.object({
  decision: z.enum(['APPROVED', 'REJECTED']),
  reason: z.string().trim().min(3).max(1000),
  idempotencyKey: z.string().trim().min(8).max(160),
}).strict();

export type QualityDecisionCommand = z.infer<typeof qualityDecisionSchema>;
