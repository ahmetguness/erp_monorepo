'use client';

import { z } from 'zod';
import { apiClient } from '@/lib/api-client';
import { safeParse } from '@/lib/safe-parse';
import { SingleResponseSchema } from '@/types/api.types';

export const SalesTargetSnapshotSchema = z.object({
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
  targetAmount: z.coerce.number(),
  actualAmount: z.coerce.number(),
  progressPercent: z.coerce.number(),
  remainingAmount: z.coerce.number(),
  startDate: z.string(),
  endDate: z.string(),
});

export type SalesTargetSnapshot = z.infer<typeof SalesTargetSnapshotSchema>;

export interface UpdateSalesTargetInput {
  month: string;
  targetAmount: number;
}

const SalesTargetResponseSchema = SingleResponseSchema(SalesTargetSnapshotSchema);

export function currentMonthKey(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

export async function getMonthlySalesTarget(month: string): Promise<SalesTargetSnapshot> {
  const res = await apiClient.get('/api/sales-targets/monthly', { params: { month } });
  return safeParse(SalesTargetResponseSchema, res.data, 'getMonthlySalesTarget').data;
}

export async function updateMonthlySalesTarget(input: UpdateSalesTargetInput): Promise<SalesTargetSnapshot> {
  const res = await apiClient.put('/api/sales-targets/monthly', input);
  return safeParse(SalesTargetResponseSchema, res.data, 'updateMonthlySalesTarget').data;
}
