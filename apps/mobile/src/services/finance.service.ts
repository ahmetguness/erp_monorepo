import { z } from 'zod';
import { apiClient } from '../lib/api-client';

// ─────────────────────────────────────────────
// FAZ 7: Finance & Invoicing Schemas
// ─────────────────────────────────────────────

export const InvoiceStatusSchema = z.enum([
  'DRAFT',
  'SENT',
  'PAID',
  'PARTIALLY_PAID',
  'OVERDUE',
  'CANCELLED',
]);
export type InvoiceStatus = z.infer<typeof InvoiceStatusSchema>;

export const InvoiceTypeSchema = z.enum([
  'SALES',
  'PURCHASE',
  'RETURN_SALES',
  'RETURN_PURCHASE',
]);
export type InvoiceType = z.infer<typeof InvoiceTypeSchema>;

export const PaymentMethodSchema = z.enum([
  'CASH',
  'BANK_TRANSFER',
  'CREDIT_CARD',
  'CHECK',
  'PROMISSORY_NOTE',
  'OTHER',
]);
export type PaymentMethod = z.infer<typeof PaymentMethodSchema>;

export const EDocumentTypeSchema = z.enum([
  'E_INVOICE',
  'E_ARCHIVE',
  'E_WAYBILL',
]);
export type EDocumentType = z.infer<typeof EDocumentTypeSchema>;

export const EDocumentStatusSchema = z.enum([
  'PENDING',
  'PROCESSING',
  'SENT',
  'ACCEPTED',
  'REJECTED',
  'CANCELLED',
  'ERROR',
]);
export type EDocumentStatus = z.infer<typeof EDocumentStatusSchema>;

// ─────────────────────────────────────────────
// Line & Item Schemas
// ─────────────────────────────────────────────

export const InvoiceLineSchema = z.object({
  id: z.string(),
  description: z.string(),
  quantity: z.coerce.number(),
  unitPrice: z.coerce.number(),
  discount: z.coerce.number().default(0),
  taxAmount: z.coerce.number().default(0),
  withholdingAmount: z.coerce.number().default(0),
  lineTotal: z.coerce.number().default(0),
  sortOrder: z.coerce.number().optional(),
  product: z
    .object({
      id: z.string(),
      code: z.string(),
      name: z.string(),
    })
    .nullable()
    .optional(),
  taxRate: z
    .object({
      id: z.string(),
      name: z.string(),
      rate: z.coerce.number(),
    })
    .nullable()
    .optional(),
  withholdingRate: z
    .object({
      id: z.string(),
      name: z.string(),
      rate: z.coerce.number(),
    })
    .nullable()
    .optional(),
});
export type InvoiceLine = z.infer<typeof InvoiceLineSchema>;

export const PaymentAllocationItemSchema = z.object({
  id: z.string(),
  paymentId: z.string(),
  amount: z.coerce.number(),
  date: z.string(),
  method: PaymentMethodSchema.default('CASH'),
  direction: z.string().default('RECEIVE'),
  reference: z.string().nullable().optional(),
  status: z.string().default('COMPLETED'),
  notes: z.string().nullable().optional(),
});
export type PaymentAllocationItem = z.infer<typeof PaymentAllocationItemSchema>;

export const EDocumentSchema = z.object({
  id: z.string(),
  type: EDocumentTypeSchema,
  status: EDocumentStatusSchema.default('PENDING'),
  uuid: z.string().nullable().optional(),
  providerCode: z.string().nullable().optional(),
  providerMessage: z.string().nullable().optional(),
  retryCount: z.number().default(0),
  createdAt: z.string(),
  sentAt: z.string().nullable().optional(),
  acceptedAt: z.string().nullable().optional(),
  rejectedAt: z.string().nullable().optional(),
  invoice: z
    .object({
      id: z.string(),
      number: z.string(),
      type: InvoiceTypeSchema.optional(),
      status: InvoiceStatusSchema.optional(),
    })
    .nullable()
    .optional(),
  deliveryNote: z
    .object({
      id: z.string(),
      number: z.string(),
      type: z.string().optional(),
      status: z.string().optional(),
    })
    .nullable()
    .optional(),
});
export type EDocument = z.infer<typeof EDocumentSchema>;

