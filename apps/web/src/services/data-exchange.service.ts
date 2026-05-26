import { z } from 'zod';
import { apiClient } from '@/lib/api-client';
import { safeParse } from '@/lib/safe-parse';
import { SingleResponseSchema } from '@/types/api.types';

export const DataExchangeEntitySchema = z.enum(['products', 'contacts', 'stock', 'invoices']);
export type DataExchangeEntity = z.infer<typeof DataExchangeEntitySchema>;

export const ImportPreviewRowSchema = z.object({
  rowNumber: z.coerce.number(),
  values: z.record(z.string(), z.string()),
  valid: z.boolean(),
  errors: z.array(z.string()),
  warnings: z.array(z.string()),
});

export const ImportBatchPlanSchema = z.object({
  batchId: z.string(),
  mapping: z.record(z.string(), z.string()),
  partialImport: z.boolean(),
  canImportValidRows: z.boolean(),
  rollbackAvailable: z.boolean(),
  rollbackNote: z.string(),
});

export const ImportPreviewSchema = z.object({
  entity: DataExchangeEntitySchema,
  headers: z.array(z.string()),
  rows: z.array(ImportPreviewRowSchema),
  errors: z.array(z.string()),
  validRows: z.coerce.number(),
  invalidRows: z.coerce.number(),
  batchPlan: ImportBatchPlanSchema,
});

export type ImportPreview = z.infer<typeof ImportPreviewSchema>;

export const DataQualitySeveritySchema = z.enum(['critical', 'high', 'medium', 'low']);
export const DataQualityCategorySchema = z.enum(['contacts', 'inventory', 'hr', 'sales']);

export const DataQualityIssueSchema = z.object({
  key: z.string(),
  category: DataQualityCategorySchema,
  severity: DataQualitySeveritySchema,
  title: z.string(),
  description: z.string(),
  count: z.coerce.number(),
  scoreImpact: z.coerce.number(),
  actionLabel: z.string(),
  href: z.string(),
  sampleRecords: z.array(z.object({
    id: z.string(),
    label: z.string(),
    detail: z.string(),
  })),
});

export const DataQualitySummarySchema = z.object({
  score: z.coerce.number(),
  issueCount: z.coerce.number(),
  criticalCount: z.coerce.number(),
  generatedAt: z.string(),
  issues: z.array(DataQualityIssueSchema),
});

export type DataQualitySummary = z.infer<typeof DataQualitySummarySchema>;

export interface ImportPreviewInput {
  entity: DataExchangeEntity;
  csv: string;
  mapping?: Partial<Record<string, string>>;
  partialImport?: boolean;
}

export async function previewImport(input: ImportPreviewInput): Promise<ImportPreview> {
  const res = await apiClient.post(`/api/data-exchange/import/preview/${input.entity}`, {
    csv: input.csv,
    mapping: input.mapping ?? {},
    partialImport: input.partialImport ?? false,
  });
  return safeParse(SingleResponseSchema(ImportPreviewSchema), res.data, 'previewImport').data;
}

export async function getDataQualitySummary(): Promise<DataQualitySummary> {
  const res = await apiClient.get('/api/data-exchange/quality');
  return safeParse(SingleResponseSchema(DataQualitySummarySchema), res.data, 'getDataQualitySummary').data;
}

export async function downloadTemplate(entity: DataExchangeEntity): Promise<Blob> {
  const res = await apiClient.get<Blob>(`/api/data-exchange/templates/${entity}`, { responseType: 'blob' });
  return res.data;
}

export async function exportData(entity: DataExchangeEntity): Promise<Blob> {
  const res = await apiClient.get<Blob>(`/api/data-exchange/export/${entity}`, { responseType: 'blob' });
  return res.data;
}
