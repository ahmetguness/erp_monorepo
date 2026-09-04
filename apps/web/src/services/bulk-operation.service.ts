import { z } from 'zod';
import { apiClient } from '@/lib/api-client';
import { safeParse } from '@/lib/safe-parse';
import { SingleResponseSchema } from '@/types/api.types';

export const BulkOperationTargetSchema = z.enum(['contacts', 'products', 'invoices']);
export const BulkOperationValueSchema = z.union([z.string(), z.number(), z.boolean(), z.null()]);

export const BulkOperationChangeSchema = z.object({
  id: z.string(),
  label: z.string(),
  field: z.string(),
  oldValue: BulkOperationValueSchema,
  newValue: BulkOperationValueSchema,
  changed: z.boolean(),
});

export const BulkRollbackStrategySchema = z.object({
  type: z.enum(['audit_snapshot', 'not_required']),
  available: z.boolean(),
  label: z.string(),
  description: z.string(),
  auditLogId: z.string().nullable(),
});

export const BulkOperationResultSchema = z.object({
  batchId: z.string(),
  target: BulkOperationTargetSchema,
  mode: z.enum(['preview', 'execute']),
  dryRun: z.boolean().default(false),
  field: z.string(),
  totalRequested: z.coerce.number(),
  matched: z.coerce.number(),
  changed: z.coerce.number(),
  skipped: z.coerce.number(),
  missingIds: z.array(z.string()),
  changes: z.array(BulkOperationChangeSchema),
  rollbackLogId: z.string().nullable(),
  auditLogId: z.string().nullable().default(null),
  auditHref: z.string().nullable().default(null),
  rollbackStrategy: BulkRollbackStrategySchema.default({
    type: 'not_required',
    available: false,
    label: 'Geri alma gerekmiyor',
    description: 'Degisecek kayıt yok.',
    auditLogId: null,
  }),
});

export type BulkOperationTarget = z.infer<typeof BulkOperationTargetSchema>;
export type BulkOperationValue = z.infer<typeof BulkOperationValueSchema>;
export type BulkOperationChange = z.infer<typeof BulkOperationChangeSchema>;
export type BulkRollbackStrategy = z.infer<typeof BulkRollbackStrategySchema>;
export type BulkOperationResult = z.infer<typeof BulkOperationResultSchema>;

export interface BulkOperationPayload {
  ids: string[];
  field: string;
  value: BulkOperationValue;
}

export const ImportCellSchema = z.union([z.string(), z.number(), z.boolean(), z.null()]);
export const ImportRowSchema = z.record(z.string(), ImportCellSchema);
export const ColumnMappingSchema = z.object({ source: z.string(), target: z.string(), confidence: z.number(), learned: z.boolean() });
export const MappingProfileSchema = z.object({ id: z.string(), name: z.string(), target: BulkOperationTargetSchema, fingerprint: z.string(), mappings: z.array(ColumnMappingSchema), updatedAt: z.string() });
export const ImportIssueSchema = z.object({ row: z.number(), column: z.string().nullable(), severity: z.enum(['auto_fixed', 'review_required']), code: z.enum(['NORMALIZED_VALUE', 'POSSIBLE_DUPLICATE', 'UNMAPPED_COLUMN']), message: z.string() });
export const ImportAnalysisSchema = z.object({
  fingerprint: z.string(), profile: MappingProfileSchema.nullable(), mappings: z.array(ColumnMappingSchema), normalizedRows: z.array(ImportRowSchema), issues: z.array(ImportIssueSchema),
  summary: z.object({ totalRows: z.number(), autoFixed: z.number(), reviewRequired: z.number(), duplicateCandidates: z.number(), unchangedRows: z.number() }),
  execution: z.object({ strategy: z.literal('background_resumable'), chunkSize: z.number(), deltaImport: z.boolean(), resumeSupported: z.boolean(), status: z.literal('planning_only') }),
});
export type ImportRow = z.infer<typeof ImportRowSchema>;
export type ImportCell = z.infer<typeof ImportCellSchema>;
export type ColumnMapping = z.infer<typeof ColumnMappingSchema>;
export type MappingProfile = z.infer<typeof MappingProfileSchema>;
export type ImportAnalysis = z.infer<typeof ImportAnalysisSchema>;

export interface AnalyzeImportPayload { target: BulkOperationTarget; headers: string[]; rows: ImportRow[] }
export interface SaveMappingProfilePayload { name: string; target: BulkOperationTarget; headers: string[]; mappings: ColumnMapping[] }

export async function analyzeBulkImport(payload: AnalyzeImportPayload): Promise<ImportAnalysis> {
  const res = await apiClient.post('/api/bulk-operations/imports/analyze', payload);
  return safeParse(SingleResponseSchema(ImportAnalysisSchema), res.data, 'analyzeBulkImport').data;
}

export async function listMappingProfiles(): Promise<MappingProfile[]> {
  const res = await apiClient.get('/api/bulk-operations/imports/profiles');
  return safeParse(z.object({ data: z.array(MappingProfileSchema) }), res.data, 'listMappingProfiles').data;
}

export async function saveMappingProfile(payload: SaveMappingProfilePayload): Promise<MappingProfile> {
  const res = await apiClient.post('/api/bulk-operations/imports/profiles', payload);
  return safeParse(SingleResponseSchema(MappingProfileSchema), res.data, 'saveMappingProfile').data;
}

export async function previewBulkOperation(
  target: BulkOperationTarget,
  payload: BulkOperationPayload,
): Promise<BulkOperationResult> {
  const res = await apiClient.post(`/api/bulk-operations/${target}/preview`, payload);
  return safeParse(SingleResponseSchema(BulkOperationResultSchema), res.data, 'previewBulkOperation').data;
}

export async function executeBulkOperation(
  target: BulkOperationTarget,
  payload: BulkOperationPayload,
): Promise<BulkOperationResult> {
  const res = await apiClient.post(`/api/bulk-operations/${target}/execute`, payload);
  return safeParse(SingleResponseSchema(BulkOperationResultSchema), res.data, 'executeBulkOperation').data;
}
