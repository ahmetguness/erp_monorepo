import { z } from 'zod';
import type { ReplenishmentPolicy } from '../../application/replenishment/index.js';

const schema = z.object({
  lookbackDays: z.number().finite(),
  horizonDays: z.number().finite(),
  targetServiceLevel: z.number().finite(),
  autoCreateDrafts: z.boolean(),
  maximumDraftValue: z.number().finite(),
}).strict();

export function parseReplenishmentPolicy(value: unknown): ReplenishmentPolicy | null {
  const result = schema.safeParse(value);
  return result.success ? result.data : null;
}
