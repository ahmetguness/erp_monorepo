import { z } from 'zod';
import { apiClient } from '@/lib/api-client';
import { safeParse } from '@/lib/safe-parse';
import { SingleResponseSchema } from '@/types/api.types';

export const AdaptiveDefaultFieldSchema = z.enum(['paymentTermDays', 'taxRateId']);
export const AdaptiveTransactionTypeSchema = z.enum(['SALES', 'PURCHASE', 'RETURN_SALES', 'RETURN_PURCHASE']);
export const AdaptiveDefaultSuggestionSchema = z.object({
  field: AdaptiveDefaultFieldSchema,
  value: z.string(),
  confidence: z.number().min(0).max(1),
  sampleSize: z.number().int().nonnegative(),
  source: z.enum(['contact', 'user', 'tenant', 'policy']),
  reason: z.string(),
  autoApplicable: z.boolean(),
});
export const AdaptiveDefaultsSnapshotSchema = z.object({
  formKind: z.literal('invoice'),
  transactionType: AdaptiveTransactionTypeSchema,
  contactId: z.string().nullable(),
  suggestions: z.array(AdaptiveDefaultSuggestionSchema),
  generatedAt: z.string(),
});

export type AdaptiveDefaultField = z.infer<typeof AdaptiveDefaultFieldSchema>;
export type AdaptiveTransactionType = z.infer<typeof AdaptiveTransactionTypeSchema>;
export type AdaptiveDefaultSuggestion = z.infer<typeof AdaptiveDefaultSuggestionSchema>;
export type AdaptiveDefaultsSnapshot = z.infer<typeof AdaptiveDefaultsSnapshotSchema>;

export async function getAdaptiveDefaults(params: { transactionType: AdaptiveTransactionType; contactId?: string }): Promise<AdaptiveDefaultsSnapshot> {
  const response = await apiClient.get('/api/settings/adaptive-defaults', { params: { formKind: 'invoice', ...params } });
  return safeParse(SingleResponseSchema(AdaptiveDefaultsSnapshotSchema), response.data, 'getAdaptiveDefaults').data;
}

export async function dismissAdaptiveDefault(field: AdaptiveDefaultField): Promise<void> {
  await apiClient.post('/api/settings/adaptive-defaults/dismiss', { formKind: 'invoice', field });
}

export async function resetAdaptiveDefaults(): Promise<void> {
  await apiClient.delete('/api/settings/adaptive-defaults');
}
