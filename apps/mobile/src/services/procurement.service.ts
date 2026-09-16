import { z } from 'zod';
import { apiClient } from '../lib/api-client';
import { SingleResponseSchema } from '../types/api.types';
import { ContactListItem, ContactDetail, getContacts, getContactById } from './contact.service';

// ─────────────────────────────────────────────
// FAZ 13: Procurement Zod Schemas
// ─────────────────────────────────────────────

export const PurchaseRequestStatusSchema = z.enum([
  'DRAFT',
  'PENDING_APPROVAL',
  'APPROVED',
  'REJECTED',
  'ORDERED',
  'CANCELLED',
]);
export type PurchaseRequestStatus = z.infer<typeof PurchaseRequestStatusSchema>;

export const PurchaseOrderStatusSchema = z.enum([
  'DRAFT',
  'SENT',
  'PARTIALLY_RECEIVED',
  'RECEIVED',
  'CANCELLED',
]);
export type PurchaseOrderStatus = z.infer<typeof PurchaseOrderStatusSchema>;

const ProductRefSchema = z.object({
  id: z.string(),
  code: z.string(),
  name: z.string(),
  barcode: z.string().nullable().optional(),
});

export const PurchaseRequestItemSchema = z.object({
  id: z.string(),
  tenantId: z.string().optional(),
  requestId: z.string().optional(),
  productId: z.string(),
  description: z.string().nullable().optional(),
  quantity: z.coerce.number().default(1),
  unitPrice: z.coerce.number().nullable().optional(),
  product: ProductRefSchema.optional(),
});
export type PurchaseRequestItem = z.infer<typeof PurchaseRequestItemSchema>;

