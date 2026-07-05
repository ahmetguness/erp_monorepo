import { z } from 'zod';
import { apiClient } from '@/lib/api-client';
import { safeParse } from '@/lib/safe-parse';
import { SingleResponseSchema } from '@/types/api.types';

export const StarterCsvImportEntitySchema = z.enum(['products', 'contacts']);
export type StarterCsvImportEntity = z.infer<typeof StarterCsvImportEntitySchema>;

export const StarterCsvImportPreviewRowSchema = z.object({
  rowNumber: z.coerce.number(),
  values: z.record(z.string(), z.string()),
  normalized: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])).nullable(),
  valid: z.boolean(),
  errors: z.array(z.string()),
  warnings: z.array(z.string()),
});

export const StarterCsvImportSummarySchema = z.object({
  totalRows: z.coerce.number(),
  validRows: z.coerce.number(),
  invalidRows: z.coerce.number(),
  importableRows: z.coerce.number(),
  currentProductCount: z.coerce.number().nullable(),
  maxProducts: z.coerce.number().nullable(),
  remainingSlots: z.coerce.number().nullable(),
});

export const StarterCsvImportChecklistItemSchema = z.object({
  key: z.string(),
  label: z.string(),
  ok: z.boolean(),
  detail: z.string(),
});

export const StarterCsvImportPreviewSchema = z.object({
  entity: StarterCsvImportEntitySchema,
  sourceHeaders: z.array(z.string()),
  targetFields: z.array(z.string()),
  rows: z.array(StarterCsvImportPreviewRowSchema),
  errors: z.array(z.string()),
  checklist: z.array(StarterCsvImportChecklistItemSchema),
  summary: StarterCsvImportSummarySchema,
});

export const StarterCsvImportCommitResultSchema = z.object({
  entity: StarterCsvImportEntitySchema,
  createdCount: z.coerce.number(),
  skippedCount: z.coerce.number(),
  summary: StarterCsvImportSummarySchema,
});

export type StarterCsvImportPreview = z.infer<typeof StarterCsvImportPreviewSchema>;
export type StarterCsvImportPreviewRow = z.infer<typeof StarterCsvImportPreviewRowSchema>;
export type StarterCsvImportCommitResult = z.infer<typeof StarterCsvImportCommitResultSchema>;

export interface StarterCsvImportInput {
  entity: StarterCsvImportEntity;
  csv: string;
  mapping?: Partial<Record<string, string>>;
  partialImport?: boolean;
}

export async function downloadStarterCsvImportTemplate(entity: StarterCsvImportEntity): Promise<Blob> {
  const res = await apiClient.get<Blob>(`/api/starter-import/${entity}/template`, { responseType: 'blob' });
  return res.data;
}

export async function previewStarterCsvImport(input: StarterCsvImportInput): Promise<StarterCsvImportPreview> {
  const res = await apiClient.post(`/api/starter-import/${input.entity}/preview`, {
    csv: input.csv,
    mapping: input.mapping ?? {},
    partialImport: input.partialImport ?? false,
  });
  return safeParse(SingleResponseSchema(StarterCsvImportPreviewSchema), res.data, 'previewStarterCsvImport').data;
}

export async function commitStarterCsvImport(input: StarterCsvImportInput): Promise<StarterCsvImportCommitResult> {
  const res = await apiClient.post(`/api/starter-import/${input.entity}/commit`, {
    csv: input.csv,
    mapping: input.mapping ?? {},
    partialImport: input.partialImport ?? false,
  });
  return safeParse(SingleResponseSchema(StarterCsvImportCommitResultSchema), res.data, 'commitStarterCsvImport').data;
}
