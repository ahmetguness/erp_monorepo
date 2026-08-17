'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useUIStore } from '@/store/ui.store';
import { getErrorMessage } from '@/types/api.types';
import {
  executeFinancialAction,
  generateCollectionSettlement,
  getCashFlowForecast,
  getContactPaymentVelocity,
  getLiquidityRecommendations,
} from '@/services/financial.autonomy.service';

export function useCashFlowForecast(days = 30) {
  return useQuery({
    queryKey: ['financial-autonomy', 'cash-flow', days],
    queryFn: () => getCashFlowForecast(days),
    staleTime: 60_000,
  });
}

export function useContactPaymentVelocity(contactId?: string) {
  return useQuery({
    queryKey: ['financial-autonomy', 'contact-velocity', contactId],
    queryFn: () => getContactPaymentVelocity(contactId!),
    enabled: !!contactId,
  });
}

export function useGenerateCollectionSettlement() {
  const qc = useQueryClient();
  const { toast } = useUIStore();

  return useMutation({
    mutationFn: (invoiceId: string) => generateCollectionSettlement(invoiceId),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['financial-autonomy'] });
      toast.success(`Fatura ${data.invoiceNumber} için %${data.suggestedDiscountPercent} indirimli ödeme bağlantısı üretildi!`);
    },
    onError: (err: unknown) => toast.error(getErrorMessage(err)),
  });
}

export function useLiquidityRecommendations() {
  return useQuery({
    queryKey: ['financial-autonomy', 'recommendations'],
    queryFn: () => getLiquidityRecommendations(),
  });
}

export function useExecuteFinancialAction() {
  const qc = useQueryClient();
  const { toast } = useUIStore();

  return useMutation({
    mutationFn: ({ actionType, payload }: { actionType: string; payload?: Record<string, unknown> }) =>
      executeFinancialAction(actionType, payload),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['financial-autonomy'] });
      toast.success(data.message);
    },
    onError: (err: unknown) => toast.error(getErrorMessage(err)),
  });
}
