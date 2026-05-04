import { z } from 'zod';
import { apiClient } from '@/lib/api-client';
import { safeParse } from '@/lib/safe-parse';
import { SingleResponseSchema, PaginatedResponseSchema } from '@/types/api.types';
import type { PaginationParams, DateRangeParams } from '@/types/api.types';

// ─────────────────────────────────────────────
// Schemas
// ─────────────────────────────────────────────

export const LedgerAccountSchema = z.object({
  id: z.string(), tenantId: z.string(), code: z.string(), name: z.string(),
  accountType: z.enum(['ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE']),
  parentId: z.string().nullable(), isActive: z.boolean(),
  parent: z.object({ id: z.string(), code: z.string(), name: z.string() }).optional(),
  children: z.array(z.object({ id: z.string(), code: z.string(), name: z.string() })).optional(),
});

export const FiscalPeriodSchema = z.object({
  id: z.string(), tenantId: z.string(), name: z.string(),
  startDate: z.string(), endDate: z.string(),
  status: z.enum(['OPEN', 'CLOSED', 'LOCKED']),
  closedAt: z.string().nullable(), createdAt: z.string(), updatedAt: z.string(),
});

export const JournalEntrySchema = z.object({
  id: z.string(), tenantId: z.string(), fiscalPeriodId: z.string().nullable(),
  type: z.string(), number: z.string(), date: z.string(),
  description: z.string().nullable(), isPosted: z.boolean(),
  postedAt: z.string().nullable(), createdAt: z.string(), updatedAt: z.string(),
  lines: z.array(z.object({
    id: z.string(), accountId: z.string(), debit: z.coerce.number(), credit: z.coerce.number(),
    description: z.string().nullable(), sortOrder: z.coerce.number(),
    account: z.object({ id: z.string(), code: z.string(), name: z.string() }).optional(),
  })).optional(),
  fiscalPeriod: z.object({ id: z.string(), name: z.string(), status: z.string() }).optional(),
});

export const BankAccountSchema = z.object({
  id: z.string(), tenantId: z.string(), name: z.string(),
  accountNumber: z.string().nullable(), iban: z.string().nullable(),
  bankName: z.string().nullable(), currencyCode: z.string(),
  type: z.enum(['CHECKING', 'SAVINGS', 'CREDIT', 'OTHER']),
  isActive: z.boolean(), createdAt: z.string(), updatedAt: z.string(),
});

export const CashAccountSchema = z.object({
  id: z.string(), tenantId: z.string(), name: z.string(),
  currencyCode: z.string(), isActive: z.boolean(), createdAt: z.string(), updatedAt: z.string(),
});

export const PaymentSchema = z.object({
  id: z.string(), tenantId: z.string(),
  contactId: z.string().nullable(), bankAccountId: z.string().nullable(), cashAccountId: z.string().nullable(),
  date: z.string(), amount: z.coerce.number(),
  method: z.enum(['CASH', 'BANK_TRANSFER', 'CREDIT_CARD', 'CHECK', 'PROMISSORY_NOTE', 'OTHER']),
  reference: z.string().nullable(), status: z.enum(['PENDING', 'COMPLETED', 'FAILED', 'CANCELLED', 'REFUNDED']),
  notes: z.string().nullable(), createdAt: z.string(), updatedAt: z.string(),
  contact: z.object({ id: z.string(), name: z.string() }).optional(),
  bankAccount: z.object({ id: z.string(), name: z.string() }).optional(),
  cashAccount: z.object({ id: z.string(), name: z.string() }).optional(),
  allocations: z.array(z.object({
    id: z.string(), invoiceId: z.string(), amount: z.coerce.number(),
    invoice: z.object({ id: z.string(), number: z.string(), totalGross: z.coerce.number() }).optional(),
  })).optional(),
});

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

export type LedgerAccount = z.infer<typeof LedgerAccountSchema>;
export type FiscalPeriod = z.infer<typeof FiscalPeriodSchema>;
export type JournalEntry = z.infer<typeof JournalEntrySchema>;
export type BankAccount = z.infer<typeof BankAccountSchema>;
export type CashAccount = z.infer<typeof CashAccountSchema>;
export type Payment = z.infer<typeof PaymentSchema>;
export type AccountType = LedgerAccount['accountType'];
export type PaymentMethod = Payment['method'];

// ─────────────────────────────────────────────
// DTOs
// ─────────────────────────────────────────────

export interface CreateLedgerAccountDTO { code: string; name: string; type: AccountType; parentId?: string; }
export interface CreateFiscalPeriodDTO { name: string; startDate: string; endDate: string; }
export interface JournalEntryLineDTO { accountId: string; debit: number; credit: number; description?: string; }
export interface CreateJournalEntryDTO { date: string; description?: string; lines: JournalEntryLineDTO[]; }
export interface CreateBankAccountDTO { name: string; accountNumber?: string; iban?: string; bankName?: string; currencyCode?: string; }
export interface CreateCashAccountDTO { name: string; currencyCode?: string; }
export interface CreatePaymentDTO {
  contactId?: string; bankAccountId?: string; cashAccountId?: string;
  date: string; amount: number; method: PaymentMethod; reference?: string; notes?: string;
  allocations?: Array<{ invoiceId: string; amount: number }>;
}
export interface PaymentListParams extends PaginationParams, DateRangeParams { contactId?: string; status?: string; }
export interface JournalEntryListParams extends PaginationParams, DateRangeParams { isPosted?: boolean; }

