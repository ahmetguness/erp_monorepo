'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useUIStore } from '@/store/ui.store';
import { getErrorMessage } from '@/types/api.types';
import {
  getReservations,
  createReservation,
  releaseReservation,
  createReservationsFromSalesOrder,
  getReservationReport,
  releaseExpiredReservations,
  type ListParams,
  type CreateReservationDTO,
  type CreateSalesOrderReservationDTO,
} from '@/services/inventory-reservation.service';

const KEYS = {
  list: (p: ListParams) => ['reservations', p] as const,
  report: ['reservations', 'report'] as const,
};

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

export function useReservationReport() {
  return useQuery({ queryKey: KEYS.report, queryFn: getReservationReport });
}

export function useCreateReservationsFromSalesOrder() {
  const qc = useQueryClient(); const { toast } = useUIStore();
  return useMutation({
    mutationFn: (data: CreateSalesOrderReservationDTO) => createReservationsFromSalesOrder(data),
    onSuccess: (result) => {
      invalidateReservationStockQueries(qc);
      toast.success(`${result.createdCount} rezervasyon oluşturuldu.`);
    },
    onError: (e: unknown) => toast.error(getErrorMessage(e)),
  });
}

export function useReleaseExpiredReservations() {
  const qc = useQueryClient(); const { toast } = useUIStore();
  return useMutation({
    mutationFn: releaseExpiredReservations,
    onSuccess: (result) => {
      invalidateReservationStockQueries(qc);
      toast.success(`${result.releasedCount} süresi aşan rezervasyon serbest bırakıldı.`);
    },
    onError: (e: unknown) => toast.error(getErrorMessage(e)),
  });
}
