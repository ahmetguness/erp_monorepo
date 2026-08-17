'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useUIStore } from '@/store/ui.store';
import { getErrorMessage } from '@/types/api.types';
import {
  getPredictiveMaintenance,
  getWorkCenterCapacity,
  reserveMaintenanceParts,
  runScheduleOptimization,
} from '@/services/production.autonomy.service';

export function useWorkCenterCapacity() {
  return useQuery({
    queryKey: ['production-autonomy', 'capacity'],
    queryFn: () => getWorkCenterCapacity(),
  });
}

export function usePredictiveMaintenance() {
  return useQuery({
    queryKey: ['production-autonomy', 'maintenance'],
    queryFn: () => getPredictiveMaintenance(),
  });
}

export function useRunScheduleOptimization() {
  const qc = useQueryClient();
  const { toast } = useUIStore();

  return useMutation({
    mutationFn: (autoReschedule: boolean = true) => runScheduleOptimization(autoReschedule),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['production-autonomy'] });
      qc.invalidateQueries({ queryKey: ['work-orders'] });
      toast.success(
        `Otonom Üretim Çizelgelemesi Tamamlandı! ${data.rescheduledCount} iş emri sıralandı, ${data.estimatedTimeSavedHours} saat verim kazanıldı.`,
      );
    },
    onError: (err: unknown) => toast.error(getErrorMessage(err)),
  });
}

export function useReserveMaintenanceParts() {
  const qc = useQueryClient();
  const { toast } = useUIStore();

  return useMutation({
    mutationFn: ({ workCenterId, productId, quantity }: { workCenterId: string; productId: string; quantity: number }) =>
      reserveMaintenanceParts(workCenterId, productId, quantity),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['production-autonomy'] });
      qc.invalidateQueries({ queryKey: ['reservations'] });
      toast.success(data.message);
    },
    onError: (err: unknown) => toast.error(getErrorMessage(err)),
  });
}