export const PurchaseRequestSchema = z.object({
  id: z.string(),
  tenantId: z.string().optional(),
  number: z.string(),
  date: z.string(),
  status: PurchaseRequestStatusSchema.default('DRAFT'),
  requestedBy: z.string().nullable().optional(),
  approvedBy: z.string().nullable().optional(),
  approvedAt: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  totalEstimated: z.coerce.number().nullable().optional(),
  purchaseOrderId: z.string().nullable().optional(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
  items: z.array(PurchaseRequestItemSchema).optional().default([]),
  purchaseOrder: z
    .object({
      id: z.string(),
      number: z.string(),
      status: z.string(),
    })
    .nullable()
    .optional(),
});
export type PurchaseRequest = z.infer<typeof PurchaseRequestSchema>;

export const PurchaseOrderItemSchema = z.object({
  id: z.string(),
  tenantId: z.string().optional(),
  orderId: z.string().optional(),
  productId: z.string(),
  description: z.string().nullable().optional(),
  quantity: z.coerce.number().default(1),
  received: z.coerce.number().default(0),
  unitPrice: z.coerce.number().default(0),
  discount: z.coerce.number().default(0),
  taxRate: z.coerce.number().default(20),
  taxAmount: z.coerce.number().default(0),
  lineTotal: z.coerce.number().default(0),
  sortOrder: z.coerce.number().default(0),
  product: ProductRefSchema.optional(),
});
export type PurchaseOrderItem = z.infer<typeof PurchaseOrderItemSchema>;

export const PurchaseOrderSchema = z.object({
  id: z.string(),
  tenantId: z.string().optional(),
  contactId: z.string(),
  number: z.string(),
  date: z.string(),
  dueDate: z.string().nullable().optional(),
  status: PurchaseOrderStatusSchema.default('DRAFT'),
  currencyCode: z.string().default('TRY'),
  exchangeRate: z.coerce.number().default(1),
  notes: z.string().nullable().optional(),
  totalNet: z.coerce.number().default(0),
  totalTax: z.coerce.number().default(0),
  totalGross: z.coerce.number().default(0),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
  contact: z
    .object({
      id: z.string(),
      name: z.string(),
      code: z.string().nullable().optional(),
      email: z.string().nullable().optional(),
      phone: z.string().nullable().optional(),
    })
    .optional(),
  items: z.array(PurchaseOrderItemSchema).optional().default([]),
  _count: z.object({ items: z.coerce.number() }).optional(),
});
export type PurchaseOrder = z.infer<typeof PurchaseOrderSchema>;

export const WarehouseSchema = z.object({
  id: z.string(),
  name: z.string(),
  code: z.string().optional(),
  isDefault: z.boolean().optional().default(false),
});
export type Warehouse = z.infer<typeof WarehouseSchema>;

export const PurchaseThreeWayMatchSchema = z.object({
  orderId: z.string(),
  orderNumber: z.string(),
  status: z.string(),
  overallStatus: z.enum(['MATCHED', 'DISCREPANCY', 'PENDING', 'NOT_APPLICABLE']).default('PENDING'),
  orderedQty: z.coerce.number().default(0),
  receivedQty: z.coerce.number().default(0),
  invoicedQty: z.coerce.number().default(0),
  orderedAmount: z.coerce.number().default(0),
  invoicedAmount: z.coerce.number().default(0),
  items: z
    .array(
      z.object({
        productId: z.string(),
        productName: z.string().optional(),
        productCode: z.string().optional(),
        orderedQty: z.coerce.number(),
        receivedQty: z.coerce.number(),
        invoicedQty: z.coerce.number(),
        status: z.string(),
      })
    )
    .optional()
    .default([]),
});
export type PurchaseThreeWayMatch = z.infer<typeof PurchaseThreeWayMatchSchema>;

// ─────────────────────────────────────────────
// DTOs
// ─────────────────────────────────────────────

export interface CreatePurchaseRequestDTO {
  date: string;
  notes?: string;
  items: Array<{
    productId: string;
    description?: string;
    quantity: number;
    unitPrice?: number;
  }>;
}

export interface CreatePurchaseOrderDTO {
  contactId: string;
  date: string;
  dueDate?: string;
  notes?: string;
  items: Array<{
    productId: string;
    description?: string;
    quantity: number;
    unitPrice: number;
    discount?: number;
    taxRate?: number;
  }>;
}

export interface ConfirmGoodsReceiptDTO {
  warehouseId: string;
  idempotencyKey?: string;
  items: Array<{
    itemId: string;
    receivedQty: number;
  }>;
}

// ─────────────────────────────────────────────
// 13.1: Supplier 360 Service Functions
// ─────────────────────────────────────────────

/**
 * Tedarikçi listesini getirir
 */
export async function getSuppliers(params?: {
  search?: string;
  limit?: number;
  page?: number;
  balanceFilter?: 'all' | 'payable' | 'zero';
}): Promise<{ items: ContactListItem[]; total: number }> {
  return getContacts({
    type: 'SUPPLIER',
    search: params?.search,
    limit: params?.limit,
    page: params?.page,
    balanceFilter: params?.balanceFilter === 'payable' ? 'payable' : undefined,
  });
}

/**
 * Tedarikçi detayını ve cari durumunu getirir
 */
export async function getSupplierById(id: string): Promise<ContactDetail> {
  return getContactById(id);
}

// ─────────────────────────────────────────────
// 13.2: Purchase Requisition (PR) Service Functions
// ─────────────────────────────────────────────

/**
 * Satın alma taleplerini listeler
 */
export async function getPurchaseRequests(params?: {
  status?: PurchaseRequestStatus;
  search?: string;
  limit?: number;
  page?: number;
}): Promise<{ items: PurchaseRequest[]; total: number }> {
  const queryParams: any = {
    limit: params?.limit || 50,
    page: params?.page || 1,
  };
  if (params?.status) queryParams.status = params.status;
  if (params?.search?.trim()) queryParams.search = params.search.trim();

  const res = await apiClient.get('/api/purchase-orders/requests', { params: queryParams });
  const rawList = Array.isArray(res.data?.data) ? res.data.data : [];
  const parsedItems = z.array(PurchaseRequestSchema).safeParse(rawList);

  return {
    items: parsedItems.success ? parsedItems.data : rawList,
    total: res.data?.meta?.total ?? rawList.length,
  };
}

/**
 * Yeni satın alma talebi (PR) oluşturur
 */
export async function createPurchaseRequest(data: CreatePurchaseRequestDTO): Promise<PurchaseRequest> {
  const payload = {
    date: data.date,
    notes: data.notes || undefined,
    items: data.items.map((i) => ({
      productId: i.productId,
      description: i.description || undefined,
      quantity: Math.max(1, i.quantity),
      unitPrice: i.unitPrice !== undefined ? Math.max(0, i.unitPrice) : undefined,
    })),
  };

  const res = await apiClient.post('/api/purchase-orders/requests', payload);
  const parsed = SingleResponseSchema(PurchaseRequestSchema).safeParse(res.data);
  if (parsed.success) {
    return parsed.data.data;
  }
  return res.data?.data;
}

/**
 * Satın alma talebini onaylar
 */
export async function approvePurchaseRequest(id: string): Promise<PurchaseRequest> {
  const res = await apiClient.post(`/api/purchase-orders/requests/${id}/approve`);
  const parsed = SingleResponseSchema(PurchaseRequestSchema).safeParse(res.data);
  if (parsed.success) {
    return parsed.data.data;
  }
  return res.data?.data;
}

/**
 * Onaylanmış talebi resmi satın alma siparişine (PO) dönüştürür
 */
export async function convertRequestToOrder(
  id: string,
  data: { contactId: string; items?: { productId: string; unitPrice: number }[] }
): Promise<PurchaseOrder> {
  const res = await apiClient.post(`/api/purchase-orders/requests/${id}/convert`, data);
  const parsed = SingleResponseSchema(PurchaseOrderSchema).safeParse(res.data);
  if (parsed.success) {
    return parsed.data.data;
  }
  return res.data?.data;
}

// ─────────────────────────────────────────────
// 13.3 & 13.4: Purchase Orders (PO) & Goods Receipt
// ─────────────────────────────────────────────

/**
 * Satın alma siparişlerini listeler
 */
export async function getPurchaseOrders(params?: {
  status?: PurchaseOrderStatus;
  contactId?: string;
  search?: string;
  limit?: number;
  page?: number;
}): Promise<{ items: PurchaseOrder[]; total: number }> {
  const queryParams: any = {
    limit: params?.limit || 50,
    page: params?.page || 1,
  };
  if (params?.status) queryParams.status = params.status;
  if (params?.contactId) queryParams.contactId = params.contactId;
  if (params?.search?.trim()) queryParams.search = params.search.trim();

  const res = await apiClient.get('/api/purchase-orders', { params: queryParams });
  const rawList = Array.isArray(res.data?.data) ? res.data.data : [];
  const parsedItems = z.array(PurchaseOrderSchema).safeParse(rawList);

  return {
    items: parsedItems.success ? parsedItems.data : rawList,
    total: res.data?.meta?.total ?? rawList.length,
  };
}

/**
 * Tekil satın alma siparişi detayını getirir
 */
export async function getPurchaseOrderById(id: string): Promise<PurchaseOrder> {
  const res = await apiClient.get(`/api/purchase-orders/${id}`);
  const parsed = SingleResponseSchema(PurchaseOrderSchema).safeParse(res.data);
  if (parsed.success) {
    return parsed.data.data;
  }
  return res.data?.data;
}

/**
 * PO için 3-Way Match (Sipariş - Teslimat - Fatura) dökümünü getirir
 */
export async function getPurchaseOrderThreeWayMatch(id: string): Promise<PurchaseThreeWayMatch> {
  try {
    const res = await apiClient.get(`/api/purchase-orders/${id}/three-way-match`);
    const parsed = SingleResponseSchema(PurchaseThreeWayMatchSchema).safeParse(res.data);
    if (parsed.success) {
      return parsed.data.data;
    }
    return res.data?.data;
  } catch {
    return {
      orderId: id,
      orderNumber: '',
      status: 'PENDING',
      overallStatus: 'PENDING',
      orderedQty: 0,
      receivedQty: 0,
      invoicedQty: 0,
      orderedAmount: 0,
      invoicedAmount: 0,
      items: [],
    };
  }
}

/**
 * Yeni satın alma siparişi (PO) oluşturur
 */
export async function createPurchaseOrder(data: CreatePurchaseOrderDTO): Promise<PurchaseOrder> {
  const payload = {
    contactId: data.contactId,
    date: data.date,
    dueDate: data.dueDate || undefined,
    notes: data.notes || undefined,
    items: data.items.map((i) => ({
      productId: i.productId,
      description: i.description || undefined,
      quantity: Math.max(1, i.quantity),
      unitPrice: Math.max(0, i.unitPrice),
      discount: i.discount ? Math.min(100, Math.max(0, i.discount)) : 0,
      taxRate: i.taxRate !== undefined ? i.taxRate : 20,
    })),
  };

  const res = await apiClient.post('/api/purchase-orders', payload);
  const parsed = SingleResponseSchema(PurchaseOrderSchema).safeParse(res.data);
  if (parsed.success) {
    return parsed.data.data;
  }
  return res.data?.data;
}

/**
 * PO siparişini tedarikçiye gönderildi olarak işaretler
 */
export async function sendPurchaseOrder(id: string): Promise<PurchaseOrder> {
  const res = await apiClient.post(`/api/purchase-orders/${id}/send`);
  const parsed = SingleResponseSchema(PurchaseOrderSchema).safeParse(res.data);
  if (parsed.success) {
    return parsed.data.data;
  }
  return res.data?.data;
}

/**
 * 13.4: PO Tabanlı Mal Kabul (Goods Receipt) gerçekleştirir
 */
export async function receiveGoods(
  orderId: string,
  data: ConfirmGoodsReceiptDTO
): Promise<any> {
  const payload = {
    warehouseId: data.warehouseId,
    idempotencyKey: data.idempotencyKey || `rec_${orderId}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    items: data.items.map((it) => ({
      itemId: it.itemId,
      receivedQty: Math.max(0, it.receivedQty),
    })),
  };

  const res = await apiClient.post(`/api/purchase-orders/${orderId}/receive`, payload);
  return res.data?.data;
}

/**
 * Satın alma siparişini iptal eder
 */
export async function cancelPurchaseOrder(id: string): Promise<PurchaseOrder> {
  const res = await apiClient.post(`/api/purchase-orders/${id}/cancel`);
  const parsed = SingleResponseSchema(PurchaseOrderSchema).safeParse(res.data);
  if (parsed.success) {
    return parsed.data.data;
  }
  return res.data?.data;
}

/**
 * Depoları listeler (Mal kabul için depo seçimi)
 */
export async function getWarehouses(): Promise<Warehouse[]> {
  try {
    const res = await apiClient.get('/api/warehouses');
    const raw = Array.isArray(res.data?.data) ? res.data.data : [];
    const parsed = z.array(WarehouseSchema).safeParse(raw);
    if (parsed.success) {
      return parsed.data;
    }
    return raw;
  } catch {
    // Fallback if warehouses route is empty or fails
    return [{ id: 'main_wh', name: 'Merkez Depo', isDefault: true }];
  }
}
