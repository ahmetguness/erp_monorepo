import { z } from 'zod';
import { apiClient } from '@/lib/api-client';
import { safeParse } from '@/lib/safe-parse';
import { SingleResponseSchema } from '@/types/api.types';

export const FinanceOperationsPolicySchema = z.object({ autoProcessEnabled: z.boolean(), autoMatchMinConfidence: z.number(), feedStaleHours: z.number(), duplicateWindowDays: z.number() });
const FinanceExceptionSchema = z.object({ id: z.string(), kind: z.enum(['LOW_CONFIDENCE', 'NO_CANDIDATE', 'POSSIBLE_SPLIT', 'DUPLICATE_DRAFT', 'FEED_STALE']), title: z.string(), detail: z.string(), amount: z.number().nullable(), confidence: z.number().nullable(), href: z.string(), sourceIds: z.array(z.string()) });
const FinanceOperationsWorkspaceSchema = z.object({
  generatedAt: z.string(), policy: FinanceOperationsPolicySchema,
  feed: z.object({ lastTransactionAt: z.string().nullable(), stale: z.boolean() }),
  summary: z.object({ automaticallyProcessed: z.number(), readyForAutomaticProcessing: z.number(), exceptions: z.number(), recurringPatterns: z.number() }),
  exceptions: z.array(FinanceExceptionSchema),
  recurringPatterns: z.array(z.object({ key: z.string(), description: z.string(), occurrences: z.number(), averageAmount: z.number(), suggestedAction: z.enum(['CREATE_RECURRING_EXPENSE_DRAFT', 'LEARN_DESCRIPTION']) })),
});
const FinanceOperationsRunResultSchema = z.object({ scanned: z.number(), processed: z.number(), skipped: z.number(), workspace: FinanceOperationsWorkspaceSchema });

export type FinanceOperationsPolicy = z.infer<typeof FinanceOperationsPolicySchema>;
export type FinanceOperationsWorkspaceData = z.infer<typeof FinanceOperationsWorkspaceSchema>;

export async function getFinanceOperationsWorkspace(): Promise<FinanceOperationsWorkspaceData> {
  const response = await apiClient.get('/api/financial-autonomy/operations');
  return safeParse(SingleResponseSchema(FinanceOperationsWorkspaceSchema), response.data, 'getFinanceOperationsWorkspace').data;
}
export async function updateFinanceOperationsPolicy(policy: FinanceOperationsPolicy): Promise<FinanceOperationsPolicy> {
  const response = await apiClient.put('/api/financial-autonomy/operations/policy', policy);
  return safeParse(SingleResponseSchema(FinanceOperationsPolicySchema), response.data, 'updateFinanceOperationsPolicy').data;
}
export async function runFinanceOperations() {
  const response = await apiClient.post('/api/financial-autonomy/operations/run');
  return safeParse(SingleResponseSchema(FinanceOperationsRunResultSchema), response.data, 'runFinanceOperations').data;
}
