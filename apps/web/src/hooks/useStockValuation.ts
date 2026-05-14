'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useUIStore } from '@/store/ui.store';
import { getErrorMessage } from '@/types/api.types';
import { createStockValuation, getStockValuations, type CreateStockValuationDTO, type ListParams } from '@/services/stock-valuation.service';

export function useStockValuations(params: ListParams) {
  return useQuery({ queryKey: ['stock-valuations', params], queryFn: () => getStockValuations(params) });
}

export function useCreateStockValuation() {
  const qc = useQueryClient();
  const { toast } = useUIStore();
  return useMutation({
    mutationFn: (data: CreateStockValuationDTO) => createStockValuation(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['stock-valuations'] });
      toast.success('Stok değerleme kaydı oluşturuldu.');
    },
    onError: (e: unknown) => toast.error(getErrorMessage(e)),
  });
}
