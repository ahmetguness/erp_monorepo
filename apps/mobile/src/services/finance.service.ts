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
  balance: z.coerce.number().optional().default(0),
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
  balance: z.coerce.number().optional().default(0),
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

  const res = await apiClient.get('/api/invoices', { params: query });
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
  const res = await apiClient.get(`/api/invoices/${id}`);
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
  const res = await apiClient.get('/api/e-documents', { params });
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
  const res = await apiClient.get(`/api/e-documents/${id}`);
  const raw = res.data?.data ?? res.data;
  const parsed = EDocumentSchema.safeParse(raw);
  return parsed.success ? parsed.data : (raw as EDocument);
}

/**
 * Fetch Cash Registers
 */
export async function getCashAccounts(): Promise<CashAccount[]> {
  const res = await apiClient.get('/api/payments/cash-accounts');
  const list = res.data?.data ?? [];
  const parsed = z.array(CashAccountSchema).safeParse(list);
  return parsed.success ? parsed.data : (list as CashAccount[]);
}

/**
 * Fetch Bank Accounts
 */
export async function getBankAccounts(): Promise<BankAccount[]> {
  const res = await apiClient.get('/api/payments/bank-accounts');
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
  const res = await apiClient.get('/api/payments', { params });
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

  const res = await apiClient.post('/api/payments', payload);
  const raw = res.data?.data ?? res.data;
  const parsed = PaymentRecordSchema.safeParse(raw);
  return parsed.success ? parsed.data : (raw as PaymentRecord);
}

// ─────────────────────────────────────────────
// FAZ 14: Checks & Promissory Notes (Çek & Senet)
// ─────────────────────────────────────────────

export const CheckNoteTypeSchema = z.enum(['CHECK', 'PROMISSORY_NOTE']);
export type CheckNoteType = z.infer<typeof CheckNoteTypeSchema>;

export const CheckStatusSchema = z.enum([
  'PENDING',
  'DEPOSITED',
  'CLEARED',
  'BOUNCED',
  'CANCELLED',
]);
export type CheckStatus = z.infer<typeof CheckStatusSchema>;

