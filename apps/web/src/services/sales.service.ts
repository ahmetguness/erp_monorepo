import { z } from 'zod';
import { apiClient } from '@/lib/api-client';
import { safeParse } from '@/lib/safe-parse';
import { SingleResponseSchema, PaginatedResponseSchema } from '@/types/api.types';
import type { PaginationParams, DateRangeParams } from '@/types/api.types';

// ─────────────────────────────────────────────
// Schemas
// ─────────────────────────────────────────────

const OrderItemSchema = z.object({
  id: z.string(),
  tenantId: z.string(),
  productId: z.string(),
  description: z.string().nullable(),
  quantity: z.coerce.number(),
  unitPrice: z.coerce.number(),
  discount: z.coerce.number(),
  taxRate: z.coerce.number(),
  taxAmount: z.coerce.number(),
  lineTotal: z.coerce.number(),
  sortOrder: z.coerce.number(),
  product: z.object({ id: z.string(), code: z.string(), name: z.string() }).optional(),
});

const ContactRefSchema = z.object({ id: z.string(), name: z.string(), email: z.string().nullable().optional() });

export const SalesQuoteSchema = z.object({
  id: z.string(),
  tenantId: z.string(),
  contactId: z.string(),
  number: z.string(),
  date: z.string(),
  validUntil: z.string().nullable(),
  status: z.enum(['DRAFT', 'SENT', 'ACCEPTED', 'REJECTED', 'EXPIRED', 'CANCELLED']),
  notes: z.string().nullable(),
  totalNet: z.coerce.number(),
  totalTax: z.coerce.number(),
  totalGross: z.coerce.number(),
  createdAt: z.string(),
  updatedAt: z.string(),
  contact: ContactRefSchema.optional(),
  items: z.array(OrderItemSchema).optional(),
});

export const SalesOrderSchema = z.object({
  id: z.string(),
  tenantId: z.string(),
  contactId: z.string(),
  quoteId: z.string().nullable(),
  number: z.string(),
  date: z.string(),
  dueDate: z.string().nullable(),
  status: z.enum(['DRAFT', 'CONFIRMED', 'PARTIALLY_DELIVERED', 'DELIVERED', 'CANCELLED']),
  notes: z.string().nullable(),
  totalNet: z.coerce.number(),
  totalTax: z.coerce.number(),
  totalGross: z.coerce.number(),
  invoicedAmount: z.coerce.number(),
  createdAt: z.string(),
  updatedAt: z.string(),
  contact: ContactRefSchema.optional(),
  items: z.array(OrderItemSchema).optional(),
  invoices: z.array(z.object({ id: z.string(), number: z.string(), status: z.string(), totalGross: z.coerce.number() })).optional(),
});

export const InvoiceSchema = z.object({
  id: z.string(),
  tenantId: z.string(),
  contactId: z.string(),
  salesOrderId: z.string().nullable(),
  purchaseOrderId: z.string().nullable(),
  type: z.enum(['SALES', 'PURCHASE', 'RETURN_SALES', 'RETURN_PURCHASE']),
  status: z.enum(['DRAFT', 'SENT', 'PAID', 'PARTIALLY_PAID', 'OVERDUE', 'CANCELLED']),
  number: z.string(),
  date: z.string(),
  dueDate: z.string().nullable(),
  currencyCode: z.string(),
  totalNet: z.coerce.number(),
  totalTax: z.coerce.number(),
  totalGross: z.coerce.number(),
  notes: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
  contact: z.object({ id: z.string(), name: z.string(), taxNumber: z.string().nullable().optional(), email: z.string().nullable().optional() }).optional(),
  lines: z.array(z.object({
    id: z.string(),
    productId: z.string().nullable(),
    taxRateId: z.string().nullable(),
    description: z.string(),
    quantity: z.coerce.number(),
    unitPrice: z.coerce.number(),
    discount: z.coerce.number(),
    taxAmount: z.coerce.number(),
    lineTotal: z.coerce.number(),
    sortOrder: z.coerce.number(),
    product: z.object({ id: z.string(), code: z.string(), name: z.string() }).optional(),
    taxRate: z.object({ id: z.string(), name: z.string(), rate: z.coerce.number() }).optional(),
  })).optional(),
});

