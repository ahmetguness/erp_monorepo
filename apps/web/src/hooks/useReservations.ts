'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useUIStore } from '@/store/ui.store';
import { getErrorMessage } from '@/types/api.types';
import { getReservations, createReservation, releaseReservation, type ListParams, type CreateReservationDTO } from '@/services/inventory-reservation.service';

const KEYS = { list: (p: ListParams) => ['reservations', p] as const };

function invalidateReservationStockQueries(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ['reservations'] });
  qc.invalidateQueries({ queryKey: ['stock'] });
}

export function useReservations(params: ListParams) {
  return useQuery({ queryKey: KEYS.list(params), queryFn: () => getReservations(params) });
}
export function useCreateReservation() {
  const qc = useQueryClient(); const { toast } = useUIStore();
  return useMutation({
    mutationFn: (data: CreateReservationDTO) => createReservation(data),
    onSuccess: () => { invalidateReservationStockQueries(qc); toast.success('Rezervasyon oluşturuldu.'); },
    onError: (e: unknown) => toast.error(getErrorMessage(e)),
  });
}
export function useReleaseReservation() {
  const qc = useQueryClient(); const { toast } = useUIStore();
  return useMutation({
    mutationFn: (id: string) => releaseReservation(id),
    onSuccess: () => { invalidateReservationStockQueries(qc); toast.success('Rezervasyon serbest bırakıldı.'); },
    onError: (e: unknown) => toast.error(getErrorMessage(e)),
  });
}