export const CheckPromissoryNoteSchema = z.object({
  id: z.string(),
  tenantId: z.string().optional(),
  contactId: z.string().nullable().optional(),
  type: CheckNoteTypeSchema.default('CHECK'),
  number: z.string(),
  amount: z.coerce.number().default(0),
  currencyCode: z.string().default('TRY'),
  issueDate: z.string(),
  dueDate: z.string(),
  bankName: z.string().nullable().optional(),
  status: CheckStatusSchema.default('PENDING'),
  notes: z.string().nullable().optional(),
  frontPhotoUri: z.string().nullable().optional(),
  backPhotoUri: z.string().nullable().optional(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
  contact: z
    .object({
      id: z.string(),
      name: z.string(),
      code: z.string().nullable().optional(),
      phone: z.string().nullable().optional(),
    })
    .nullable()
    .optional(),
});
export type CheckPromissoryNote = z.infer<typeof CheckPromissoryNoteSchema>;

export interface CreateCheckNoteInput {
  contactId?: string;
  type: CheckNoteType;
  number: string;
  amount: number;
  currencyCode?: string;
  issueDate: string;
  dueDate: string;
  bankName?: string;
  notes?: string;
  frontPhotoUri?: string;
  backPhotoUri?: string;
}

/**
 * Portföydeki çek ve senetleri listeler
 */
export async function getCheckPromissoryNotes(params?: {
  page?: number;
  limit?: number;
  type?: CheckNoteType;
  status?: CheckStatus;
  contactId?: string;
  search?: string;
}): Promise<{ items: CheckPromissoryNote[]; total: number }> {
  try {
    const res = await apiClient.get('/api/check-promissory', { params });
    const rawList = Array.isArray(res.data?.data) ? res.data.data : [];
    const parsed = z.array(CheckPromissoryNoteSchema).safeParse(rawList);
    return {
      items: parsed.success ? parsed.data : rawList,
      total: res.data?.meta?.total ?? rawList.length,
    };
  } catch {
    return { items: [], total: 0 };
  }
}

/**
 * Portföye yeni çek/senet kaydeder
 */
export async function createCheckPromissoryNote(input: CreateCheckNoteInput): Promise<CheckPromissoryNote> {
  let finalNotes = input.notes || '';
  if (input.frontPhotoUri || input.backPhotoUri) {
    const photoTag = `[PHOTOS: front=${input.frontPhotoUri || ''}; back=${input.backPhotoUri || ''}]`;
    finalNotes = finalNotes ? `${finalNotes}\n${photoTag}` : photoTag;
  }

  const payload = {
    contactId: input.contactId || undefined,
    type: input.type,
    number: input.number,
    amount: Math.max(0.01, input.amount),
    currencyCode: input.currencyCode || 'TRY',
    issueDate: input.issueDate,
    dueDate: input.dueDate,
    bankName: input.bankName || undefined,
    notes: finalNotes || undefined,
  };

  const res = await apiClient.post('/api/check-promissory', payload);
  const raw = res.data?.data ?? res.data;
  const parsed = CheckPromissoryNoteSchema.safeParse(raw);
  return parsed.success ? parsed.data : (raw as CheckPromissoryNote);
}

/**
 * Çek/senet durumunu günceller (State machine: PENDING -> DEPOSITED -> CLEARED / BOUNCED)
 */
export async function updateCheckPromissoryStatus(
  id: string,
  status: CheckStatus
): Promise<CheckPromissoryNote> {
  const res = await apiClient.patch(`/api/check-promissory/${id}/status`, { status });
  const raw = res.data?.data ?? res.data;
  const parsed = CheckPromissoryNoteSchema.safeParse(raw);
  return parsed.success ? parsed.data : (raw as CheckPromissoryNote);
}

/**
 * Bekleyen çek/senedi siler
 */
export async function deleteCheckPromissoryNote(id: string): Promise<boolean> {
  await apiClient.delete(`/api/check-promissory/${id}`);
  return true;
}

// ─────────────────────────────────────────────
// FAZ 14: Field Expense Management (Saha Masraf & Harcırah)
// ─────────────────────────────────────────────

export const ExpenseCategorySchema = z.enum([
  'FOOD',
  'FUEL',
  'ACCOMMODATION',
  'TRANSPORT',
  'HOSPITALITY',
  'OFFICE',
  'OTHER',
]);
export type ExpenseCategory = z.infer<typeof ExpenseCategorySchema>;

export const ExpensePaymentMethodSchema = z.enum(['COMPANY_CARD', 'OUT_OF_POCKET']);
export type ExpensePaymentMethod = z.infer<typeof ExpensePaymentMethodSchema>;

export const ExpenseStatusSchema = z.enum([
  'DRAFT',
  'PENDING_APPROVAL',
  'APPROVED',
  'REJECTED',
  'REIMBURSED',
]);
export type ExpenseStatus = z.infer<typeof ExpenseStatusSchema>;

export const ExpenseRecordSchema = z.object({
  id: z.string(),
  title: z.string(),
  category: ExpenseCategorySchema.default('OTHER'),
  amount: z.coerce.number().default(0),
  taxRate: z.coerce.number().default(20),
  taxAmount: z.coerce.number().default(0),
  totalAmount: z.coerce.number().default(0),
  paymentMethod: ExpensePaymentMethodSchema.default('OUT_OF_POCKET'),
  receiptPhotoUri: z.string().nullable().optional(),
  status: ExpenseStatusSchema.default('PENDING_APPROVAL'),
  date: z.string(),
  notes: z.string().nullable().optional(),
  createdAt: z.string().optional(),
});
export type ExpenseRecord = z.infer<typeof ExpenseRecordSchema>;

export interface CreateExpenseInput {
  title: string;
  category: ExpenseCategory;
  amount: number;
  taxRate?: number;
  paymentMethod: ExpensePaymentMethod;
  receiptPhotoUri?: string;
  date: string;
  notes?: string;
}

import AsyncStorage from '@react-native-async-storage/async-storage';
const EXPENSES_STORAGE_KEY = '@axon_mobile_expense_records';

/**
 * Saha masraf fişlerini listeler
 */
export async function getExpenses(params?: {
  category?: ExpenseCategory;
  status?: ExpenseStatus;
  search?: string;
}): Promise<ExpenseRecord[]> {
  try {
    const rawStored = await AsyncStorage.getItem(EXPENSES_STORAGE_KEY);
    let list: ExpenseRecord[] = rawStored ? JSON.parse(rawStored) : [];

    if (params?.category) {
      list = list.filter((e) => e.category === params.category);
    }
    if (params?.status) {
      list = list.filter((e) => e.status === params.status);
    }
    if (params?.search?.trim()) {
      const q = params.search.toLowerCase().trim();
      list = list.filter(
        (e) => e.title.toLowerCase().includes(q) || (e.notes && e.notes.toLowerCase().includes(q))
      );
    }

    return list.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  } catch {
    return [];
  }
}

/**
 * Yeni masraf fişi oluşturur ve onaya sunar
 */
export async function createExpenseRecord(input: CreateExpenseInput): Promise<ExpenseRecord> {
  const taxRate = input.taxRate !== undefined ? input.taxRate : 20;
  const taxAmount = (input.amount * taxRate) / 100;
  const totalAmount = input.amount + taxAmount;

  const newRecord: ExpenseRecord = {
    id: `exp_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    title: input.title.trim(),
    category: input.category,
    amount: input.amount,
    taxRate,
    taxAmount,
    totalAmount,
    paymentMethod: input.paymentMethod,
    receiptPhotoUri: input.receiptPhotoUri || null,
    status: 'PENDING_APPROVAL',
    date: input.date,
    notes: input.notes?.trim() || null,
    createdAt: new Date().toISOString(),
  };

  try {
    const existing = await getExpenses();
    const updated = [newRecord, ...existing];
    await AsyncStorage.setItem(EXPENSES_STORAGE_KEY, JSON.stringify(updated));

    // Also notify/submit to collaboration endpoint if available
    apiClient
      .post('/api/record-collaboration/EXPENSE/general/entries', {
        content: `[MASRAF FİŞİ GİRİLDİ] ${newRecord.title} - ${totalAmount} TL (${newRecord.category})`,
        activityType: 'NOTE',
      })
      .catch(() => {});
  } catch (err) {
    console.warn('[finance.service] createExpenseRecord storage error:', err);
  }

  return newRecord;
}

/**
 * Masraf fişi durumunu günceller (Yönetici onayı)
 */
export async function updateExpenseStatus(id: string, status: ExpenseStatus): Promise<ExpenseRecord | null> {
  try {
    const list = await getExpenses();
    let updatedRecord: ExpenseRecord | null = null;
    const updatedList = list.map((item) => {
      if (item.id === id) {
        updatedRecord = { ...item, status };
        return updatedRecord;
      }
      return item;
    });
    await AsyncStorage.setItem(EXPENSES_STORAGE_KEY, JSON.stringify(updatedList));
    return updatedRecord;
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────
// FAZ 14: Treasury (Banka & Kasa Hareket Dökümü)
// ─────────────────────────────────────────────

export const BankTransactionSchema = z.object({
  id: z.string(),
  tenantId: z.string().optional(),
  bankAccountId: z.string(),
  type: z.enum(['INCOMING', 'OUTGOING', 'TRANSFER']).default('INCOMING'),
  amount: z.coerce.number().default(0),
  balanceAfter: z.coerce.number().default(0),
  date: z.string(),
  description: z.string().nullable().optional(),
  reference: z.string().nullable().optional(),
  senderName: z.string().nullable().optional(),
  senderIban: z.string().nullable().optional(),
  matched: z.boolean().optional().default(false),
});
export type BankTransaction = z.infer<typeof BankTransactionSchema>;

/**
 * Banka hesabı hareketlerini (son 30 gün) listeler
 */
export async function getBankTransactions(params?: {
  bankAccountId?: string;
  limit?: number;
  dateFrom?: string;
  dateTo?: string;
}): Promise<BankTransaction[]> {
  try {
    const res = await apiClient.get('/api/bank-transactions', { params });
    const raw = Array.isArray(res.data?.data) ? res.data.data : [];
    const parsed = z.array(BankTransactionSchema).safeParse(raw);
    return parsed.success ? parsed.data : raw;
  } catch {
    return [];
  }
}

// ─────────────────────────────────────────────
// FAZ 14: Contact Account Statement (Cari Hesap Ekstresi)
// ─────────────────────────────────────────────

export const AccountStatementRowSchema = z.object({
  id: z.string(),
  date: z.string(),
  description: z.string().nullable().optional(),
  documentNumber: z.string().nullable().optional(),
  type: z.string().nullable().optional(),
  debit: z.coerce.number().default(0),
  credit: z.coerce.number().default(0),
  balance: z.coerce.number().default(0),
});
export type AccountStatementRow = z.infer<typeof AccountStatementRowSchema>;

export const AccountStatementSummarySchema = z.object({
  totalDebit: z.coerce.number().default(0),
  totalCredit: z.coerce.number().default(0),
  calculatedBalance: z.coerce.number().default(0),
  isBalanced: z.boolean().default(true),
  difference: z.coerce.number().optional().default(0),
});
export type AccountStatementSummary = z.infer<typeof AccountStatementSummarySchema>;

/**
 * Müşteri veya tedarikçinin resmi cari hesap ekstresini getirir
 */
export async function getContactAccountStatement(
  contactId: string,
  params?: { dateFrom?: string; dateTo?: string; limit?: number }
): Promise<{ rows: AccountStatementRow[]; summary: AccountStatementSummary }> {
  try {
    const res = await apiClient.get(`/api/accounting/account-statement/${contactId}`, { params });
    const rawRows = Array.isArray(res.data?.data) ? res.data.data : [];
    const parsedRows = z.array(AccountStatementRowSchema).safeParse(rawRows);
    const parsedSummary = AccountStatementSummarySchema.safeParse(res.data?.meta);

    return {
      rows: parsedRows.success ? parsedRows.data : rawRows,
      summary: parsedSummary.success
        ? parsedSummary.data
        : {
            totalDebit: 0,
            totalCredit: 0,
            calculatedBalance: 0,
            isBalanced: true,
            difference: 0,
          },
    };
  } catch {
    return {
      rows: [],
      summary: {
        totalDebit: 0,
        totalCredit: 0,
        calculatedBalance: 0,
        isBalanced: true,
        difference: 0,
      },
    };
  }
}
