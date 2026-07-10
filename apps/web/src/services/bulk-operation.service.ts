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
    description: 'Degisecek kayit yok.',
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
