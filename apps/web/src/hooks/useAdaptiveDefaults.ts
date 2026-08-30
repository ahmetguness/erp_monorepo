'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  dismissAdaptiveDefault,
  getAdaptiveDefaults,
  resetAdaptiveDefaults,
  type AdaptiveDefaultField,
  type AdaptiveTransactionType,
} from '@/services/adaptive-defaults.service';
import { useUIStore } from '@/store/ui.store';
import { getErrorMessage } from '@/types/api.types';

const adaptiveDefaultsKey = (transactionType: AdaptiveTransactionType, contactId?: string) => ['adaptive-defaults', 'invoice', transactionType, contactId ?? 'all'] as const;

export function useAdaptiveDefaults(transactionType: AdaptiveTransactionType, contactId?: string) {
  return useQuery({
    queryKey: adaptiveDefaultsKey(transactionType, contactId),
    queryFn: () => getAdaptiveDefaults({ transactionType, contactId }),
    staleTime: 60_000,
  });
}

export function useDismissAdaptiveDefault() {
  const queryClient = useQueryClient();
  const { toast } = useUIStore();
  return useMutation({
    mutationFn: (field: AdaptiveDefaultField) => dismissAdaptiveDefault(field),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['adaptive-defaults'] });
      toast.success('Bu öneri tekrar gösterilmeyecek.');
    },
    onError: (error: unknown) => toast.error(getErrorMessage(error)),
  });
}

export function useResetAdaptiveDefaults() {
  const queryClient = useQueryClient();
  const { toast } = useUIStore();
  return useMutation({
    mutationFn: resetAdaptiveDefaults,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['adaptive-defaults'] });
      toast.success('Öğrenilmiş tercih gizlemeleri sıfırlandı.');
    },
    onError: (error: unknown) => toast.error(getErrorMessage(error)),
  });
}
