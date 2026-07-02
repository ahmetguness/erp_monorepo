'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useUIStore } from '@/store/ui.store';
import { getErrorMessage } from '@/types/api.types';
import {
  getLedgerAccounts, createLedgerAccount, getLedgerAccountById, updateLedgerAccount,
  getFiscalPeriods, createFiscalPeriod, closeFiscalPeriod, deleteFiscalPeriod, getFiscalPeriodClosingChecklist,
  getJournalEntries, getJournalEntryById, createJournalEntry, postJournalEntry,
  getBankAccounts, createBankAccount, updateBankAccount, deleteBankAccount,
  getCashAccounts, createCashAccount, updateCashAccount, deleteCashAccount,
  getPayments, getPaymentById, createPayment,
  type CreateLedgerAccountDTO, type UpdateLedgerAccountDTO, type CreateFiscalPeriodDTO,
  type CreateJournalEntryDTO, type JournalEntryListParams,
  type CreateBankAccountDTO, type UpdateBankAccountDTO, type CreateCashAccountDTO, type UpdateCashAccountDTO,
  type CreatePaymentDTO, type PaymentListParams, type AccountType,
} from '@/services/accounting.service';

const KEYS = {
  accounts: (p?: { type?: AccountType }) => ['accounting', 'accounts', p] as const,
  account: (id: string) => ['accounting', 'accounts', id] as const,
  periods: ['accounting', 'fiscal-periods'] as const,
  closingChecklist: (id: string) => ['accounting', 'fiscal-periods', id, 'closing-checklist'] as const,
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

export function useLedgerAccount(id: string) {
  return useQuery({ queryKey: KEYS.account(id), queryFn: () => getLedgerAccountById(id), enabled: !!id });
}

export function useUpdateLedgerAccount(id: string) {
  const qc = useQueryClient();
  const { toast } = useUIStore();
  return useMutation({
    mutationFn: (data: UpdateLedgerAccountDTO) => updateLedgerAccount(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['accounting', 'accounts'] });
      qc.invalidateQueries({ queryKey: KEYS.account(id) });
      toast.success('Hesap güncellendi.');
    },
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

export function useDeleteFiscalPeriod() {
  const qc = useQueryClient();
  const { toast } = useUIStore();
  return useMutation({
    mutationFn: (id: string) => deleteFiscalPeriod(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: KEYS.periods }); toast.success('Mali dönem silindi.'); },
    onError: (e: unknown) => toast.error(getErrorMessage(e)),
  });
}

export function useCloseFiscalPeriod(id: string) {
  const qc = useQueryClient();
  const { toast } = useUIStore();
  return useMutation({
    mutationFn: () => closeFiscalPeriod(id),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: KEYS.closingChecklist(id) });
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: KEYS.periods }); toast.success('Dönem kapatıldı.'); },
    onError: (e: unknown) => toast.error(getErrorMessage(e)),
  });
}

// ── Journal Entries ──────────────────────────

export function useFiscalPeriodClosingChecklist(periodId: string | null) {
  return useQuery({
    queryKey: KEYS.closingChecklist(periodId ?? ''),
    queryFn: () => getFiscalPeriodClosingChecklist(periodId ?? ''),
    enabled: !!periodId,
  });
}

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

export function useUpdateBankAccount(id: string) {
  const qc = useQueryClient();
  const { toast } = useUIStore();
  return useMutation({
    mutationFn: (data: UpdateBankAccountDTO) => updateBankAccount(id, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: KEYS.bankAccounts }); toast.success('Banka hesabı güncellendi.'); },
    onError: (e: unknown) => toast.error(getErrorMessage(e)),
  });
}

export function useDeleteBankAccount() {
  const qc = useQueryClient();
  const { toast } = useUIStore();
  return useMutation({
    mutationFn: (id: string) => deleteBankAccount(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: KEYS.bankAccounts }); toast.success('Banka hesabı silindi.'); },
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

export function useUpdateCashAccount(id: string) {
  const qc = useQueryClient();
  const { toast } = useUIStore();
  return useMutation({
    mutationFn: (data: UpdateCashAccountDTO) => updateCashAccount(id, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: KEYS.cashAccounts }); toast.success('Kasa hesabı güncellendi.'); },
    onError: (e: unknown) => toast.error(getErrorMessage(e)),
  });
}

export function useDeleteCashAccount() {
  const qc = useQueryClient();
  const { toast } = useUIStore();
  return useMutation({
    mutationFn: (id: string) => deleteCashAccount(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: KEYS.cashAccounts }); toast.success('Kasa hesabı silindi.'); },
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
