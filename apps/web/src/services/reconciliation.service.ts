import { z } from 'zod';
import { apiClient } from '@/lib/api-client';
import { safeParse } from '@/lib/safe-parse';
import { SingleResponseSchema, PaginatedResponseSchema } from '@/types/api.types';
import type { PaginationParams } from '@/types/api.types';

const AccountRef = z.object({ id: z.string(), code: z.string(), name: z.string() });

export const ReconciliationLineSchema = z.object({
  id: z.string(), tenantId: z.string(), reconciliationId: z.string(),
  accountId: z.string(), refType: z.string().nullable(), refId: z.string().nullable(),
  amount: z.coerce.number(), isMatched: z.boolean().optional(), notes: z.string().nullable(),
  account: AccountRef.optional(),
});

export const ReconciliationSchema = z.object({
  id: z.string(), tenantId: z.string(), name: z.string(),
  description: z.string().nullable(), date: z.string(),
  isFinalized: z.boolean(), finalizedAt: z.string().nullable(),
  createdAt: z.string(), updatedAt: z.string(),
  lines: z.array(ReconciliationLineSchema).optional(),
  _count: z.object({ lines: z.coerce.number() }).optional(),
});

export type Reconciliation = z.infer<typeof ReconciliationSchema>;
export type ReconciliationLine = z.infer<typeof ReconciliationLineSchema>;

export interface CreateReconciliationDTO {
  name: string; description?: string; date: string;
  lines?: Array<{ accountId: string; refType?: string; refId?: string; amount: number; notes?: string }>;
}

export interface AddLineDTO { accountId: string; refType?: string; refId?: string; amount: number; notes?: string }

export interface ListParams extends PaginationParams { isFinalized?: string }

export async function getReconciliations(params: ListParams) {
  const res = await apiClient.get('/api/reconciliations', { params });
  return safeParse(PaginatedResponseSchema(ReconciliationSchema), res.data, 'getReconciliations');
}

export async function getReconciliationById(id: string): Promise<Reconciliation> {
  const res = await apiClient.get(`/api/reconciliations/${id}`);
  return safeParse(SingleResponseSchema(ReconciliationSchema), res.data, 'getReconciliationById').data;
}

export async function createReconciliation(data: CreateReconciliationDTO): Promise<Reconciliation> {
  const res = await apiClient.post('/api/reconciliations', data);
  return safeParse(SingleResponseSchema(ReconciliationSchema), res.data, 'createReconciliation').data;
}

export async function addReconciliationLine(id: string, data: AddLineDTO): Promise<ReconciliationLine> {
  const res = await apiClient.post(`/api/reconciliations/${id}/lines`, data);
  return safeParse(SingleResponseSchema(ReconciliationLineSchema), res.data, 'addReconciliationLine').data;
}

export async function finalizeReconciliation(id: string): Promise<Reconciliation> {
  const res = await apiClient.post(`/api/reconciliations/${id}/finalize`);
  return safeParse(SingleResponseSchema(ReconciliationSchema), res.data, 'finalizeReconciliation').data;
}
