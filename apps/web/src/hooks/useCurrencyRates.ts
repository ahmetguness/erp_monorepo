'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useUIStore } from '@/store/ui.store';
import { getErrorMessage } from '@/types/api.types';
import {
  createCurrencyRate,
  getCurrencyRates,
  getTcmbRates,
  type CreateCurrencyRateDTO,
  type CurrencyRateListParams,
} from '@/services/currency-rates.service';

export function useTcmbRates() {
  return useQuery({
    queryKey: ['currency-rates', 'tcmb'],
    queryFn: getTcmbRates,
    staleTime: 15 * 60 * 1000,
  });
}

export function useCurrencyRates(params?: CurrencyRateListParams) {
  return useQuery({
    queryKey: ['currency-rates', params],
    queryFn: () => getCurrencyRates(params),
  });
}

export function useCreateCurrencyRate() {
  const qc = useQueryClient();
  const { toast } = useUIStore();
  return useMutation({
    mutationFn: (data: CreateCurrencyRateDTO) => createCurrencyRate(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['currency-rates'] });
      toast.success('Kur kaydedildi.');
    },
    onError: (e: unknown) => toast.error(getErrorMessage(e)),
  });
}
