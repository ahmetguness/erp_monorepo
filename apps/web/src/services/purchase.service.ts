import { z } from 'zod';
import { apiClient } from '@/lib/api-client';
import { safeParse } from '@/lib/safe-parse';
import { SingleResponseSchema, PaginatedResponseSchema } from '@/types/api.types';
import type { PaginationParams } from '@/types/api.types';

// ─────────────────────────────────────────────
// Schemas
// ─────────────────────────────────────────────

const ContactRef = z.object({ id: z.string(), name: z.string(), code: z.string().optional(), email: z.string().nullable().optional() });
const ProductRef = z.object({ id: z.string(), code: z.string(), name: z.string() });

export const PurchaseRequestItemSchema = z.object({
  id: z.string(), tenantId: z.string(), requestId: z.string(),
  productId: z.string(), description: z.string().nullable(),
  quantity: z.coerce.number(), unitPrice: z.coerce.number().nullable(),
  product: ProductRef.optional(),
});

export const PurchaseRequestSchema = z.object({
  id: z.string(), tenantId: z.string(), number: z.string(),
  date: z.string(), status: z.enum(['DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'ORDERED', 'CANCELLED']),
  requestedBy: z.string().nullable(), approvedBy: z.string().nullable(),
  approvedAt: z.string().nullable(), notes: z.string().nullable(),
  totalEstimated: z.coerce.number().nullable(),
  purchaseOrderId: z.string().nullable(),
  createdAt: z.string(), updatedAt: z.string(),
  items: z.array(PurchaseRequestItemSchema).optional(),
});

export const PurchaseOrderItemSchema = z.object({
  id: z.string(), tenantId: z.string(), orderId: z.string(),
  productId: z.string(), description: z.string().nullable(),
  quantity: z.coerce.number(), received: z.coerce.number(),
  unitPrice: z.coerce.number(), discount: z.coerce.number(),
  taxRate: z.coerce.number(), taxAmount: z.coerce.number(),
  lineTotal: z.coerce.number(), sortOrder: z.coerce.number(),
  product: ProductRef.optional(),
});

export const PurchaseOrderSchema = z.object({
  id: z.string(), tenantId: z.string(), contactId: z.string(),
  number: z.string(), date: z.string(), dueDate: z.string().nullable(),
  status: z.enum(['DRAFT', 'SENT', 'PARTIALLY_RECEIVED', 'RECEIVED', 'CANCELLED']),
  currencyCode: z.string(), exchangeRate: z.coerce.number(),
  notes: z.string().nullable(),
  totalNet: z.coerce.number(), totalTax: z.coerce.number(), totalGross: z.coerce.number(),
  createdAt: z.string(), updatedAt: z.string(),
  contact: ContactRef.optional(),
  items: z.array(PurchaseOrderItemSchema).optional(),
  _count: z.object({ items: z.coerce.number() }).optional(),
});

export const PurchaseOrderHistorySchema = z.object({
  id: z.string(),
  tenantId: z.string(),
  orderId: z.string(),
  fromStatus: z.enum(['DRAFT', 'SENT', 'PARTIALLY_RECEIVED', 'RECEIVED', 'CANCELLED']).nullable(),
  toStatus: z.enum(['DRAFT', 'SENT', 'PARTIALLY_RECEIVED', 'RECEIVED', 'CANCELLED']),
  notes: z.string().nullable(),
  createdAt: z.string(),
  createdById: z.string().nullable(),
});

export const PurchaseTraceStageSchema = z.object({
  key: z.enum(['request', 'order', 'delivery', 'invoice']),
  label: z.string(),
  status: z.enum(['complete', 'partial', 'pending', 'missing', 'cancelled']),
  count: z.coerce.number(),
  href: z.string().nullable(),
});

export const PurchaseTraceSchema = z.object({
  order: z.object({
    id: z.string(),
    number: z.string(),
    status: PurchaseOrderSchema.shape.status,
    date: z.string(),
    totalGross: z.coerce.number(),
  }),
  requests: z.array(z.object({
    id: z.string(),
    number: z.string(),
    status: PurchaseRequestSchema.shape.status,
    date: z.string(),
    totalEstimated: z.coerce.number().nullable(),
  })),
  deliveryNotes: z.array(z.object({
    id: z.string(),
    number: z.string(),
    status: z.string(),
    type: z.string(),
    date: z.string(),
    deliveredAt: z.string().nullable(),
  })),
  invoices: z.array(z.object({
    id: z.string(),
    number: z.string(),
    status: z.string(),
    type: z.string(),
    date: z.string(),
    totalGross: z.coerce.number(),
  })),
  stages: z.array(PurchaseTraceStageSchema),
  summary: z.object({
    requestCount: z.coerce.number(),
    deliveryNoteCount: z.coerce.number(),
    invoiceCount: z.coerce.number(),
    deliveredQuantity: z.coerce.number(),
    orderedQuantity: z.coerce.number(),
    invoicedAmount: z.coerce.number(),
    orderedAmount: z.coerce.number(),
  }),
});

export const PurchaseOrderWithTraceSchema = PurchaseOrderSchema.extend({
  trace: PurchaseTraceSchema.optional(),
});

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

export type PurchaseRequest = z.infer<typeof PurchaseRequestSchema>;
export type PurchaseOrder = z.infer<typeof PurchaseOrderWithTraceSchema>;
export type PurchaseTrace = z.infer<typeof PurchaseTraceSchema>;
export type PurchaseTraceStage = z.infer<typeof PurchaseTraceStageSchema>;
export type PurchaseOrderItem = z.infer<typeof PurchaseOrderItemSchema>;
export type PurchaseOrderHistory = z.infer<typeof PurchaseOrderHistorySchema>;
export type PurchaseRequestStatus = PurchaseRequest['status'];
export type PurchaseOrderStatus = PurchaseOrder['status'];

// ─────────────────────────────────────────────
// DTOs
// ─────────────────────────────────────────────

export interface CreatePurchaseRequestDTO {
  date: string; notes?: string;
  items: Array<{ productId: string; description?: string; quantity: number; unitPrice?: number }>;
}

export interface CreatePurchaseOrderDTO {
  contactId: string; date: string; dueDate?: string; notes?: string;
  items: Array<{ productId: string; description?: string; quantity: number; unitPrice: number; discount?: number; taxRate?: number }>;
}

export interface ReceiveOrderDTO {
  warehouseId: string;
  items: Array<{ itemId: string; receivedQty: number }>;
}

export interface ListParams extends PaginationParams { status?: string; contactId?: string; }

// ─────────────────────────────────────────────
// Purchase Requests API
// ─────────────────────────────────────────────

export async function getPurchaseRequests(params: ListParams) {
  const res = await apiClient.get('/api/purchase-orders/requests', { params });
  return safeParse(PaginatedResponseSchema(PurchaseRequestSchema), res.data, 'getPurchaseRequests');
}

export async function createPurchaseRequest(data: CreatePurchaseRequestDTO): Promise<PurchaseRequest> {
  const res = await apiClient.post('/api/purchase-orders/requests', data);
  return safeParse(SingleResponseSchema(PurchaseRequestSchema), res.data, 'createPurchaseRequest').data;
}

export async function approvePurchaseRequest(id: string): Promise<PurchaseRequest> {
  const res = await apiClient.post(`/api/purchase-orders/requests/${id}/approve`);
  return safeParse(SingleResponseSchema(PurchaseRequestSchema), res.data, 'approvePurchaseRequest').data;
}

export async function convertRequestToOrder(
  id: string,
  contactId: string,
  items?: Array<{ productId: string; unitPrice: number }>,
): Promise<PurchaseOrder> {
  const res = await apiClient.post(`/api/purchase-orders/requests/${id}/convert`, { contactId, items });
  return safeParse(SingleResponseSchema(PurchaseOrderSchema), res.data, 'convertRequestToOrder').data;
}

// ─────────────────────────────────────────────
// Purchase Orders API
// ─────────────────────────────────────────────

export async function getPurchaseOrders(params: ListParams) {
  const res = await apiClient.get('/api/purchase-orders', { params });
  return safeParse(PaginatedResponseSchema(PurchaseOrderSchema), res.data, 'getPurchaseOrders');
}

export async function getPurchaseOrderById(id: string): Promise<PurchaseOrder> {
  const res = await apiClient.get(`/api/purchase-orders/${id}`);
  return safeParse(SingleResponseSchema(PurchaseOrderWithTraceSchema), res.data, 'getPurchaseOrderById').data;
}

export async function getPurchaseOrderHistory(id: string): Promise<PurchaseOrderHistory[]> {
  const res = await apiClient.get(`/api/purchase-orders/${id}/history`);
  return safeParse(SingleResponseSchema(z.array(PurchaseOrderHistorySchema)), res.data, 'getPurchaseOrderHistory').data;
}

export async function createPurchaseOrder(data: CreatePurchaseOrderDTO): Promise<PurchaseOrder> {
  const res = await apiClient.post('/api/purchase-orders', data);
  return safeParse(SingleResponseSchema(PurchaseOrderSchema), res.data, 'createPurchaseOrder').data;
}

export async function sendPurchaseOrder(id: string): Promise<PurchaseOrder> {
  const res = await apiClient.post(`/api/purchase-orders/${id}/send`);
  return safeParse(SingleResponseSchema(PurchaseOrderSchema), res.data, 'sendPurchaseOrder').data;
}

export async function receivePurchaseOrder(id: string, data: ReceiveOrderDTO): Promise<PurchaseOrder> {
  const res = await apiClient.post(`/api/purchase-orders/${id}/receive`, data);
  return safeParse(SingleResponseSchema(PurchaseOrderSchema), res.data, 'receivePurchaseOrder').data;
}

export async function cancelPurchaseOrder(id: string): Promise<PurchaseOrder> {
  const res = await apiClient.post(`/api/purchase-orders/${id}/cancel`);
  return safeParse(SingleResponseSchema(PurchaseOrderSchema), res.data, 'cancelPurchaseOrder').data;
}