// ─────────────────────────────────────────────
// Invoice Summaries & Details
// ─────────────────────────────────────────────

export const InvoiceContactSchema = z.object({
  id: z.string(),
  name: z.string(),
  code: z.string().nullable().optional(),
  taxNumber: z.string().nullable().optional(),
  address: z.string().nullable().optional(),
  email: z.string().nullable().optional(),
  phone: z.string().nullable().optional(),
});
export type InvoiceContact = z.infer<typeof InvoiceContactSchema>;

export const InvoiceSummarySchema = z.object({
  id: z.string(),
  number: z.string(),
  date: z.string(),
  dueDate: z.string().nullable().optional(),
  currencyCode: z.string().default('TRY'),
  totalNet: z.coerce.number().default(0),
  totalTax: z.coerce.number().default(0),
  totalWithholding: z.coerce.number().default(0),
  totalGross: z.coerce.number().default(0),
  status: InvoiceStatusSchema.default('DRAFT'),
  type: InvoiceTypeSchema.default('SALES'),
  notes: z.string().nullable().optional(),
  contact: InvoiceContactSchema,
  createdAt: z.string().optional(),
});
export type InvoiceSummary = z.infer<typeof InvoiceSummarySchema>;

export const InvoiceDetailSchema = InvoiceSummarySchema.extend({
  lines: z.array(InvoiceLineSchema).default([]),
  payments: z.array(PaymentAllocationItemSchema).default([]),
  eDocuments: z.array(EDocumentSchema).default([]),
});
export type InvoiceDetail = z.infer<typeof InvoiceDetailSchema>;

// ─────────────────────────────────────────────
// Overdue Invoice Model with Aging
// ─────────────────────────────────────────────

export interface OverdueInvoice extends InvoiceSummary {
  overdueDays: number;
  remainingAmount: number;
}

export interface AgingSummary {
  totalOverdue: number;
  bracket1_30: number;
  bracket31_60: number;
  bracket61_90: number;
  bracket90Plus: number;
  totalCount: number;
}

// ─────────────────────────────────────────────
// Payment Accounts & Creation Schemas
// ─────────────────────────────────────────────

export const CashAccountSchema = z.object({
  id: z.string(),
  name: z.string(),
  currencyCode: z.string().default('TRY'),
  isActive: z.boolean().default(true),
});
export type CashAccount = z.infer<typeof CashAccountSchema>;

export const BankAccountSchema = z.object({
  id: z.string(),
  name: z.string(),
  accountNumber: z.string().nullable().optional(),
  iban: z.string().nullable().optional(),
  bankName: z.string().nullable().optional(),
  branchName: z.string().nullable().optional(),
  currencyCode: z.string().default('TRY'),
  isActive: z.boolean().default(true),
});
export type BankAccount = z.infer<typeof BankAccountSchema>;

export const PaymentRecordSchema = z.object({
  id: z.string(),
  date: z.string(),
  amount: z.coerce.number(),
  method: PaymentMethodSchema,
  direction: z.string().default('RECEIVE'),
  reference: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  status: z.string().default('COMPLETED'),
  contact: z.object({ id: z.string(), name: z.string() }).nullable().optional(),
  bankAccount: z.object({ id: z.string(), name: z.string() }).nullable().optional(),
  cashAccount: z.object({ id: z.string(), name: z.string() }).nullable().optional(),
  allocations: z
    .array(
      z.object({
        id: z.string(),
        amount: z.coerce.number(),
        invoice: z.object({
          id: z.string(),
          number: z.string(),
          totalGross: z.coerce.number(),
        }),
      }),
    )
    .default([]),
});
export type PaymentRecord = z.infer<typeof PaymentRecordSchema>;

export interface CreatePaymentInput {
  contactId?: string;
  bankAccountId?: string;
  cashAccountId?: string;
  date: string;
  amount: number;
  method: PaymentMethod;
  direction?: 'RECEIVE' | 'SEND';
  reference?: string;
  idempotencyKey?: string;
  notes?: string;
  allocations?: Array<{
    invoiceId: string;
    amount: number;
  }>;
  checkFrontPhotoUri?: string;
  checkBackPhotoUri?: string;
}

