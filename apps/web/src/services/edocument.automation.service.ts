import { z } from 'zod';
import { apiClient } from '@/lib/api-client';
import { safeParse } from '@/lib/safe-parse';
import { SingleResponseSchema } from '@/types/api.types';

export const EDocumentExceptionItemSchema = z.object({
  id: z.string(),
  type: z.string(),
  status: z.string(),
  uuid: z.string().nullable(),
  providerCode: z.string().nullable(),
  providerMessage: z.string().nullable(),
  retryCount: z.number(),
  lastRetryAt: z.string().nullable(),
  createdAt: z.string(),
  invoice: z
    .object({
      id: z.string(),
      number: z.string(),
      contactName: z.string().optional(),
      totalGross: z.number().optional(),
    })
    .nullable(),
  deliveryNote: z
    .object({
      id: z.string(),
      number: z.string(),
    })
    .nullable(),
});

export type EDocumentExceptionItem = z.infer<typeof EDocumentExceptionItemSchema>;

export async function getEDocumentExceptions(): Promise<EDocumentExceptionItem[]> {
  const res = await apiClient.get('/api/e-documents/exceptions');
  return safeParse(SingleResponseSchema(z.array(EDocumentExceptionItemSchema)), res.data, 'getEDocumentExceptions').data;
}

export async function retryEDocument(id: string): Promise<{ id: string; status: string }> {
  const res = await apiClient.post(`/api/e-documents/exceptions/${encodeURIComponent(id)}/retry`);
  return res.data.data;
}
