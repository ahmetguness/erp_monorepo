'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useUIStore } from '@/store/ui.store';
import { getErrorMessage } from '@/types/api.types';
import { autoCompleteProduction, deriveWorkOrderStatus } from '@/services/production.automation.service';

export function useDeriveWorkOrderStatus() {
  const qc = useQueryClient();
  const { toast } = useUIStore();

  return useMutation({
    mutationFn: (id: string) => deriveWorkOrderStatus(id),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['work-orders'] });
      qc.invalidateQueries({ queryKey: ['production'] });
      toast.success(
        `İş Emri durumu üretim hareketlerinden otomatik türetildi: ${data.derivedStatus} (Hammaddeler rezerve edildi)`,
      );
    },
    onError: (err: unknown) => toast.error(getErrorMessage(err)),
  });
}

export function useAutoCompleteProduction() {
  const qc = useQueryClient();
  const { toast } = useUIStore();

  return useMutation({
    mutationFn: ({ id, outputQty }: { id: string; outputQty?: number }) =>
      autoCompleteProduction(id, outputQty),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['work-orders'] });
      qc.invalidateQueries({ queryKey: ['production'] });
      qc.invalidateQueries({ queryKey: ['inventory'] });
      toast.success('Üretim otomasyonu ile tamamlandı, mamül stok girişi ve muhasebe kaydı atıldı!');
    },
    onError: (err: unknown) => toast.error(getErrorMessage(err)),
  });
}
