import { z } from 'zod';
import { apiClient } from '@/lib/api-client';
import { safeParse } from '@/lib/safe-parse';
import { SingleResponseSchema } from '@/types/api.types';

export const AttachmentSchema = z.object({
  id: z.string(), tenantId: z.string(),
  entityType: z.string(), entityId: z.string(),
  fileName: z.string(), storagePath: z.string(),
  mimeType: z.string().nullable(), fileSize: z.coerce.number().nullable(),
  uploadedById: z.string().nullable(), createdAt: z.string(),
});

export type Attachment = z.infer<typeof AttachmentSchema>;

export async function getAttachments(entityType: string, entityId: string): Promise<Attachment[]> {
  const res = await apiClient.get('/api/attachments', { params: { entityType, entityId } });
  return safeParse(SingleResponseSchema(z.array(AttachmentSchema)), res.data, 'getAttachments').data;
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
