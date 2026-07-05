import { z } from 'zod';
import { apiClient } from '@/lib/api-client';
import { safeParse } from '@/lib/safe-parse';
import { SingleResponseSchema, PaginatedResponseSchema } from '@/types/api.types';
import type { PaginationParams } from '@/types/api.types';

const InvoiceRef = z.object({ id: z.string(), number: z.string(), type: z.string().optional(), status: z.string().optional() });
const DNRef = z.object({ id: z.string(), number: z.string(), type: z.string().optional(), status: z.string().optional() });

export const EDocumentSchema = z.object({
  id: z.string(), tenantId: z.string(),
  invoiceId: z.string().nullable(), deliveryNoteId: z.string().nullable(),
  type: z.enum(['E_INVOICE', 'E_ARCHIVE', 'E_WAYBILL']),
  status: z.enum(['PENDING', 'PROCESSING', 'SENT', 'ACCEPTED', 'REJECTED', 'CANCELLED', 'ERROR']),
  uuid: z.string().nullable(), providerCode: z.string().nullable(), providerMessage: z.string().nullable(),
  retryCount: z.coerce.number(), lastRetryAt: z.string().nullable(),
  sentAt: z.string().nullable(), acceptedAt: z.string().nullable(),
  rejectedAt: z.string().nullable(), cancelledAt: z.string().nullable(),
  createdAt: z.string(), updatedAt: z.string(),
  invoice: InvoiceRef.optional().nullable(),
  deliveryNote: DNRef.optional().nullable(),
});

export type EDocument = z.infer<typeof EDocumentSchema>;
export type EDocumentType = EDocument['type'];
export type EDocumentStatus = EDocument['status'];

export const EDocumentSummarySchema = z.object({
  total: z.coerce.number(),
  pending: z.coerce.number(),
  sendingErrors: z.coerce.number(),
  accepted: z.coerce.number(),
  rejected: z.coerce.number(),
  creditBalance: z.coerce.number().nullable(),
  creditStatus: z.enum(['configured', 'not_configured']),
  statusCounts: z.array(z.object({
    status: EDocumentSchema.shape.status,
    count: z.coerce.number(),
  })),
  latestError: z.object({
    id: z.string(),
    status: EDocumentSchema.shape.status,
    providerMessage: z.string().nullable(),
    retryCount: z.coerce.number(),
    createdAt: z.string(),
  }).nullable(),
  generatedAt: z.string(),
});

export type EDocumentSummary = z.infer<typeof EDocumentSummarySchema>;

export interface CreateEDocumentDTO {
  invoiceId?: string; deliveryNoteId?: string;
  type: EDocumentType; uuid?: string; providerCode?: string;
}

export interface ListParams extends PaginationParams { type?: string; status?: string; invoiceId?: string }

export async function getEDocuments(params: ListParams) {
  const res = await apiClient.get('/api/e-documents', { params });
  return safeParse(PaginatedResponseSchema(EDocumentSchema), res.data, 'getEDocuments');
}

export async function getEDocumentSummary(): Promise<EDocumentSummary> {
  const res = await apiClient.get('/api/e-documents/summary');
  return safeParse(SingleResponseSchema(EDocumentSummarySchema), res.data, 'getEDocumentSummary').data;
}

export async function getEDocumentById(id: string): Promise<EDocument> {
  const res = await apiClient.get(`/api/e-documents/${id}`);
  return safeParse(SingleResponseSchema(EDocumentSchema), res.data, 'getEDocumentById').data;
}

export async function createEDocument(data: CreateEDocumentDTO): Promise<EDocument> {
  const res = await apiClient.post('/api/e-documents', data);
  return safeParse(SingleResponseSchema(EDocumentSchema), res.data, 'createEDocument').data;
}

export async function updateEDocumentStatus(id: string, status: EDocumentStatus, providerMessage?: string): Promise<EDocument> {
  const res = await apiClient.patch(`/api/e-documents/${id}/status`, { status, providerMessage });
  return safeParse(SingleResponseSchema(EDocumentSchema), res.data, 'updateEDocumentStatus').data;
}