// ─────────────────────────────────────────────
// API Functions
// ─────────────────────────────────────────────

export interface InvoiceListParams {
  page?: number;
  limit?: number;
  type?: InvoiceType;
  status?: InvoiceStatus;
  contactId?: string;
  search?: string;
}

/**
 * Fetch all invoices matching query params
 */
export async function getInvoices(params?: InvoiceListParams): Promise<{
  invoices: InvoiceSummary[];
  total: number;
  totalPages: number;
}> {
  const query: Record<string, string | number> = {};
  if (params?.page) query.page = params.page;
  if (params?.limit) query.limit = params.limit;
  if (params?.type) query.type = params.type;
  if (params?.status) query.status = params.status;
  if (params?.contactId) query.contactId = params.contactId;
  if (params?.search) query.search = params.search;

  const res = await apiClient.get('/invoices', { params: query });
  const rawList = res.data?.data ?? [];
  const meta = res.data?.meta ?? { total: rawList.length, totalPages: 1 };

  const parsed = z.array(InvoiceSummarySchema).safeParse(rawList);
  return {
    invoices: parsed.success ? parsed.data : (rawList as InvoiceSummary[]),
    total: meta.total,
    totalPages: meta.totalPages,
  };
}

/**
 * Fetch overdue and pending receivables, calculate overdue days and aging summary
 */
export async function getOverdueReceivables(params?: {
  contactId?: string;
  search?: string;
}): Promise<{
  overdueInvoices: OverdueInvoice[];
  agingSummary: AgingSummary;
}> {
  // Fetch invoices with OVERDUE or PARTIALLY_PAID status
  const [overdueRes, partialRes] = await Promise.all([
    getInvoices({
      status: 'OVERDUE',
      type: 'SALES',
      contactId: params?.contactId,
      search: params?.search,
      limit: 100,
    }),
    getInvoices({
      status: 'PARTIALLY_PAID',
      type: 'SALES',
      contactId: params?.contactId,
      search: params?.search,
      limit: 100,
    }),
  ]);

  const allItems = [...overdueRes.invoices, ...partialRes.invoices];
  // Deduplicate by ID
  const uniqueMap = new Map<string, InvoiceSummary>();
  allItems.forEach((inv) => uniqueMap.set(inv.id, inv));

  const now = new Date();
  const overdueInvoices: OverdueInvoice[] = [];

  let totalOverdue = 0;
  let bracket1_30 = 0;
  let bracket31_60 = 0;
  let bracket61_90 = 0;
  let bracket90Plus = 0;

  for (const inv of uniqueMap.values()) {
    const dueTime = inv.dueDate ? new Date(inv.dueDate).getTime() : new Date(inv.date).getTime();
    const diffMs = now.getTime() - dueTime;
    const diffDays = Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));

    // Remaining balance is totalGross unless partially paid
    const remainingAmount = inv.totalGross;

    if (diffDays > 0 || inv.status === 'OVERDUE') {
      overdueInvoices.push({
        ...inv,
        overdueDays: diffDays,
        remainingAmount,
      });

      totalOverdue += remainingAmount;
      if (diffDays <= 30) {
        bracket1_30 += remainingAmount;
      } else if (diffDays <= 60) {
        bracket31_60 += remainingAmount;
      } else if (diffDays <= 90) {
        bracket61_90 += remainingAmount;
      } else {
        bracket90Plus += remainingAmount;
      }
    }
  }

  // Sort by overdueDays descending (most urgent first)
  overdueInvoices.sort((a, b) => b.overdueDays - a.overdueDays);

  return {
    overdueInvoices,
    agingSummary: {
      totalOverdue,
      bracket1_30,
      bracket31_60,
      bracket61_90,
      bracket90Plus,
      totalCount: overdueInvoices.length,
    },
  };
}

/**
 * Fetch detailed invoice with items, payments, and e-documents
 */
