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
});

export const ImportPreviewSchema = z.object({
  entity: DataExchangeEntitySchema,
  headers: z.array(z.string()),
  rows: z.array(ImportPreviewRowSchema),
  errors: z.array(z.string()),
  validRows: z.coerce.number(),
  invalidRows: z.coerce.number(),
});

export type ImportPreview = z.infer<typeof ImportPreviewSchema>;

export async function previewImport(entity: DataExchangeEntity, csv: string): Promise<ImportPreview> {
  const res = await apiClient.post(`/api/data-exchange/import/preview/${entity}`, { csv });
  return safeParse(SingleResponseSchema(ImportPreviewSchema), res.data, 'previewImport').data;
}

export async function downloadTemplate(entity: DataExchangeEntity): Promise<Blob> {
  const res = await apiClient.get<Blob>(`/api/data-exchange/templates/${entity}`, { responseType: 'blob' });
  return res.data;
}

export async function exportData(entity: DataExchangeEntity): Promise<Blob> {
  const res = await apiClient.get<Blob>(`/api/data-exchange/export/${entity}`, { responseType: 'blob' });
  return res.data;
}
