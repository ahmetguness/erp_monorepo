import { z } from 'zod';
import { apiClient } from '@/lib/api-client';
import { safeParse } from '@/lib/safe-parse';
import { PaginatedResponseSchema, SingleResponseSchema } from '@/types/api.types';

export const AttachmentSchema = z.object({
  id: z.string(), tenantId: z.string(),
  entityType: z.string(), entityId: z.string(),
  fileName: z.string(), storagePath: z.string(),
  mimeType: z.string().nullable(), fileSize: z.coerce.number().nullable(),
  category: z.string().nullable().optional(),
  tags: z.array(z.string()).optional(),
  documentKind: z.string().nullable().optional(),
  confidentiality: z.string().nullable().optional(),
  validFrom: z.string().nullable().optional(),
  validUntil: z.string().nullable().optional(),
  version: z.coerce.number().optional(),
  uploadedById: z.string().nullable(), createdAt: z.string(),
});

export type Attachment = z.infer<typeof AttachmentSchema>;

export const DocumentCenterItemSchema = z.object({
  id: z.string(),
  source: z.enum(['ATTACHMENT', 'MAIL']),
  category: z.enum(['CUSTOMER', 'EMPLOYEE', 'SALES', 'PURCHASING', 'SERVICE', 'INVENTORY', 'CONTRACT', 'MAIL', 'OTHER']),
  fileName: z.string(),
  mimeType: z.string().nullable(),
  fileSize: z.coerce.number().nullable(),
  createdAt: z.string(),
  uploadedById: z.string().nullable(),
  uploadedByLabel: z.string().nullable(),
  entityType: z.union([
    z.enum(['INVOICE', 'PRODUCT', 'CATEGORY', 'CONTACT', 'EMPLOYEE', 'CUSTOMER_ASSET', 'SERVICE_REQUEST', 'PURCHASE_ORDER', 'SALES_QUOTE', 'SALES_ORDER', 'WORK_ORDER', 'DELIVERY_NOTE', 'OTHER']),
    z.literal('MAIL'),
  ]),
  entityId: z.string(),
  entityLabel: z.string().nullable(),
  href: z.string().nullable(),
  downloadUrl: z.string().nullable(),
  tags: z.array(z.string()),
  documentKind: z.enum(['GENERAL', 'EMPLOYEE_DOCUMENT', 'CONTRACT']).nullable(),
  confidentiality: z.enum(['PUBLIC', 'INTERNAL', 'CONFIDENTIAL']).nullable(),
  validFrom: z.string().nullable(),
  validUntil: z.string().nullable(),
  version: z.coerce.number().nullable(),
  isExpired: z.boolean(),
  expiresSoon: z.boolean(),
});

export const AttachmentEntityOptionSchema = z.object({
  id: z.string(),
  label: z.string(),
  detail: z.string().nullable(),
});

export const DocumentCenterSummarySchema = z.object({
  totalDocuments: z.coerce.number(),
  attachmentCount: z.coerce.number(),
  mailAttachmentCount: z.coerce.number(),
  totalSizeBytes: z.coerce.number(),
});

const DocumentCenterResponseSchema = PaginatedResponseSchema(DocumentCenterItemSchema).extend({
  meta: PaginatedResponseSchema(DocumentCenterItemSchema).shape.meta.extend({
    summary: DocumentCenterSummarySchema,
  }),
});

export type DocumentCenterItem = z.infer<typeof DocumentCenterItemSchema>;
export type DocumentCenterCategory = DocumentCenterItem['category'];
export type DocumentCenterSource = DocumentCenterItem['source'];
export type DocumentKind = NonNullable<DocumentCenterItem['documentKind']>;
export type DocumentConfidentiality = NonNullable<DocumentCenterItem['confidentiality']>;
export type AttachmentEntityType = Exclude<DocumentCenterItem['entityType'], 'MAIL'>;
export type AttachmentEntityOption = z.infer<typeof AttachmentEntityOptionSchema>;
export type DocumentCenterResponse = z.infer<typeof DocumentCenterResponseSchema>;

export interface DocumentCenterParams {
  page?: number;
  limit?: number;
  search?: string;
  category?: DocumentCenterCategory;
  source?: DocumentCenterSource;
  entityType?: AttachmentEntityType;
}

export interface AttachmentMetadataInput {
  category?: DocumentCenterCategory | null;
  tags?: string[];
  documentKind?: DocumentKind | null;
  confidentiality?: DocumentConfidentiality | null;
  validFrom?: string | null;
  validUntil?: string | null;
  version?: number;
}

export async function getAttachments(entityType: string, entityId: string): Promise<Attachment[]> {
  const res = await apiClient.get('/api/attachments', { params: { entityType, entityId } });
  return safeParse(SingleResponseSchema(z.array(AttachmentSchema)), res.data, 'getAttachments').data;
}

export async function getDocumentCenter(params: DocumentCenterParams): Promise<DocumentCenterResponse> {
  const res = await apiClient.get('/api/attachments/library', { params });
  return safeParse(DocumentCenterResponseSchema, res.data, 'getDocumentCenter');
}

export async function getAttachmentEntityOptions(entityType: AttachmentEntityType, search?: string): Promise<AttachmentEntityOption[]> {
  const res = await apiClient.get('/api/attachments/entity-options', { params: { entityType, search } });
  return safeParse(SingleResponseSchema(z.array(AttachmentEntityOptionSchema)), res.data, 'getAttachmentEntityOptions').data;
}

export async function uploadAttachment(entityType: string, entityId: string, file: File, metadata?: AttachmentMetadataInput): Promise<Attachment> {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('entityType', entityType);
  formData.append('entityId', entityId);
  if (metadata?.category) formData.append('category', metadata.category);
  if (metadata?.tags?.length) formData.append('tags', metadata.tags.join(','));
  if (metadata?.documentKind) formData.append('documentKind', metadata.documentKind);
  if (metadata?.confidentiality) formData.append('confidentiality', metadata.confidentiality);
  if (metadata?.validFrom) formData.append('validFrom', metadata.validFrom);
  if (metadata?.validUntil) formData.append('validUntil', metadata.validUntil);
  if (metadata?.version) formData.append('version', String(metadata.version));
  const res = await apiClient.post('/api/attachments/upload', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return safeParse(SingleResponseSchema(AttachmentSchema), res.data, 'uploadAttachment').data;
}

export async function downloadAttachment(id: string): Promise<Blob> {
  const res = await apiClient.get(`/api/attachments/${id}/download`, { responseType: 'blob' });
  return res.data instanceof Blob ? res.data : new Blob([res.data]);
}

export async function deleteAttachment(id: string): Promise<void> {
  await apiClient.delete(`/api/attachments/${id}`);
}

export async function renameAttachment(id: string, fileName: string): Promise<Attachment> {
  const res = await apiClient.patch(`/api/attachments/${id}`, { fileName });
  return safeParse(SingleResponseSchema(AttachmentSchema), res.data, 'renameAttachment').data;
}

export async function updateAttachmentMetadata(id: string, input: AttachmentMetadataInput & { fileName?: string }): Promise<Attachment> {
  const res = await apiClient.patch(`/api/attachments/${id}`, input);
  return safeParse(SingleResponseSchema(AttachmentSchema), res.data, 'updateAttachmentMetadata').data;
}
