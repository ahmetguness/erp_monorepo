'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getErrorMessage } from '@/types/api.types';
import { useUIStore } from '@/store/ui.store';
import {
  currentMonthKey,
  getMonthlySalesTarget,
  updateMonthlySalesTarget,
  type UpdateSalesTargetInput,
} from '@/services/sales-target.service';

interface QueryOptions {
  enabled?: boolean;
}

export const SALES_TARGET_QUERY_KEYS = {
  monthly: (month: string) => ['sales-targets', 'monthly', month] as const,
};

export function useMonthlySalesTarget(month = currentMonthKey(), options?: QueryOptions) {
  return useQuery({
    queryKey: SALES_TARGET_QUERY_KEYS.monthly(month),
    queryFn: () => getMonthlySalesTarget(month),
    enabled: options?.enabled ?? true,
  });
}

export function useUpdateMonthlySalesTarget() {
  const qc = useQueryClient();
  const { toast } = useUIStore();

  return useMutation({
    mutationFn: (input: UpdateSalesTargetInput) => updateMonthlySalesTarget(input),
    onSuccess: (target) => {
      qc.invalidateQueries({ queryKey: SALES_TARGET_QUERY_KEYS.monthly(target.month) });
      toast.success('Satış hedefi güncellendi.');
    },
    onError: (error: unknown) => toast.error(getErrorMessage(error)),
  });
}
