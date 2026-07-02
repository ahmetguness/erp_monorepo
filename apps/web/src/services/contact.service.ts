import { z } from 'zod';
import { apiClient } from '@/lib/api-client';
import { safeParse } from '@/lib/safe-parse';
import { SingleResponseSchema, PaginatedResponseSchema } from '@/types/api.types';
import type { PaginationParams } from '@/types/api.types';

// ─────────────────────────────────────────────
// Schemas
// ─────────────────────────────────────────────

export const ContactSchema = z.object({
  id: z.string(),
  tenantId: z.string(),
  type: z.enum(['CUSTOMER', 'SUPPLIER', 'BOTH']),
  name: z.string(),
  code: z.string().nullable(),
  taxNumber: z.string().nullable(),
  taxOffice: z.string().nullable(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  website: z.string().nullable(),
  address: z.string().nullable(),
  city: z.string().nullable(),
  country: z.string(),
  notes: z.string().nullable(),
  creditLimit: z.coerce.number().nullable(),
  paymentTermDays: z.coerce.number().nullable(),
  isActive: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

/** Enriched contact returned by the list endpoint */
export const ContactListItemSchema = ContactSchema.extend({
  totalDebit: z.coerce.number().optional().default(0),
  totalCredit: z.coerce.number().optional().default(0),
  currentBalance: z.coerce.number().optional().default(0),
  lastTransactionDate: z.string().nullable().optional().default(null),
  openInvoiceCount: z.coerce.number().optional().default(0),
  overdueInvoiceCount: z.coerce.number().optional().default(0),
  riskLevel: z.enum(['safe', 'warning', 'exceeded', 'none']).optional().default('none'),
  riskRatio: z.coerce.number().optional().default(0),
});

export const ListSummarySchema = z.object({
  totalReceivable: z.coerce.number(),
  totalPayable: z.coerce.number(),
  netBalance: z.coerce.number(),
  riskyAccountCount: z.coerce.number(),
  totalAccounts: z.coerce.number(),
});

export const FinancialsSchema = z.object({
  totalDebit: z.coerce.number(),
  totalCredit: z.coerce.number(),
  currentBalance: z.coerce.number(),
  lastTransactionDate: z.string().nullable(),
  transactionCount: z.coerce.number(),
  openInvoiceCount: z.coerce.number(),
  overdueInvoiceCount: z.coerce.number(),
  riskLevel: z.enum(['safe', 'warning', 'exceeded', 'none']),
  riskRatio: z.coerce.number(),
});

export const OpenInvoiceSchema = z.object({
  id: z.string(),
  number: z.string(),
  date: z.string(),
  dueDate: z.string().nullable(),
  status: z.string(),
  totalGross: z.coerce.number(),
  type: z.string(),
  isOverdue: z.boolean(),
});

/** Detail endpoint returns contact + financials + openInvoices */
export const ContactDetailSchema = ContactSchema.extend({
  financials: FinancialsSchema.optional(),
  openInvoices: z.array(OpenInvoiceSchema).optional(),
});

export const AccountEntrySchema = z.object({
  id: z.string(),
  tenantId: z.string(),
  contactId: z.string(),
  date: z.string(),
  debit: z.coerce.number(),
  credit: z.coerce.number(),
  balance: z.coerce.number(),
  description: z.string().nullable(),
  refType: z.string().nullable(),
  refId: z.string().nullable(),
  createdAt: z.string(),
});

const CustomerTrackingMoneyDocumentSchema = z.object({
  id: z.string(),
  number: z.string(),
  date: z.string(),
  status: z.string(),
  totalGross: z.coerce.number(),
});

const CustomerTrackingInvoiceSchema = CustomerTrackingMoneyDocumentSchema.extend({
  dueDate: z.string().nullable(),
});

const CustomerTrackingReminderSchema = z.object({
  id: z.string(),
  dueDate: z.string(),
  amount: z.coerce.number(),
  status: z.string(),
  invoiceNumber: z.string().nullable(),
});

export const CustomerTrackingRowSchema = z.object({
  contact: z.object({
    id: z.string(),
    name: z.string(),
    type: z.enum(['CUSTOMER', 'SUPPLIER', 'BOTH']),
    email: z.string().nullable(),
    phone: z.string().nullable(),
  }),
  openBalance: z.coerce.number(),
  lastQuote: CustomerTrackingMoneyDocumentSchema.nullable(),
  lastInvoice: CustomerTrackingInvoiceSchema.nullable(),
  upcomingCollection: CustomerTrackingReminderSchema.nullable(),
});

export const CustomerTrackingDashboardSchema = z.object({
  summary: z.object({
    customerCount: z.coerce.number(),
    contactsWithOpenBalance: z.coerce.number(),
    openBalanceTotal: z.coerce.number(),
    upcomingCollectionTotal: z.coerce.number(),
  }),
  rows: z.array(CustomerTrackingRowSchema),
});

// ─────────────────────────────────────────────
// Inferred types
// ─────────────────────────────────────────────

export type Contact = z.infer<typeof ContactSchema>;
export type ContactListItem = z.infer<typeof ContactListItemSchema>;
export type ContactDetail = z.infer<typeof ContactDetailSchema>;
export type ContactType = Contact['type'];
export type AccountEntry = z.infer<typeof AccountEntrySchema>;
export type OpenInvoice = z.infer<typeof OpenInvoiceSchema>;
export type ContactFinancials = z.infer<typeof FinancialsSchema>;
export type ListSummary = z.infer<typeof ListSummarySchema>;
export type RiskLevel = ContactListItem['riskLevel'];
export type CustomerTrackingDashboard = z.infer<typeof CustomerTrackingDashboardSchema>;
export type CustomerTrackingRow = z.infer<typeof CustomerTrackingRowSchema>;

// ─────────────────────────────────────────────
// DTOs
// ─────────────────────────────────────────────

export interface ContactListParams extends PaginationParams {
  search?: string;
  type?: ContactType;
  isActive?: boolean;
  balanceFilter?: 'receivable' | 'payable' | 'risky';
  sortBy?: string;
  sortDir?: 'asc' | 'desc';
}

export interface CreateContactDTO {
  type: ContactType;
  name: string;
  code?: string;
  taxNumber?: string;
  taxOffice?: string;
  email?: string;
  phone?: string;
  website?: string;
  address?: string;
  city?: string;
  country?: string;
  notes?: string;
  creditLimit?: number;
  paymentTermDays?: number;
  tags?: string[];
}

export type UpdateContactDTO = Partial<Omit<CreateContactDTO, 'type'>> & { isActive?: boolean };

export interface AccountEntryListParams extends PaginationParams {
  dateFrom?: string;
  dateTo?: string;
  refType?: string;
}

// ─────────────────────────────────────────────
// Response schemas
// ─────────────────────────────────────────────

const ContactListResponseSchema = PaginatedResponseSchema(ContactListItemSchema).extend({
  summary: ListSummarySchema.optional(),
});

const AccountEntryListSchema = PaginatedResponseSchema(AccountEntrySchema).extend({
  periodTotals: z.object({
    debit: z.coerce.number(),
    credit: z.coerce.number(),
  }).optional(),
});
const CustomerTrackingDashboardResponseSchema = SingleResponseSchema(CustomerTrackingDashboardSchema);

// ─────────────────────────────────────────────
// Service functions
// ─────────────────────────────────────────────

export async function getContacts(params: ContactListParams) {
  const res = await apiClient.get('/api/contacts', { params });
  return safeParse(ContactListResponseSchema, res.data, 'getContacts');
}

export async function getCustomerTrackingDashboard(limit = 8): Promise<CustomerTrackingDashboard> {
  const res = await apiClient.get('/api/contacts/tracking-dashboard', { params: { limit } });
  return safeParse(CustomerTrackingDashboardResponseSchema, res.data, 'getCustomerTrackingDashboard').data;
}

export async function getContactById(id: string) {
  const res = await apiClient.get(`/api/contacts/${id}`);
  return safeParse(SingleResponseSchema(ContactDetailSchema), res.data, 'getContactById').data;
}

export async function createContact(data: CreateContactDTO): Promise<Contact> {
  const res = await apiClient.post('/api/contacts', data);
  return safeParse(SingleResponseSchema(ContactSchema), res.data, 'createContact').data;
}

export async function updateContact(id: string, data: UpdateContactDTO): Promise<Contact> {
  const res = await apiClient.patch(`/api/contacts/${id}`, data);
  return safeParse(SingleResponseSchema(ContactSchema), res.data, 'updateContact').data;
}

export async function deleteContact(id: string): Promise<void> {
  await apiClient.delete(`/api/contacts/${id}`);
}

export async function getAccountEntries(contactId: string, params: AccountEntryListParams) {
  const res = await apiClient.get(`/api/contacts/${contactId}/entries`, { params });
  return safeParse(AccountEntryListSchema, res.data, 'getAccountEntries');
}
