'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useUIStore } from '@/store/ui.store';
import { getErrorMessage } from '@/types/api.types';
import { getFinanceOperationsWorkspace, runFinanceOperations, updateFinanceOperationsPolicy, type FinanceOperationsPolicy } from './finance-operations.service';

const KEY = ['finance', 'operations'] as const;
export function useFinanceOperationsWorkspace() { return useQuery({ queryKey: KEY, queryFn: getFinanceOperationsWorkspace, refetchInterval: 60_000 }); }
export function useUpdateFinanceOperationsPolicy() {
  const client = useQueryClient(); const { toast } = useUIStore();
  return useMutation({ mutationFn: (policy: FinanceOperationsPolicy) => updateFinanceOperationsPolicy(policy), onSuccess: () => { client.invalidateQueries({ queryKey: KEY }); toast.success('Finans operasyon politikası güncellendi.'); }, onError: (error: unknown) => toast.error(getErrorMessage(error)) });
}
export function useRunFinanceOperations() {
  const client = useQueryClient(); const { toast } = useUIStore();
  return useMutation({ mutationFn: runFinanceOperations, onSuccess: (result) => { client.setQueryData(KEY, result.workspace); toast.success(`${result.processed} normal finans kaydı otomatik işlendi.`); }, onError: (error: unknown) => toast.error(getErrorMessage(error)) });
}
