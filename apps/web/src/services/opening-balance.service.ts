import { z } from 'zod';
import { apiClient } from '@/lib/api-client';
import { safeParse } from '@/lib/safe-parse';
import { SingleResponseSchema } from '@/types/api.types';

export const OpeningBalanceInputSchema = z.object({
  openingDate: z.string(),
  reference: z.string(),
  contacts: z.array(z.object({ contactCode: z.string(), debit: z.number(), credit: z.number(), description: z.string().optional() })),
  banks: z.array(z.object({ bankAccountId: z.string(), balance: z.number(), description: z.string().optional() })),
  ledger: z.array(z.object({ accountCode: z.string(), debit: z.number(), credit: z.number(), description: z.string().optional() })),
});

export const OpeningBalancePreviewSchema = z.object({
  importId: z.string(), openingDate: z.string(), valid: z.boolean(), replayed: z.boolean(),
  issues: z.array(z.object({ scope: z.enum(['period', 'contacts', 'banks', 'ledger']), row: z.number().nullable(), message: z.string() })),
  totals: z.object({ contactDebit: z.number(), contactCredit: z.number(), bankBalance: z.number(), ledgerDebit: z.number(), ledgerCredit: z.number() }),
  closedPriorPeriod: z.object({ id: z.string(), name: z.string(), endDate: z.string() }).nullable(),
});

export const OpeningBalanceCommitResultSchema = OpeningBalancePreviewSchema.extend({
  accountEntriesCreated: z.number(), bankTransactionsCreated: z.number(), journalEntryId: z.string(), journalEntryNumber: z.string(),
});

export type OpeningBalanceInput = z.infer<typeof OpeningBalanceInputSchema>;
export type OpeningBalancePreview = z.infer<typeof OpeningBalancePreviewSchema>;
export type OpeningBalanceCommitResult = z.infer<typeof OpeningBalanceCommitResultSchema>;

export async function previewOpeningBalances(input: OpeningBalanceInput): Promise<OpeningBalancePreview> {
  const response = await apiClient.post('/api/accounting/opening-balances/preview', input);
  return safeParse(SingleResponseSchema(OpeningBalancePreviewSchema), response.data, 'previewOpeningBalances').data;
}

export async function commitOpeningBalances(input: OpeningBalanceInput): Promise<OpeningBalanceCommitResult> {
  const response = await apiClient.post('/api/accounting/opening-balances/commit', input);
  return safeParse(SingleResponseSchema(OpeningBalanceCommitResultSchema), response.data, 'commitOpeningBalances').data;
}
