import { z } from 'zod';
import { apiClient } from '../lib/api-client';
import { SingleResponseSchema } from '../types/api.types';

// ─────────────────────────────────────────────
// FAZ 5: Sales Order Schemas
// ─────────────────────────────────────────────

export const OrderItemSchema = z.object({
  id: z.string().optional(),
  productId: z.string(),
  description: z.string().nullable().optional(),
  quantity: z.coerce.number(),
  unitPrice: z.coerce.number(),
  discount: z.coerce.number().default(0),
  taxRate: z.coerce.number().default(20),
  taxAmount: z.coerce.number().default(0),
  lineTotal: z.coerce.number().default(0),
  sortOrder: z.coerce.number().optional(),
  product: z
    .object({
      id: z.string(),
      code: z.string(),
      name: z.string(),
      barcode: z.string().nullable().optional(),
    })
    .optional(),
});

export const SalesOrderSchema = z.object({
  id: z.string(),
  contactId: z.string(),
  quoteId: z.string().nullable().optional(),
  number: z.string(),
  date: z.string(),
  dueDate: z.string().nullable().optional(),
  status: z
    .enum(['DRAFT', 'CONFIRMED', 'PARTIALLY_DELIVERED', 'DELIVERED', 'CANCELLED'])
    .default('DRAFT'),
  notes: z.string().nullable().optional(),
  totalNet: z.coerce.number().default(0),
  totalTax: z.coerce.number().default(0),
  totalGross: z.coerce.number().default(0),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
  contact: z.object({ id: z.string(), name: z.string() }).optional(),
  items: z.array(OrderItemSchema).optional(),
});

export const SalesOrderListResponseSchema = z.object({
  data: z.array(SalesOrderSchema),
  meta: z
    .object({
      total: z.number().default(0),
      page: z.number().default(1),
      pageSize: z.number().default(20),
      totalPages: z.number().default(1),
    })
    .optional(),
});

// ─────────────────────────────────────────────
// Types & DTOs
// ─────────────────────────────────────────────

export type OrderItem = z.infer<typeof OrderItemSchema>;
export type SalesOrder = z.infer<typeof SalesOrderSchema>;

export interface OrderItemDTO {
  productId: string;
  description?: string;
  quantity: number;
  unitPrice: number;
  discount?: number;
  taxRate?: number;
}

export interface CreateSalesOrderDTO {
  contactId: string;
  quoteId?: string;
  number?: string;
  date: string;
  dueDate?: string;
  notes?: string;
  items: OrderItemDTO[];
}

export interface SalesOrderListParams {
  page?: number;
  limit?: number;
  contactId?: string;
  status?: string;
  search?: string;
}

// ─────────────────────────────────────────────
// Service Functions
// ─────────────────────────────────────────────

/**
 * 5.3: Sipariş listesini getirir
 */
export async function getSalesOrders(params?: SalesOrderListParams): Promise<{
  items: SalesOrder[];
  total: number;
}> {
  const res = await apiClient.get('/api/sales-orders', { params });
  const parsed = SalesOrderListResponseSchema.safeParse(res.data);
  if (parsed.success) {
    return {
      items: parsed.data.data,
      total: parsed.data.meta?.total ?? parsed.data.data.length,
    };
  }

  const rawList = Array.isArray(res.data?.data) ? res.data.data : [];
  return { items: rawList, total: res.data?.meta?.total ?? rawList.length };
}

/**
 * 5.3: Sipariş detayını getirir
 */
export async function getSalesOrderById(id: string): Promise<SalesOrder> {
  const res = await apiClient.get(`/api/sales-orders/${id}`);
  const parsed = SingleResponseSchema(SalesOrderSchema).safeParse(res.data);
  if (parsed.success) {
    return parsed.data.data;
  }
  return res.data?.data;
}

/**
 * 5.3: Yeni satış siparişi oluşturur
 */
export async function createSalesOrder(data: CreateSalesOrderDTO): Promise<SalesOrder> {
  const cleanPayload = {
    contactId: data.contactId,
    quoteId: data.quoteId || undefined,
    number: data.number || undefined,
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

  const res = await apiClient.post('/api/sales-orders', cleanPayload);
  const parsed = SingleResponseSchema(SalesOrderSchema).safeParse(res.data);
  if (parsed.success) {
    return parsed.data.data;
  }
  return res.data?.data;
}

/**
 * 5.3: Siparişi iptal eder
 */
export async function cancelSalesOrder(id: string): Promise<SalesOrder> {
  const res = await apiClient.post(`/api/sales-orders/${id}/cancel`);
  const parsed = SingleResponseSchema(SalesOrderSchema).safeParse(res.data);
  if (parsed.success) {
    return parsed.data.data;
  }
  return res.data?.data;
}