// ─────────────────────────────────────────────
// Service functions
// ─────────────────────────────────────────────

export async function getLedgerAccounts(params?: { type?: AccountType; search?: string; isActive?: boolean }): Promise<LedgerAccount[]> {
  const res = await apiClient.get('/api/accounting/accounts', { params });
  return safeParse(SingleResponseSchema(z.array(LedgerAccountSchema)), res.data, 'getLedgerAccounts').data;
}

export async function createLedgerAccount(data: CreateLedgerAccountDTO): Promise<LedgerAccount> {
  const res = await apiClient.post('/api/accounting/accounts', data);
  return safeParse(SingleResponseSchema(LedgerAccountSchema), res.data, 'createLedgerAccount').data;
}

export async function getFiscalPeriods(): Promise<FiscalPeriod[]> {
  const res = await apiClient.get('/api/accounting/fiscal-periods');
  return safeParse(SingleResponseSchema(z.array(FiscalPeriodSchema)), res.data, 'getFiscalPeriods').data;
}

export async function createFiscalPeriod(data: CreateFiscalPeriodDTO): Promise<FiscalPeriod> {
  const res = await apiClient.post('/api/accounting/fiscal-periods', data);
  return safeParse(SingleResponseSchema(FiscalPeriodSchema), res.data, 'createFiscalPeriod').data;
}

export async function closeFiscalPeriod(id: string): Promise<FiscalPeriod> {
  const res = await apiClient.post(`/api/accounting/fiscal-periods/${id}/close`);
  return safeParse(SingleResponseSchema(FiscalPeriodSchema), res.data, 'closeFiscalPeriod').data;
}

export async function deleteFiscalPeriod(id: string): Promise<void> {
  await apiClient.delete(`/api/accounting/fiscal-periods/${id}`);
}

export async function getJournalEntries(params: JournalEntryListParams) {
  const res = await apiClient.get('/api/accounting/journal-entries', { params });
  return safeParse(PaginatedResponseSchema(JournalEntrySchema), res.data, 'getJournalEntries');
}

export async function getJournalEntryById(id: string): Promise<JournalEntry> {
  const res = await apiClient.get(`/api/accounting/journal-entries/${id}`);
  return safeParse(SingleResponseSchema(JournalEntrySchema), res.data, 'getJournalEntryById').data;
}

export async function createJournalEntry(data: CreateJournalEntryDTO): Promise<JournalEntry> {
  const res = await apiClient.post('/api/accounting/journal-entries', data);
  return safeParse(SingleResponseSchema(JournalEntrySchema), res.data, 'createJournalEntry').data;
}

export async function postJournalEntry(id: string): Promise<JournalEntry> {
  const res = await apiClient.post(`/api/accounting/journal-entries/${id}/post`);
  return safeParse(SingleResponseSchema(JournalEntrySchema), res.data, 'postJournalEntry').data;
}

export async function updateJournalEntry(id: string, data: CreateJournalEntryDTO): Promise<JournalEntry> {
  const res = await apiClient.patch(`/api/accounting/journal-entries/${id}`, data);
  return safeParse(SingleResponseSchema(JournalEntrySchema), res.data, 'updateJournalEntry').data;
}

export async function reverseJournalEntry(id: string): Promise<JournalEntry> {
  const res = await apiClient.post(`/api/accounting/journal-entries/${id}/reverse`);
  return safeParse(SingleResponseSchema(JournalEntrySchema), res.data, 'reverseJournalEntry').data;
}

export async function getBankAccounts(): Promise<BankAccount[]> {
  const res = await apiClient.get('/api/payments/bank-accounts');
  return safeParse(SingleResponseSchema(z.array(BankAccountSchema)), res.data, 'getBankAccounts').data;
}

export async function createBankAccount(data: CreateBankAccountDTO): Promise<BankAccount> {
  const res = await apiClient.post('/api/payments/bank-accounts', data);
  return safeParse(SingleResponseSchema(BankAccountSchema), res.data, 'createBankAccount').data;
}

export async function getCashAccounts(): Promise<CashAccount[]> {
  const res = await apiClient.get('/api/payments/cash-accounts');
  return safeParse(SingleResponseSchema(z.array(CashAccountSchema)), res.data, 'getCashAccounts').data;
}

export async function createCashAccount(data: CreateCashAccountDTO): Promise<CashAccount> {
  const res = await apiClient.post('/api/payments/cash-accounts', data);
  return safeParse(SingleResponseSchema(CashAccountSchema), res.data, 'createCashAccount').data;
}

export async function getPayments(params: PaymentListParams) {
  const res = await apiClient.get('/api/payments', { params });
  return safeParse(PaginatedResponseSchema(PaymentSchema), res.data, 'getPayments');
}

export async function getPaymentById(id: string): Promise<Payment> {
  const res = await apiClient.get(`/api/payments/${id}`);
  return safeParse(SingleResponseSchema(PaymentSchema), res.data, 'getPaymentById').data;
}

export async function createPayment(data: CreatePaymentDTO): Promise<Payment> {
  const res = await apiClient.post('/api/payments', data);
  return safeParse(SingleResponseSchema(PaymentSchema), res.data, 'createPayment').data;
}
