'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useUIStore } from '@/store/ui.store';
import { getErrorMessage } from '@/types/api.types';
import {
  getCheckPromissoryNotes, createCheckPromissory, updateCheckStatus,
  type ListParams, type CreateCheckPromissoryDTO, type CheckStatus,
} from '@/services/check-promissory.service';

const KEYS = { list: (p: ListParams) => ['check-promissory', p] as const };

export function useCheckPromissoryNotes(params: ListParams) {
  return useQuery({ queryKey: KEYS.list(params), queryFn: () => getCheckPromissoryNotes(params) });
}
export function useCreateCheckPromissory() {
  const qc = useQueryClient(); const { toast } = useUIStore();
  return useMutation({
    mutationFn: (data: CreateCheckPromissoryDTO) => createCheckPromissory(data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['check-promissory'] }); toast.success('Çek/Senet oluşturuldu.'); },
    onError: (e: unknown) => toast.error(getErrorMessage(e)),
  });
}
export function useUpdateCheckStatus() {
  const qc = useQueryClient(); const { toast } = useUIStore();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: CheckStatus }) => updateCheckStatus(id, status),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['check-promissory'] }); toast.success('Durum güncellendi.'); },
    onError: (e: unknown) => toast.error(getErrorMessage(e)),
  });
}