export const SalesOrderHistorySchema = z.object({
  id: z.string(),
  tenantId: z.string(),
  orderId: z.string(),
  fromStatus: z.enum(['DRAFT', 'CONFIRMED', 'PARTIALLY_DELIVERED', 'DELIVERED', 'CANCELLED']).nullable(),
  toStatus: z.enum(['DRAFT', 'CONFIRMED', 'PARTIALLY_DELIVERED', 'DELIVERED', 'CANCELLED']),
  notes: z.string().nullable(),
  createdAt: z.string(),
  createdById: z.string().nullable(),
});

export const InvoiceHistorySchema = z.object({
  id: z.string(),
  tenantId: z.string(),
  invoiceId: z.string(),
  fromStatus: z.enum(['DRAFT', 'SENT', 'PAID', 'PARTIALLY_PAID', 'OVERDUE', 'CANCELLED']).nullable(),
  toStatus: z.enum(['DRAFT', 'SENT', 'PAID', 'PARTIALLY_PAID', 'OVERDUE', 'CANCELLED']),
  notes: z.string().nullable(),
  createdAt: z.string(),
  createdById: z.string().nullable(),
});

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

export type SalesQuote = z.infer<typeof SalesQuoteSchema>;
export type SalesOrder = z.infer<typeof SalesOrderSchema>;
export type Invoice = z.infer<typeof InvoiceSchema>;
export type SalesOrderHistory = z.infer<typeof SalesOrderHistorySchema>;
export type InvoiceHistory = z.infer<typeof InvoiceHistorySchema>;
export type InvoiceType = Invoice['type'];
export type InvoiceStatus = Invoice['status'];
export type OrderStatus = SalesOrder['status'];
export type QuoteStatus = SalesQuote['status'];

// ─────────────────────────────────────────────
// DTOs
// ─────────────────────────────────────────────

export interface OrderItemDTO {
  productId: string;
  description?: string;
  quantity: number;
  unitPrice: number;
  discount?: number;
  taxRate?: number;
}

export interface CreateSalesQuoteDTO {
  contactId: string;
  date: string;
  validUntil?: string;
  notes?: string;
  items: OrderItemDTO[];
}

export interface CreateSalesOrderDTO {
  contactId: string;
  quoteId?: string;
  date: string;
  dueDate?: string;
  notes?: string;
  items: OrderItemDTO[];
}

export interface InvoiceLineDTO {
  productId?: string;
  taxRateId?: string;
  withholdingRateId?: string;
  description: string;
  quantity: number;
  unitPrice: number;
  discount?: number;
}

export interface CreateInvoiceDTO {
  contactId: string;
  type: InvoiceType;
  salesOrderId?: string;
  purchaseOrderId?: string;
  date: string;
  dueDate?: string;
  notes?: string;
  lines: InvoiceLineDTO[];
}

export interface ListParams extends PaginationParams, DateRangeParams {
  contactId?: string;
  status?: string;
  type?: string;
  search?: string;
}

// ─────────────────────────────────────────────
// Sales Quotes
// ─────────────────────────────────────────────

const QuoteListSchema = PaginatedResponseSchema(SalesQuoteSchema);

export async function getSalesQuotes(params: ListParams) {
  const res = await apiClient.get('/api/sales-orders/quotes', { params });
  return safeParse(QuoteListSchema, res.data, 'getSalesQuotes');
}

export async function getSalesQuoteById(id: string): Promise<SalesQuote> {
  const res = await apiClient.get(`/api/sales-orders/quotes/${id}`);
  return safeParse(SingleResponseSchema(SalesQuoteSchema), res.data, 'getSalesQuoteById').data;
}