export async function getInvoiceById(id: string): Promise<InvoiceDetail> {
  const res = await apiClient.get(`/invoices/${id}`);
  const raw = res.data?.data ?? res.data;
  const parsed = InvoiceDetailSchema.safeParse(raw);
  if (!parsed.success) {
    console.warn('[finance.service] getInvoiceById validation warning:', parsed.error);
    return raw as InvoiceDetail;
  }
  return parsed.data;
}

/**
 * Fetch E-Documents (E-Fatura, E-Arşiv, E-İrsaliye)
 */
export async function getEDocuments(params?: {
  page?: number;
  limit?: number;
  type?: EDocumentType;
  status?: EDocumentStatus;
  search?: string;
}): Promise<{
  documents: EDocument[];
  total: number;
  totalPages: number;
}> {
  const res = await apiClient.get('/e-documents', { params });
  const rawList = res.data?.data ?? [];
  const meta = res.data?.meta ?? { total: rawList.length, totalPages: 1 };
  const parsed = z.array(EDocumentSchema).safeParse(rawList);
  return {
    documents: parsed.success ? parsed.data : (rawList as EDocument[]),
    total: meta.total,
    totalPages: meta.totalPages,
  };
}

/**
 * Fetch detailed E-Document
 */
export async function getEDocumentById(id: string): Promise<EDocument> {
  const res = await apiClient.get(`/e-documents/${id}`);
  const raw = res.data?.data ?? res.data;
  const parsed = EDocumentSchema.safeParse(raw);
  return parsed.success ? parsed.data : (raw as EDocument);
}

/**
 * Fetch Cash Registers
 */
export async function getCashAccounts(): Promise<CashAccount[]> {
  const res = await apiClient.get('/payments/cash-accounts');
  const list = res.data?.data ?? [];
  const parsed = z.array(CashAccountSchema).safeParse(list);
  return parsed.success ? parsed.data : (list as CashAccount[]);
}

/**
 * Fetch Bank Accounts
 */
export async function getBankAccounts(): Promise<BankAccount[]> {
  const res = await apiClient.get('/payments/bank-accounts');
  const list = res.data?.data ?? [];
  const parsed = z.array(BankAccountSchema).safeParse(list);
  return parsed.success ? parsed.data : (list as BankAccount[]);
}

/**
 * List recent payments
 */
export async function getPayments(params?: {
  page?: number;
  limit?: number;
  contactId?: string;
}): Promise<{ payments: PaymentRecord[]; total: number }> {
  const res = await apiClient.get('/payments', { params });
  const list = res.data?.data ?? [];
  const total = res.data?.meta?.total ?? list.length;
  const parsed = z.array(PaymentRecordSchema).safeParse(list);
  return {
    payments: parsed.success ? parsed.data : (list as PaymentRecord[]),
    total,
  };
}

/**
 * Create a new payment receipt (Field Collection)
 */
export async function createPaymentReceipt(input: CreatePaymentInput): Promise<PaymentRecord> {
  // If check photos are provided, append photo metadata to notes for audit trail
  let finalNotes = input.notes || '';
  if (input.checkFrontPhotoUri || input.checkBackPhotoUri) {
    const photoNote = [
      input.checkFrontPhotoUri ? '[Çek Ön Yüzü Kaydedildi]' : null,
      input.checkBackPhotoUri ? '[Çek Arka Yüzü Kaydedildi]' : null,
    ]
      .filter(Boolean)
      .join(' ');
    finalNotes = finalNotes ? `${finalNotes}\n${photoNote}` : photoNote;
  }

  const payload = {
    contactId: input.contactId || undefined,
    bankAccountId: input.bankAccountId || undefined,
    cashAccountId: input.cashAccountId || undefined,
    date: input.date,
    amount: input.amount,
    method: input.method,
    direction: input.direction || 'RECEIVE',
    reference: input.reference || undefined,
    idempotencyKey: input.idempotencyKey || `rec-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    notes: finalNotes || undefined,
    allocations: input.allocations && input.allocations.length > 0 ? input.allocations : undefined,
  };

  const res = await apiClient.post('/payments', payload);
  const raw = res.data?.data ?? res.data;
  const parsed = PaymentRecordSchema.safeParse(raw);
  return parsed.success ? parsed.data : (raw as PaymentRecord);
}
