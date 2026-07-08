'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useUIStore } from '@/store/ui.store';
import { getErrorMessage } from '@/types/api.types';
import {
  getBankTransactions, createBankTransaction, matchBankTransaction, getBankTransactionMatchSuggestions, approveBankTransactionMatch,
  type ListParams, type CreateBankTransactionDTO, type BankTransactionMatchTargetType,
} from '@/services/bank-transaction.service';

const KEYS = {
  list: (p: ListParams) => ['bank-transactions', p] as const,
  suggestions: (id: string) => ['bank-transactions', id, 'match-suggestions'] as const,
};

export function useBankTransactions(params: ListParams) {
  return useQuery({ queryKey: KEYS.list(params), queryFn: () => getBankTransactions(params) });
}
export function useCreateBankTransaction() {
  const qc = useQueryClient(); const { toast } = useUIStore();
  return useMutation({
    mutationFn: (data: CreateBankTransactionDTO) => createBankTransaction(data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['bank-transactions'] }); toast.success('Banka hareketi oluşturuldu.'); },
    onError: (e: unknown) => toast.error(getErrorMessage(e)),
  });
}
export function useMatchBankTransaction() {
  const qc = useQueryClient(); const { toast } = useUIStore();
  return useMutation({
    mutationFn: ({ id, refType, refId }: { id: string; refType: string; refId: string }) => matchBankTransaction(id, refType, refId),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['bank-transactions'] }); toast.success('Hareket eşleştirildi.'); },
    onError: (e: unknown) => toast.error(getErrorMessage(e)),
  });
}

export function useBankTransactionMatchSuggestions(id?: string) {
  return useQuery({
    queryKey: id ? KEYS.suggestions(id) : ['bank-transactions', 'match-suggestions', 'idle'],
    queryFn: () => getBankTransactionMatchSuggestions(id ?? ''),
    enabled: Boolean(id),
  });
}

export function useApproveBankTransactionMatch() {
  const qc = useQueryClient(); const { toast } = useUIStore();
  return useMutation({
    mutationFn: ({ id, refType, refId }: { id: string; refType: BankTransactionMatchTargetType; refId: string }) =>
      approveBankTransactionMatch(id, refType, refId),
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ['bank-transactions'] });
      qc.invalidateQueries({ queryKey: KEYS.suggestions(variables.id) });
      toast.success('Eşleştirme onaylandı.');
    },
    onError: (e: unknown) => toast.error(getErrorMessage(e)),
  });
}
