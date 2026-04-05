import { z } from 'zod';
import { apiClient } from '@/lib/api-client';
import { safeParse } from '@/lib/safe-parse';
import { SingleResponseSchema, PaginatedResponseSchema } from '@/types/api.types';
import type { PaginationParams } from '@/types/api.types';

const BankAccountRef = z.object({ id: z.string(), name: z.string(), bankName: z.string().optional() });

export const BankTransactionSchema = z.object({
  id: z.string(), tenantId: z.string(), bankAccountId: z.string(),
  type: z.enum(['DEPOSIT', 'WITHDRAWAL', 'TRANSFER', 'FEE', 'INTEREST', 'OTHER']),
  amount: z.coerce.number(), balanceAfter: z.coerce.number(),
  date: z.string(), description: z.string().nullable(), reference: z.string().nullable(),
  refType: z.string().nullable(), refId: z.string().nullable(),
  createdAt: z.string(),
  bankAccount: BankAccountRef.optional(),
});

export type BankTransaction = z.infer<typeof BankTransactionSchema>;
export type BankTransactionType = BankTransaction['type'];

export interface CreateBankTransactionDTO {
  bankAccountId: string; type: BankTransactionType;
  amount: number; balanceAfter: number; date: string;
  description?: string; reference?: string;
}

export interface ListParams extends PaginationParams { bankAccountId?: string; type?: string; dateFrom?: string; dateTo?: string }

export async function getBankTransactions(params: ListParams) {
  const res = await apiClient.get('/api/bank-transactions', { params });
  return safeParse(PaginatedResponseSchema(BankTransactionSchema), res.data, 'getBankTransactions');
}

export async function createBankTransaction(data: CreateBankTransactionDTO): Promise<BankTransaction> {
  const res = await apiClient.post('/api/bank-transactions', data);
  return safeParse(SingleResponseSchema(BankTransactionSchema), res.data, 'createBankTransaction').data;
}

export async function matchBankTransaction(id: string, refType: string, refId: string): Promise<BankTransaction> {
  const res = await apiClient.post(`/api/bank-transactions/${id}/match`, { refType, refId });
  return safeParse(SingleResponseSchema(BankTransactionSchema), res.data, 'matchBankTransaction').data;
}
