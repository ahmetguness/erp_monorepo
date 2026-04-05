import { z } from 'zod';
import { apiClient } from '@/lib/api-client';
import { safeParse } from '@/lib/safe-parse';
import { SingleResponseSchema, PaginatedResponseSchema } from '@/types/api.types';
import type { PaginationParams } from '@/types/api.types';

const ProductRef = z.object({ id: z.string(), code: z.string(), name: z.string() });
const BatchRef = z.object({ id: z.string(), batchNumber: z.string() });

export const LotSerialSchema = z.object({
  id: z.string(), tenantId: z.string(), productId: z.string(), batchId: z.string().nullable(),
  serialNumber: z.string(), isUsed: z.boolean(),
  usedAt: z.string().nullable(), usedRefType: z.string().nullable(), usedRefId: z.string().nullable(),
  createdAt: z.string(),
  product: ProductRef.optional(), batch: BatchRef.optional().nullable(),
});

export type LotSerial = z.infer<typeof LotSerialSchema>;

export interface CreateLotSerialDTO { productId: string; batchId?: string; serialNumber: string }

export interface ListParams extends PaginationParams { productId?: string; batchId?: string; isUsed?: string }

export async function getLotSerials(params: ListParams) {
  const res = await apiClient.get('/api/lot-serials', { params });
  return safeParse(PaginatedResponseSchema(LotSerialSchema), res.data, 'getLotSerials');
}

export async function createLotSerial(data: CreateLotSerialDTO): Promise<LotSerial> {
  const res = await apiClient.post('/api/lot-serials', data);
  return safeParse(SingleResponseSchema(LotSerialSchema), res.data, 'createLotSerial').data;
}

export async function assignLotToMovement(id: string, usedRefType: string, usedRefId: string): Promise<LotSerial> {
  const res = await apiClient.post(`/api/lot-serials/${id}/assign`, { usedRefType, usedRefId });
  return safeParse(SingleResponseSchema(LotSerialSchema), res.data, 'assignLotToMovement').data;
}
