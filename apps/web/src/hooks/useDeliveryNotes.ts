'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useUIStore } from '@/store/ui.store';
import { getErrorMessage } from '@/types/api.types';
import {
  getDeliveryNotes, getDeliveryNoteById, createDeliveryNote, updateDeliveryNoteStatus,
  type ListParams, type CreateDeliveryNoteDTO, type DeliveryNoteStatus,
} from '@/services/delivery-note.service';

const KEYS = {
  list: (p: ListParams) => ['delivery-notes', p] as const,
  detail: (id: string) => ['delivery-notes', id] as const,
};

export function useDeliveryNotes(params: ListParams) {
  return useQuery({ queryKey: KEYS.list(params), queryFn: () => getDeliveryNotes(params) });
}
export function useDeliveryNote(id: string) {
  return useQuery({ queryKey: KEYS.detail(id), queryFn: () => getDeliveryNoteById(id), enabled: !!id });
}
export function useCreateDeliveryNote() {
  const qc = useQueryClient(); const { toast } = useUIStore();
  return useMutation({
    mutationFn: (data: CreateDeliveryNoteDTO) => createDeliveryNote(data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['delivery-notes'] }); toast.success('İrsaliye oluşturuldu.'); },
    onError: (e: unknown) => toast.error(getErrorMessage(e)),
  });
}
export function useUpdateDeliveryNoteStatus() {
  const qc = useQueryClient(); const { toast } = useUIStore();
  return useMutation({
    mutationFn: ({ id, status, shippedAt, deliveredAt }: { id: string; status: DeliveryNoteStatus; shippedAt?: string; deliveredAt?: string }) =>
      updateDeliveryNoteStatus(id, status, { shippedAt, deliveredAt }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['delivery-notes'] }); toast.success('İrsaliye durumu güncellendi.'); },
    onError: (e: unknown) => toast.error(getErrorMessage(e)),
  });
}
