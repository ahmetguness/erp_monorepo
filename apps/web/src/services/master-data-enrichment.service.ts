import { z } from 'zod';
import { apiClient } from '@/lib/api-client';
import { safeParse } from '@/lib/safe-parse';
import { SingleResponseSchema } from '@/types/api.types';

export const MasterDataEntityTypeSchema = z.enum(['contact', 'product', 'bankAccount']);
export const MasterDataSuggestionSchema = z.object({
  field: z.enum(['taxNumber', 'email', 'phone', 'code', 'name', 'taxOffice', 'address', 'city', 'country', 'iban', 'bankName', 'currencyCode']),
  value: z.string(),
  source: z.enum(['normalization', 'tenant-history', 'external-registry', 'generated']),
  sourceLabel: z.string(),
  confidence: z.number().min(0).max(1),
  reason: z.string(),
});
export const MasterDataDuplicateSchema = z.object({
  id: z.string(),
  label: z.string(),
  matchedBy: z.enum(['taxNumber', 'email', 'barcode', 'iban']),
  href: z.string(),
});
export const MasterDataEnrichmentResultSchema = z.object({
  entityType: MasterDataEntityTypeSchema,
  suggestions: z.array(MasterDataSuggestionSchema),
  duplicates: z.array(MasterDataDuplicateSchema),
  warnings: z.array(z.string()),
  generatedAt: z.string(),
});

export type MasterDataEntityType = z.infer<typeof MasterDataEntityTypeSchema>;
export type MasterDataSuggestion = z.infer<typeof MasterDataSuggestionSchema>;
export type MasterDataEnrichmentResult = z.infer<typeof MasterDataEnrichmentResultSchema>;
export interface MasterDataEnrichmentInput {
  entityType: MasterDataEntityType;
  taxNumber?: string;
  email?: string;
  phone?: string;
  barcode?: string;
  iban?: string;
  name?: string;
}

export async function previewMasterData(input: MasterDataEnrichmentInput): Promise<MasterDataEnrichmentResult> {
  const response = await apiClient.post(`/api/master-data-enrichment/${input.entityType}/preview`, input);
  return safeParse(SingleResponseSchema(MasterDataEnrichmentResultSchema), response.data, 'previewMasterData').data;
}
