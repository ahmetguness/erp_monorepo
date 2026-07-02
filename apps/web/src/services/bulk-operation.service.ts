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

export const BulkOperationResultSchema = z.object({
  batchId: z.string(),
  target: BulkOperationTargetSchema,
  mode: z.enum(['preview', 'execute']),
  field: z.string(),
  totalRequested: z.coerce.number(),
  matched: z.coerce.number(),
  changed: z.coerce.number(),
  skipped: z.coerce.number(),
  missingIds: z.array(z.string()),
  changes: z.array(BulkOperationChangeSchema),
  rollbackLogId: z.string().nullable(),
});

export type BulkOperationTarget = z.infer<typeof BulkOperationTargetSchema>;
export type BulkOperationValue = z.infer<typeof BulkOperationValueSchema>;
export type BulkOperationChange = z.infer<typeof BulkOperationChangeSchema>;
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
