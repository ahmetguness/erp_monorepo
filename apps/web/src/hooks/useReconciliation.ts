'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useUIStore } from '@/store/ui.store';
import { getErrorMessage } from '@/types/api.types';
import {
  getReconciliations, getReconciliationById, createReconciliation, addReconciliationLine, finalizeReconciliation,
  type ListParams, type CreateReconciliationDTO, type AddLineDTO,
} from '@/services/reconciliation.service';

const KEYS = {
  list: (p: ListParams) => ['reconciliations', p] as const,
  detail: (id: string) => ['reconciliations', id] as const,
};

export function useReconciliations(params: ListParams) {
  return useQuery({ queryKey: KEYS.list(params), queryFn: () => getReconciliations(params) });
}
export function useReconciliation(id: string) {
  return useQuery({ queryKey: KEYS.detail(id), queryFn: () => getReconciliationById(id), enabled: !!id });
}
export function useCreateReconciliation() {
  const qc = useQueryClient(); const { toast } = useUIStore();
  return useMutation({
    mutationFn: (data: CreateReconciliationDTO) => createReconciliation(data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['reconciliations'] }); toast.success('Mutabakat oluşturuldu.'); },
    onError: (e: unknown) => toast.error(getErrorMessage(e)),
  });
}
export function useAddReconciliationLine() {
  const qc = useQueryClient(); const { toast } = useUIStore();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: AddLineDTO }) => addReconciliationLine(id, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['reconciliations'] }); toast.success('Satır eklendi.'); },
    onError: (e: unknown) => toast.error(getErrorMessage(e)),
  });
}
export function useFinalizeReconciliation() {
  const qc = useQueryClient(); const { toast } = useUIStore();
  return useMutation({
    mutationFn: (id: string) => finalizeReconciliation(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['reconciliations'] }); toast.success('Mutabakat tamamlandı.'); },
    onError: (e: unknown) => toast.error(getErrorMessage(e)),
  });
}
