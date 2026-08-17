'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useUIStore } from '@/store/ui.store';
import { getErrorMessage } from '@/types/api.types';
import { resolveExceptionItem, runIntegrityScan } from '@/services/integrity.automation.service';

export function useRunIntegrityScan() {
  const qc = useQueryClient();
  const { toast } = useUIStore();

  return useMutation({
    mutationFn: (autoFix: boolean = true) => runIntegrityScan(autoFix),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['operations'] });
      qc.invalidateQueries({ queryKey: ['integrity'] });
      toast.success(
        `Veri Bütünlüğü Taraması Tamamlandı! ${data.totalAnomaliesFound} uyumsuzluk bulundu, ${data.autoFixedCount} adet otomatik düzeltildi (Self-Healing).`,
      );
    },
    onError: (err: unknown) => toast.error(getErrorMessage(err)),
  });
}

export function useResolveExceptionItem() {
  const qc = useQueryClient();
  const { toast } = useUIStore();

  return useMutation({
    mutationFn: ({ id, notes }: { id: string; notes?: string }) => resolveExceptionItem(id, notes),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['integrity'] });
      toast.success(data.message);
    },
    onError: (err: unknown) => toast.error(getErrorMessage(err)),
  });
}
