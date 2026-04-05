import { z } from 'zod';
import { apiClient } from '@/lib/api-client';
import { safeParse } from '@/lib/safe-parse';
import { SingleResponseSchema, PaginatedResponseSchema } from '@/types/api.types';
import type { PaginationParams } from '@/types/api.types';

export const CheckPromissorySchema = z.object({
  id: z.string(), tenantId: z.string(), contactId: z.string().nullable(),
  type: z.enum(['CHECK', 'PROMISSORY_NOTE']),
  status: z.enum(['PENDING', 'DEPOSITED', 'CLEARED', 'BOUNCED', 'CANCELLED']),
  number: z.string(), amount: z.coerce.number(), currencyCode: z.string(),
  issueDate: z.string(), dueDate: z.string(),
  bankName: z.string().nullable(), notes: z.string().nullable(),
  createdAt: z.string(), updatedAt: z.string(),
});

export type CheckPromissory = z.infer<typeof CheckPromissorySchema>;
export type CheckNoteType = CheckPromissory['type'];
export type CheckStatus = CheckPromissory['status'];

export interface CreateCheckPromissoryDTO {
  contactId?: string; type: CheckNoteType; number: string;
  amount: number; currencyCode?: string;
  issueDate: string; dueDate: string;
  bankName?: string; notes?: string;
}

export interface ListParams extends PaginationParams { type?: string; status?: string; contactId?: string }

export async function getCheckPromissoryNotes(params: ListParams) {
  const res = await apiClient.get('/api/check-promissory', { params });
  return safeParse(PaginatedResponseSchema(CheckPromissorySchema), res.data, 'getCheckPromissoryNotes');
}

export async function createCheckPromissory(data: CreateCheckPromissoryDTO): Promise<CheckPromissory> {
  const res = await apiClient.post('/api/check-promissory', data);
  return safeParse(SingleResponseSchema(CheckPromissorySchema), res.data, 'createCheckPromissory').data;
}

export async function updateCheckStatus(id: string, status: CheckStatus): Promise<CheckPromissory> {
  const res = await apiClient.patch(`/api/check-promissory/${id}/status`, { status });
  return safeParse(SingleResponseSchema(CheckPromissorySchema), res.data, 'updateCheckStatus').data;
}
