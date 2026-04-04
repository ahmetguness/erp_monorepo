'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useUIStore } from '@/store/ui.store';
import { getErrorMessage } from '@/types/api.types';
import {
  getLedgerAccounts, createLedgerAccount,
  getFiscalPeriods, createFiscalPeriod, closeFiscalPeriod,
  getJournalEntries, getJournalEntryById, createJournalEntry, postJournalEntry,
  getBankAccounts, createBankAccount, getCashAccounts, createCashAccount,
  getPayments, getPaymentById, createPayment,
  type CreateLedgerAccountDTO, type CreateFiscalPeriodDTO,
  type CreateJournalEntryDTO, type JournalEntryListParams,
  type CreateBankAccountDTO, type CreateCashAccountDTO,
  type CreatePaymentDTO, type PaymentListParams, type AccountType,
} from '@/services/accounting.service';

const KEYS = {
  accounts: (p?: { type?: AccountType }) => ['accounting', 'accounts', p] as const,
  periods: ['accounting', 'fiscal-periods'] as const,
  entries: (p: JournalEntryListParams) => ['accounting', 'journal-entries', p] as const,
  entry: (id: string) => ['accounting', 'journal-entries', id] as const,
  bankAccounts: ['payments', 'bank-accounts'] as const,
  cashAccounts: ['payments', 'cash-accounts'] as const,
  payments: (p: PaymentListParams) => ['payments', 'list', p] as const,
  payment: (id: string) => ['payments', id] as const,
};

// ── Ledger Accounts ──────────────────────────

export function useLedgerAccounts(params?: { type?: AccountType; search?: string }) {
  return useQuery({ queryKey: KEYS.accounts(params), queryFn: () => getLedgerAccounts(params), staleTime: 5 * 60 * 1000 });
}

export function useCreateLedgerAccount() {
  const qc = useQueryClient();
  const { toast } = useUIStore();
  return useMutation({
    mutationFn: (data: CreateLedgerAccountDTO) => createLedgerAccount(data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['accounting', 'accounts'] }); toast.success('Hesap oluşturuldu.'); },
    onError: (e: unknown) => toast.error(getErrorMessage(e)),
  });
}

// ── Fiscal Periods ───────────────────────────

export function useFiscalPeriods() {
  return useQuery({ queryKey: KEYS.periods, queryFn: getFiscalPeriods });
}

export function useCreateFiscalPeriod() {
  const qc = useQueryClient();
  const { toast } = useUIStore();
  return useMutation({
    mutationFn: (data: CreateFiscalPeriodDTO) => createFiscalPeriod(data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: KEYS.periods }); toast.success('Mali dönem oluşturuldu.'); },
    onError: (e: unknown) => toast.error(getErrorMessage(e)),
  });
}

export function useCloseFiscalPeriod(id: string) {
  const qc = useQueryClient();
  const { toast } = useUIStore();
  return useMutation({
    mutationFn: () => closeFiscalPeriod(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: KEYS.periods }); toast.success('Dönem kapatıldı.'); },
    onError: (e: unknown) => toast.error(getErrorMessage(e)),
  });
}

// ── Journal Entries ──────────────────────────

export function useJournalEntries(params: JournalEntryListParams) {
  return useQuery({ queryKey: KEYS.entries(params), queryFn: () => getJournalEntries(params) });
}

export function useJournalEntry(id: string) {
  return useQuery({ queryKey: KEYS.entry(id), queryFn: () => getJournalEntryById(id), enabled: !!id });
}

export function useCreateJournalEntry() {
  const qc = useQueryClient();
  const { toast } = useUIStore();
  return useMutation({
    mutationFn: (data: CreateJournalEntryDTO) => createJournalEntry(data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['accounting', 'journal-entries'] }); toast.success('Yevmiye fişi oluşturuldu.'); },
    onError: (e: unknown) => toast.error(getErrorMessage(e)),
  });
}

export function usePostJournalEntry(id: string) {
  const qc = useQueryClient();
  const { toast } = useUIStore();
  return useMutation({
    mutationFn: () => postJournalEntry(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['accounting', 'journal-entries'] });
      qc.invalidateQueries({ queryKey: KEYS.entry(id) });
      toast.success('Fiş onaylandı.');
    },
    onError: (e: unknown) => toast.error(getErrorMessage(e)),
  });
}

// ── Bank / Cash Accounts ─────────────────────

export function useBankAccounts() {
  return useQuery({ queryKey: KEYS.bankAccounts, queryFn: getBankAccounts, staleTime: 5 * 60 * 1000 });
}

export function useCreateBankAccount() {
  const qc = useQueryClient();
  const { toast } = useUIStore();
  return useMutation({
    mutationFn: (data: CreateBankAccountDTO) => createBankAccount(data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: KEYS.bankAccounts }); toast.success('Banka hesabı oluşturuldu.'); },
    onError: (e: unknown) => toast.error(getErrorMessage(e)),
  });
}

export function useCashAccounts() {
  return useQuery({ queryKey: KEYS.cashAccounts, queryFn: getCashAccounts, staleTime: 5 * 60 * 1000 });
}

export function useCreateCashAccount() {
  const qc = useQueryClient();
  const { toast } = useUIStore();
  return useMutation({
    mutationFn: (data: CreateCashAccountDTO) => createCashAccount(data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: KEYS.cashAccounts }); toast.success('Kasa hesabı oluşturuldu.'); },
    onError: (e: unknown) => toast.error(getErrorMessage(e)),
  });
}

// ── Payments ─────────────────────────────────

export function usePayments(params: PaymentListParams) {
  return useQuery({ queryKey: KEYS.payments(params), queryFn: () => getPayments(params) });
}

export function usePayment(id: string) {
  return useQuery({ queryKey: KEYS.payment(id), queryFn: () => getPaymentById(id), enabled: !!id });
}

export function useCreatePayment() {
  const qc = useQueryClient();
  const { toast } = useUIStore();
  return useMutation({
    mutationFn: (data: CreatePaymentDTO) => createPayment(data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['payments'] }); toast.success('Ödeme kaydedildi.'); },
    onError: (e: unknown) => toast.error(getErrorMessage(e)),
  });
}
