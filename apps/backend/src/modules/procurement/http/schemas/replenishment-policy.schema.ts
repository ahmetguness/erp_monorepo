import { z } from 'zod';
import type { ReplenishmentPolicy } from '../../application/replenishment/index.js';

const schema = z.object({
  lookbackDays: z.number().finite(),
  horizonDays: z.number().finite(),
  targetServiceLevel: z.number().finite(),
  autoCreateDrafts: z.boolean(),
  maximumDraftValue: z.number().finite(),
}).strict();

const dispatchSchema = z.object({
  productId: z.string().trim().min(1).max(64),
  autoDispatch: z.literal(false).optional(),
}).strict();

const scanSchema = z.object({ autoDispatch: z.literal(false).optional() }).strict();

export function parseReplenishmentPolicy(value: unknown): ReplenishmentPolicy | null {
  const result = schema.safeParse(value);
  return result.success ? result.data : null;
}

export function parseProcurementDispatch(value: unknown): { productId: string } | null {
  const result = dispatchSchema.safeParse(value);
  return result.success ? { productId: result.data.productId } : null;
}

export function parseProcurementScan(value: unknown): Record<string, never> | null {
  return scanSchema.safeParse(value).success ? {} : null;
}