export async function createSalesQuote(data: CreateSalesQuoteDTO): Promise<SalesQuote> {
  const res = await apiClient.post('/api/sales-orders/quotes', data);
  return safeParse(SingleResponseSchema(SalesQuoteSchema), res.data, 'createSalesQuote').data;
}

export async function convertQuoteToOrder(quoteId: string): Promise<SalesOrder> {
  const res = await apiClient.post(`/api/sales-orders/quotes/${quoteId}/convert`);
  return safeParse(SingleResponseSchema(SalesOrderSchema), res.data, 'convertQuoteToOrder').data;
}

// ─────────────────────────────────────────────
// Sales Orders
// ─────────────────────────────────────────────

const OrderListSchema = PaginatedResponseSchema(SalesOrderSchema);

export async function getSalesOrders(params: ListParams) {
  const res = await apiClient.get('/api/sales-orders', { params });
  return safeParse(OrderListSchema, res.data, 'getSalesOrders');
}

export async function getSalesOrderById(id: string): Promise<SalesOrder> {
  const res = await apiClient.get(`/api/sales-orders/${id}`);
  return safeParse(SingleResponseSchema(SalesOrderSchema), res.data, 'getSalesOrderById').data;
}

export async function getSalesOrderHistory(id: string): Promise<SalesOrderHistory[]> {
  const res = await apiClient.get(`/api/sales-orders/${id}/history`);
  return safeParse(SingleResponseSchema(z.array(SalesOrderHistorySchema)), res.data, 'getSalesOrderHistory').data;
}

export async function createSalesOrder(data: CreateSalesOrderDTO): Promise<SalesOrder> {
  const res = await apiClient.post('/api/sales-orders', data);
  return safeParse(SingleResponseSchema(SalesOrderSchema), res.data, 'createSalesOrder').data;
}

export async function updateSalesOrder(id: string, data: { dueDate?: string; notes?: string; status?: OrderStatus }): Promise<SalesOrder> {
  const res = await apiClient.patch(`/api/sales-orders/${id}`, data);
  return safeParse(SingleResponseSchema(SalesOrderSchema), res.data, 'updateSalesOrder').data;
}

export async function cancelSalesOrder(id: string): Promise<SalesOrder> {
  const res = await apiClient.post(`/api/sales-orders/${id}/cancel`);
  return safeParse(SingleResponseSchema(SalesOrderSchema), res.data, 'cancelSalesOrder').data;
}

// ─────────────────────────────────────────────
// Invoices
// ─────────────────────────────────────────────

const InvoiceListSchema = PaginatedResponseSchema(InvoiceSchema);

export async function getInvoices(params: ListParams) {
  const res = await apiClient.get('/api/invoices', { params });
  return safeParse(InvoiceListSchema, res.data, 'getInvoices');
}

export async function getInvoiceById(id: string): Promise<Invoice> {
  const res = await apiClient.get(`/api/invoices/${id}`);
  return safeParse(SingleResponseSchema(InvoiceSchema), res.data, 'getInvoiceById').data;
}

export async function getInvoiceHistory(id: string): Promise<InvoiceHistory[]> {
  const res = await apiClient.get(`/api/invoices/${id}/history`);
  return safeParse(SingleResponseSchema(z.array(InvoiceHistorySchema)), res.data, 'getInvoiceHistory').data;
}

export async function createInvoice(data: CreateInvoiceDTO): Promise<Invoice> {
  const res = await apiClient.post('/api/invoices', data);
  return safeParse(SingleResponseSchema(InvoiceSchema), res.data, 'createInvoice').data;
}

export async function updateInvoice(id: string, data: { dueDate?: string; notes?: string; status?: InvoiceStatus }): Promise<Invoice> {
  const res = await apiClient.patch(`/api/invoices/${id}`, data);
  return safeParse(SingleResponseSchema(InvoiceSchema), res.data, 'updateInvoice').data;
}

export async function cancelInvoice(id: string): Promise<Invoice> {
  const res = await apiClient.post(`/api/invoices/${id}/cancel`);
  return safeParse(SingleResponseSchema(InvoiceSchema), res.data, 'cancelInvoice').data;
}
