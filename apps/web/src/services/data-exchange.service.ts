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

export const DuplicateResolutionSuggestionSchema = z.object({
  rowNumber: z.coerce.number(),
  field: z.string(),
  value: z.string(),
  action: z.enum(['skip', 'update_existing', 'create_new', 'merge_later']),
  reason: z.string(),
});

export const ImportPreviewSchema = z.object({
  entity: DataExchangeEntitySchema,
  headers: z.array(z.string()),
  rows: z.array(ImportPreviewRowSchema),
  errors: z.array(z.string()),
  validRows: z.coerce.number(),
  invalidRows: z.coerce.number(),
  duplicateSuggestions: z.array(DuplicateResolutionSuggestionSchema).default([]),
  batchPlan: ImportBatchPlanSchema,
});

export type ImportPreview = z.infer<typeof ImportPreviewSchema>;
export type DuplicateResolutionSuggestion = z.infer<typeof DuplicateResolutionSuggestionSchema>;

export const ImportBatchHistoryItemSchema = z.object({
  batchId: z.string(),
  entity: DataExchangeEntitySchema,
  status: z.enum(['PREVIEWED', 'PARTIAL_READY', 'READY', 'BLOCKED', 'ROLLED_BACK']),
  totalRows: z.coerce.number(),
  validRows: z.coerce.number(),
  invalidRows: z.coerce.number(),
  partialImport: z.boolean(),
  mapping: z.record(z.string(), z.string()),
  rowErrors: z.array(z.object({
    rowNumber: z.coerce.number(),
    errors: z.array(z.string()),
    warnings: z.array(z.string()),
  })),
  duplicateSuggestions: z.array(DuplicateResolutionSuggestionSchema),
  createdById: z.string(),
  createdAt: z.string(),
  rolledBackAt: z.string().nullable(),
  rollbackNote: z.string(),
});

export type ImportBatchHistoryItem = z.infer<typeof ImportBatchHistoryItemSchema>;

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

export const DataQualityTaskResultSchema = z.object({
  taskId: z.string(),
  issueKey: z.string(),
  assignedToId: z.string().nullable(),
});

export type DataQualityTaskResult = z.infer<typeof DataQualityTaskResultSchema>;

export const EdiB2BDirectionSchema = z.enum(['inbound', 'outbound']);
export const EdiB2BDocumentTypeSchema = z.enum(['sales_order', 'purchase_order', 'delivery_note', 'invoice']);
export const EdiB2BExchangeStatusSchema = z.enum(['ready', 'draft', 'in_progress', 'completed', 'blocked']);
export const EdiB2BMappingStatusSchema = z.enum(['complete', 'partial', 'missing']);
export const EdiB2BSlaStatusSchema = z.enum(['ok', 'warning', 'breached']);

export const EdiB2BSummarySchema = z.object({
  partnerCount: z.coerce.number(),
  readyDocumentCount: z.coerce.number(),
  blockedDocumentCount: z.coerce.number(),
  inboundOrderCount: z.coerce.number(),
  outboundDeliveryCount: z.coerce.number(),
  outboundInvoiceCount: z.coerce.number(),
  issueCount: z.coerce.number(),
});

export const EdiB2BPartnerSchema = z.object({
  contactId: z.string(),
  code: z.string().nullable(),
  name: z.string(),
  type: z.enum(['CUSTOMER', 'SUPPLIER', 'BOTH']),
  directions: z.array(EdiB2BDirectionSchema),
  status: z.enum(['active', 'needs_mapping']),
  documentCount: z.coerce.number(),
  totalValue: z.coerce.number(),
  lastActivityAt: z.string().nullable(),
  issues: z.array(z.string()),
});

export const EdiB2BDocumentFlowSchema = z.object({
  key: EdiB2BDocumentTypeSchema,
  title: z.string(),
  direction: EdiB2BDirectionSchema,
  scope: z.string(),
  endpoint: z.string(),
  format: z.enum(['JSON', 'CSV']),
  status: z.enum(['configured', 'needs_mapping']),
  readyCount: z.coerce.number(),
  blockedCount: z.coerce.number(),
  note: z.string(),
});

export const EdiB2BExchangeItemSchema = z.object({
  id: z.string(),
  itemKey: z.string(),
  number: z.string(),
  documentType: EdiB2BDocumentTypeSchema,
  direction: EdiB2BDirectionSchema,
  partnerName: z.string(),
  partnerCode: z.string().nullable(),
  status: EdiB2BExchangeStatusSchema,
  amount: z.coerce.number().nullable(),
  documentDate: z.string(),
  href: z.string(),
  issueKeys: z.array(z.string()),
  retryEligible: z.boolean(),
  retryAction: z.string(),
  slaStatus: EdiB2BSlaStatusSchema,
  slaDueAt: z.string(),
  slaRemainingMinutes: z.coerce.number(),
});

