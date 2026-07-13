'use client';

import { z } from 'zod';
import { apiClient } from '@/lib/api-client';
import { safeParse } from '@/lib/safe-parse';
import { SingleResponseSchema } from '@/types/api.types';

export const PlanUsageMetricKeySchema = z.enum(['users', 'products', 'warehouses', 'apiKeys', 'storage']);
export const PlanUsageUnitSchema = z.enum(['count', 'bytes']);
export const PlanUsageStatusSchema = z.enum(['ok', 'warning', 'full', 'unlimited']);

export const PlanUsageMetricSchema = z.object({
  key: PlanUsageMetricKeySchema,
  label: z.string(),
  used: z.coerce.number(),
  limit: z.coerce.number().nullable(),
  unit: PlanUsageUnitSchema,
  percent: z.coerce.number().nullable(),
  status: PlanUsageStatusSchema,
  locked: z.boolean(),
  reason: z.string().nullable(),
});

export const PlanUsageSummarySchema = z.object({
  tenantId: z.string(),
  plan: z.enum(['STARTER', 'PROFESSIONAL', 'ENTERPRISE']),
  generatedAt: z.string(),
  metrics: z.array(PlanUsageMetricSchema),
});

export type PlanUsageMetricKey = z.infer<typeof PlanUsageMetricKeySchema>;
export type PlanUsageUnit = z.infer<typeof PlanUsageUnitSchema>;
export type PlanUsageStatus = z.infer<typeof PlanUsageStatusSchema>;
export type PlanUsageMetric = z.infer<typeof PlanUsageMetricSchema>;
export type PlanUsageSummary = z.infer<typeof PlanUsageSummarySchema>;

const PlanUsageResponseSchema = SingleResponseSchema(PlanUsageSummarySchema);

export async function getPlanUsageSummary(): Promise<PlanUsageSummary> {
  const res = await apiClient.get('/api/plan-usage');
  return safeParse(PlanUsageResponseSchema, res.data, 'getPlanUsageSummary').data;
}
