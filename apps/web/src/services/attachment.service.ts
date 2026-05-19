import { z } from 'zod';
import { apiClient } from '@/lib/api-client';
import { safeParse } from '@/lib/safe-parse';
import { PaginatedResponseSchema, SingleResponseSchema } from '@/types/api.types';

export const AttachmentSchema = z.object({
  id: z.string(), tenantId: z.string(),
  entityType: z.string(), entityId: z.string(),
  fileName: z.string(), storagePath: z.string(),
  mimeType: z.string().nullable(), fileSize: z.coerce.number().nullable(),
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
    z.enum(['INVOICE', 'PRODUCT', 'CATEGORY', 'CONTACT', 'EMPLOYEE', 'CUSTOMER_ASSET', 'SERVICE_REQUEST', 'PURCHASE_ORDER', 'SALES_ORDER', 'WORK_ORDER', 'DELIVERY_NOTE', 'OTHER']),
    z.literal('MAIL'),
  ]),
  entityId: z.string(),
  entityLabel: z.string().nullable(),
  href: z.string().nullable(),
  downloadUrl: z.string().nullable(),
  tags: z.array(z.string()),
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
export type DocumentCenterResponse = z.infer<typeof DocumentCenterResponseSchema>;

export interface DocumentCenterParams {
  page?: number;
  limit?: number;
  search?: string;
  category?: DocumentCenterCategory;
  source?: DocumentCenterSource;
  entityType?: Exclude<DocumentCenterItem['entityType'], 'MAIL'>;
}

export async function getAttachments(entityType: string, entityId: string): Promise<Attachment[]> {
  const res = await apiClient.get('/api/attachments', { params: { entityType, entityId } });
  return safeParse(SingleResponseSchema(z.array(AttachmentSchema)), res.data, 'getAttachments').data;
}

export async function getDocumentCenter(params: DocumentCenterParams): Promise<DocumentCenterResponse> {
  const res = await apiClient.get('/api/attachments/library', { params });
  return safeParse(DocumentCenterResponseSchema, res.data, 'getDocumentCenter');
}

export async function uploadAttachment(entityType: string, entityId: string, file: File): Promise<Attachment> {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('entityType', entityType);
  formData.append('entityId', entityId);
  const res = await apiClient.post('/api/attachments/upload', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return safeParse(SingleResponseSchema(AttachmentSchema), res.data, 'uploadAttachment').data;
}

export async function downloadAttachment(id: string): Promise<Blob> {
  const res = await apiClient.get(`/api/attachments/${id}/download`, { responseType: 'blob' });
  return res.data as Blob;
}

export async function deleteAttachment(id: string): Promise<void> {
  await apiClient.delete(`/api/attachments/${id}`);
}

export async function renameAttachment(id: string, fileName: string): Promise<Attachment> {
  const res = await apiClient.patch(`/api/attachments/${id}`, { fileName });
  return safeParse(SingleResponseSchema(AttachmentSchema), res.data, 'renameAttachment').data;
}