export const EdiB2BPartnerMappingSchema = z.object({
  contactId: z.string(),
  partnerName: z.string(),
  partnerCode: z.string().nullable(),
  mappingStatus: EdiB2BMappingStatusSchema,
  mappedFieldCount: z.coerce.number(),
  requiredFieldCount: z.coerce.number(),
  missingFields: z.array(z.string()),
  supportedDocumentTypes: z.array(EdiB2BDocumentTypeSchema),
  lastValidatedAt: z.string().nullable(),
});

export const EdiB2BErrorQueueItemSchema = z.object({
  itemKey: z.string(),
  documentNumber: z.string(),
  documentType: EdiB2BDocumentTypeSchema,
  partnerName: z.string(),
  status: EdiB2BExchangeStatusSchema,
  severity: z.enum(['high', 'medium']),
  issues: z.array(z.string()),
  retryEligible: z.boolean(),
  retryAction: z.string(),
  href: z.string(),
});

export const EdiB2BSlaSummarySchema = z.object({
  trackedCount: z.coerce.number(),
  breachedCount: z.coerce.number(),
  warningCount: z.coerce.number(),
  okCount: z.coerce.number(),
  averageAgeHours: z.coerce.number(),
});

export const EdiB2BEndpointExampleSchema = z.object({
  method: z.enum(['GET', 'POST']),
  path: z.string(),
  scope: z.string(),
  description: z.string(),
});

export const EdiB2BHubSchema = z.object({
  generatedAt: z.string(),
  summary: EdiB2BSummarySchema,
  partners: z.array(EdiB2BPartnerSchema),
  partnerMappings: z.array(EdiB2BPartnerMappingSchema),
  documentFlows: z.array(EdiB2BDocumentFlowSchema),
  exchangeQueue: z.array(EdiB2BExchangeItemSchema),
  errorQueue: z.array(EdiB2BErrorQueueItemSchema),
  sla: EdiB2BSlaSummarySchema,
  endpointExamples: z.array(EdiB2BEndpointExampleSchema),
});

export type EdiB2BHub = z.infer<typeof EdiB2BHubSchema>;
export type EdiB2BExchangeStatus = z.infer<typeof EdiB2BExchangeStatusSchema>;
export type EdiB2BSlaStatus = z.infer<typeof EdiB2BSlaStatusSchema>;

export const EdiB2BRetryTaskResultSchema = z.object({
  taskId: z.string(),
  itemKey: z.string(),
  assignedToId: z.string().nullable(),
});

export type EdiB2BRetryTaskResult = z.infer<typeof EdiB2BRetryTaskResultSchema>;

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

export async function getImportBatches(): Promise<ImportBatchHistoryItem[]> {
  const res = await apiClient.get('/api/data-exchange/import/batches');
  return safeParse(SingleResponseSchema(z.array(ImportBatchHistoryItemSchema)), res.data, 'getImportBatches').data;
}

export async function rollbackImportBatch(batchId: string): Promise<ImportBatchHistoryItem> {
  const res = await apiClient.post(`/api/data-exchange/import/batches/${batchId}/rollback`);
  return safeParse(SingleResponseSchema(ImportBatchHistoryItemSchema), res.data, 'rollbackImportBatch').data;
}

export async function getDataQualitySummary(): Promise<DataQualitySummary> {
  const res = await apiClient.get('/api/data-exchange/quality');
  return safeParse(SingleResponseSchema(DataQualitySummarySchema), res.data, 'getDataQualitySummary').data;
}

export async function createDataQualityTask(issueKey: string): Promise<DataQualityTaskResult> {
  const res = await apiClient.post(`/api/data-exchange/quality/${encodeURIComponent(issueKey)}/task`);
  return safeParse(SingleResponseSchema(DataQualityTaskResultSchema), res.data, 'createDataQualityTask').data;
}

export async function getEdiB2BHub(): Promise<EdiB2BHub> {
  const res = await apiClient.get('/api/data-exchange/b2b');
  return safeParse(SingleResponseSchema(EdiB2BHubSchema), res.data, 'getEdiB2BHub').data;
}

export async function createEdiB2BRetryTask(itemKey: string): Promise<EdiB2BRetryTaskResult> {
  const res = await apiClient.post('/api/data-exchange/b2b/retry', { itemKey });
  return safeParse(SingleResponseSchema(EdiB2BRetryTaskResultSchema), res.data, 'createEdiB2BRetryTask').data;
}

export async function downloadTemplate(entity: DataExchangeEntity): Promise<Blob> {
  const res = await apiClient.get<Blob>(`/api/data-exchange/templates/${entity}`, { responseType: 'blob' });
  return res.data;
}

export async function exportData(entity: DataExchangeEntity): Promise<Blob> {
  const res = await apiClient.get<Blob>(`/api/data-exchange/export/${entity}`, { responseType: 'blob' });
  return res.data;
}
