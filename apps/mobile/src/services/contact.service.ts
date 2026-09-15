import { z } from 'zod';
import { apiClient } from '../lib/api-client';
import { SingleResponseSchema } from '../types/api.types';

// ─────────────────────────────────────────────
// FAZ 5: Contact / Customer 360 Schemas
// ─────────────────────────────────────────────

export const ContactSchema = z.object({
  id: z.string(),
  name: z.string(),
  code: z.string().nullable().optional(),
  type: z.enum(['CUSTOMER', 'SUPPLIER', 'BOTH']).default('CUSTOMER'),
  taxNumber: z.string().nullable().optional(),
  taxOffice: z.string().nullable().optional(),
  email: z.string().nullable().optional(),
  phone: z.string().nullable().optional(),
  website: z.string().nullable().optional(),
  address: z.string().nullable().optional(),
  city: z.string().nullable().optional(),
  country: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  creditLimit: z.coerce.number().nullable().optional(),
  paymentTermDays: z.coerce.number().nullable().optional(),
  isActive: z.boolean().default(true),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
});

export const ContactListItemSchema = ContactSchema.extend({
  totalDebit: z.coerce.number().optional().default(0),
  totalCredit: z.coerce.number().optional().default(0),
  currentBalance: z.coerce.number().optional().default(0),
  lastTransactionDate: z.string().nullable().optional().default(null),
  openInvoiceCount: z.coerce.number().optional().default(0),
  overdueInvoiceCount: z.coerce.number().optional().default(0),
  riskLevel: z.enum(['safe', 'warning', 'exceeded', 'none']).optional().default('none'),
  riskRatio: z.coerce.number().optional().default(0),
  riskScore: z.coerce.number().optional().default(0),
  riskScoreLevel: z.enum(['LOW', 'MEDIUM', 'HIGH']).optional().default('LOW'),
});

export const FinancialsSchema = z.object({
  totalDebit: z.coerce.number().default(0),
  totalCredit: z.coerce.number().default(0),
  currentBalance: z.coerce.number().default(0),
  lastTransactionDate: z.string().nullable().optional(),
  transactionCount: z.coerce.number().default(0),
  openInvoiceCount: z.coerce.number().default(0),
  overdueInvoiceCount: z.coerce.number().default(0),
  riskLevel: z.enum(['safe', 'warning', 'exceeded', 'none']).default('none'),
  riskRatio: z.coerce.number().default(0),
  riskScore: z.coerce.number().optional().default(0),
  riskScoreLevel: z.enum(['LOW', 'MEDIUM', 'HIGH']).optional().default('LOW'),
});

export const OpenInvoiceSchema = z.object({
  id: z.string(),
  number: z.string(),
  date: z.string(),
  dueDate: z.string().nullable().optional(),
  status: z.string().default('SENT'),
  totalGross: z.coerce.number().default(0),
  type: z.string().optional(),
  isOverdue: z.boolean().default(false),
});

export const ContactDetailSchema = ContactSchema.extend({
  financials: FinancialsSchema.optional(),
  openInvoices: z.array(OpenInvoiceSchema).optional(),
});

export const ContactListResponseSchema = z.object({
  data: z.array(ContactListItemSchema),
  meta: z
    .object({
      total: z.number().default(0),
      page: z.number().default(1),
      pageSize: z.number().default(25),
      totalPages: z.number().default(1),
    })
    .optional(),
});

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

export type Contact = z.infer<typeof ContactSchema>;
export type ContactListItem = z.infer<typeof ContactListItemSchema>;
export type Financials = z.infer<typeof FinancialsSchema>;
export type OpenInvoice = z.infer<typeof OpenInvoiceSchema>;
export type ContactDetail = z.infer<typeof ContactDetailSchema>;

export interface ContactListParams {
  page?: number;
  limit?: number;
  search?: string;
  type?: 'CUSTOMER' | 'SUPPLIER' | 'BOTH';
  isActive?: boolean;
  balanceFilter?: 'receivable' | 'payable' | 'risky';
  sortBy?: string;
  sortDir?: 'asc' | 'desc';
}

// ─────────────────────────────────────────────
// Service Functions
// ─────────────────────────────────────────────

/**
 * 5.1: Müşteri listesini filtreli ve zenginleştirilmiş bakiye/risk bilgileriyle getirir
 */
export async function getContacts(params?: ContactListParams): Promise<{
  items: ContactListItem[];
  total: number;
}> {
  const queryParams: Record<string, any> = {};
  if (params?.page) queryParams.page = params.page;
  if (params?.limit) queryParams.limit = params.limit;
  if (params?.search) queryParams.search = params.search;
  if (params?.type) queryParams.type = params.type;
  if (params?.isActive !== undefined) queryParams.isActive = String(params.isActive);
  if (params?.balanceFilter) queryParams.balanceFilter = params.balanceFilter;
  if (params?.sortBy) queryParams.sortBy = params.sortBy;
  if (params?.sortDir) queryParams.sortDir = params.sortDir;

  const res = await apiClient.get('/api/contacts', { params: queryParams });
  const parsed = ContactListResponseSchema.safeParse(res.data);
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
 * 5.1: Müşteri 360 detayını bakiye, risk oranı ve açık faturalarla getirir
 */
export async function getContactById(id: string): Promise<ContactDetail> {
  const res = await apiClient.get(`/api/contacts/${id}`);
  const parsed = SingleResponseSchema(ContactDetailSchema).safeParse(res.data);
  if (parsed.success) {
    return parsed.data.data;
  }
  return res.data?.data;
}
