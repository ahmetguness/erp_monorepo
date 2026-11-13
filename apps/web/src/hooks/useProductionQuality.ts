import { useMutation, useQueryClient } from '@tanstack/react-query';
import { decideProductionQuality, type QualityDecisionInput } from '@/services/production-quality.service';
import { useUIStore } from '@/store/ui.store';
import { getErrorMessage } from '@/types/api.types';

export function useProductionQuality(id: string) {
  const client = useQueryClient();
  const { toast } = useUIStore();
  return useMutation({
    mutationFn: (input: QualityDecisionInput) => decideProductionQuality(id, input),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ['work-orders'] });
      void client.invalidateQueries({ queryKey: ['quality-control'] });
      toast.success('Kalite kararı kaydedildi.');
    },
    onError: (error: unknown) => toast.error(getErrorMessage(error)),
  });
}
