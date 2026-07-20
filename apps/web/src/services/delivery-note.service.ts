import { z } from 'zod';
import { apiClient } from '@/lib/api-client';
import { safeParse } from '@/lib/safe-parse';
import { SingleResponseSchema, PaginatedResponseSchema } from '@/types/api.types';
import type { PaginationParams, DateRangeParams } from '@/types/api.types';

const ContactRef = z.object({ id: z.string(), name: z.string() });
const WarehouseRef = z.object({ id: z.string(), name: z.string(), code: z.string().optional() });
const OrderRef = z.object({ id: z.string(), number: z.string() });
const ProductRef = z.object({ id: z.string(), code: z.string(), name: z.string() });

export const DeliveryNoteItemSchema = z.object({
  id: z.string(), tenantId: z.string(), deliveryNoteId: z.string(),
  productId: z.string(), description: z.string().nullable(),
  orderedQty: z.coerce.number(), deliveredQty: z.coerce.number(),
  locationId: z.string().nullable(), lotId: z.string().nullable(), batchId: z.string().nullable(),
  sortOrder: z.coerce.number(),
  product: ProductRef.optional(),
});

export const DeliveryNoteSchema = z.object({
  id: z.string(), tenantId: z.string(), number: z.string(),
  type: z.enum(['OUTBOUND', 'INBOUND', 'RETURN']),
  status: z.enum(['DRAFT', 'CONFIRMED', 'PARTIALLY_SHIPPED', 'SHIPPED', 'DELIVERED', 'CANCELLED']),
  date: z.string(), trackingNumber: z.string().nullable(), carrier: z.string().nullable(),
  notes: z.string().nullable(),
  salesOrderId: z.string().nullable(), purchaseOrderId: z.string().nullable(),
  contactId: z.string().nullable(), warehouseId: z.string(),
  shippedAt: z.string().nullable(), deliveredAt: z.string().nullable(),
  createdAt: z.string(), updatedAt: z.string(),
  contact: ContactRef.optional().nullable(),
  warehouse: WarehouseRef.optional(),
  salesOrder: OrderRef.optional().nullable(),
  purchaseOrder: OrderRef.optional().nullable(),
  items: z.array(DeliveryNoteItemSchema).optional(),
  _count: z.object({ items: z.coerce.number() }).optional(),
});

export type DeliveryNote = z.infer<typeof DeliveryNoteSchema>;
export type DeliveryNoteItem = z.infer<typeof DeliveryNoteItemSchema>;
export type DeliveryNoteType = DeliveryNote['type'];
export type DeliveryNoteStatus = DeliveryNote['status'];

export interface CreateDeliveryNoteDTO {
  type: DeliveryNoteType;
  salesOrderId?: string; purchaseOrderId?: string; contactId?: string;
  warehouseId: string; date: string;
  trackingNumber?: string; carrier?: string; notes?: string;
  items: Array<{ productId: string; description?: string; orderedQty: number; deliveredQty: number; sortOrder?: number }>;
}

export interface ListParams extends PaginationParams, DateRangeParams {
  search?: string;
  type?: string;
  status?: string;
  contactId?: string;
  warehouseId?: string;
  carrier?: string;
  salesOrderId?: string;
  purchaseOrderId?: string;
}

export async function getDeliveryNotes(params: ListParams) {
  const res = await apiClient.get('/api/delivery-notes', { params });
  return safeParse(PaginatedResponseSchema(DeliveryNoteSchema), res.data, 'getDeliveryNotes');
}

export async function getDeliveryNoteById(id: string): Promise<DeliveryNote> {
  const res = await apiClient.get(`/api/delivery-notes/${id}`);
  return safeParse(SingleResponseSchema(DeliveryNoteSchema), res.data, 'getDeliveryNoteById').data;
}

export async function createDeliveryNote(data: CreateDeliveryNoteDTO): Promise<DeliveryNote> {
  const res = await apiClient.post('/api/delivery-notes', data);
  return safeParse(SingleResponseSchema(DeliveryNoteSchema), res.data, 'createDeliveryNote').data;
}

export async function updateDeliveryNoteStatus(
  id: string,
  status: DeliveryNoteStatus,
  dates?: { shippedAt?: string; deliveredAt?: string },
): Promise<DeliveryNote> {
  const res = await apiClient.patch(`/api/delivery-notes/${id}/status`, { status, ...dates });
  return safeParse(SingleResponseSchema(DeliveryNoteSchema), res.data, 'updateDeliveryNoteStatus').data;
}
