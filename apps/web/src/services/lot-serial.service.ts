import { z } from 'zod';
import { apiClient } from '@/lib/api-client';
import { safeParse } from '@/lib/safe-parse';
import { SingleResponseSchema, PaginatedResponseSchema } from '@/types/api.types';
import type { PaginationParams } from '@/types/api.types';

const ProductRef = z.object({ id: z.string(), code: z.string(), name: z.string() });
const BatchRef = z.object({ id: z.string(), batchNumber: z.string() });

export const LotSerialSchema = z.object({
  id: z.string(), tenantId: z.string(), productId: z.string(), batchId: z.string().nullable(),
  serialNumber: z.string(), isUsed: z.boolean(),
  usedAt: z.string().nullable(), usedRefType: z.string().nullable(), usedRefId: z.string().nullable(),
  createdAt: z.string(),
  product: ProductRef.optional(), batch: BatchRef.optional().nullable(),
});

export const TraceabilityReportItemSchema = z.object({
  id: z.string(),
  sourceType: z.enum([
    'LOT_SERIAL',
    'PRODUCT_BATCH',
    'STOCK_MOVEMENT',
    'DELIVERY_NOTE',
    'SALES_ORDER',
    'PURCHASE_ORDER',
    'INVOICE',
    'WORK_ORDER',
    'SERVICE_REQUEST',
    'OTHER',
  ]),
  sourceId: z.string(),
  sourceNumber: z.string().nullable(),
  sourceLabel: z.string(),
  date: z.string().nullable(),
  productId: z.string(),
  productCode: z.string(),
  productName: z.string(),
  serialNumber: z.string().nullable(),
  batchNumber: z.string().nullable(),
  quantity: z.coerce.number().nullable(),
  direction: z.enum(['IN', 'OUT', 'NEUTRAL']),
  detail: z.string().nullable(),
});

export const TraceabilityReportSchema = z.object({
  generatedAt: z.string(),
  filters: z.object({
    lotId: z.string().optional(),
    batchId: z.string().optional(),
    productId: z.string().optional(),
  }),
  summary: z.object({
    lotCount: z.coerce.number(),
    batchCount: z.coerce.number(),
    movementCount: z.coerce.number(),
    deliveryCount: z.coerce.number(),
    invoiceCount: z.coerce.number(),
    serviceCount: z.coerce.number(),
  }),
  items: z.array(TraceabilityReportItemSchema),
});

export type LotSerial = z.infer<typeof LotSerialSchema>;
export type TraceabilityReport = z.infer<typeof TraceabilityReportSchema>;
export type TraceabilityReportItem = z.infer<typeof TraceabilityReportItemSchema>;

export interface CreateLotSerialDTO { productId: string; batchId?: string; serialNumber: string }

export interface ListParams extends PaginationParams { productId?: string; batchId?: string; isUsed?: string }
export interface TraceabilityParams { lotId?: string; batchId?: string; productId?: string }

export async function getLotSerials(params: ListParams) {
  const res = await apiClient.get('/api/lot-serials', { params });
  return safeParse(PaginatedResponseSchema(LotSerialSchema), res.data, 'getLotSerials');
}

export async function createLotSerial(data: CreateLotSerialDTO): Promise<LotSerial> {
  const res = await apiClient.post('/api/lot-serials', data);
  return safeParse(SingleResponseSchema(LotSerialSchema), res.data, 'createLotSerial').data;
}

export async function assignLotToMovement(id: string, usedRefType: string, usedRefId: string): Promise<LotSerial> {
  const res = await apiClient.post(`/api/lot-serials/${id}/assign`, { usedRefType, usedRefId });
  return safeParse(SingleResponseSchema(LotSerialSchema), res.data, 'assignLotToMovement').data;
}

export async function getLotSerialTraceability(params: TraceabilityParams): Promise<TraceabilityReport> {
  const res = await apiClient.get('/api/lot-serials/traceability', { params });
  return safeParse(SingleResponseSchema(TraceabilityReportSchema), res.data, 'getLotSerialTraceability').data;
}
