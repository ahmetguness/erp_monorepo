'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useUIStore } from '@/store/ui.store';
import { getErrorMessage } from '@/types/api.types';
import {
  executeReprice,
  getRepricingAnalysis,
  getStockAllocations,
  reallocateStock,
  runBatchRepricingScan,
} from '@/services/marketplace.pricing.service';

export function useRepricingAnalysis() {
  return useQuery({
    queryKey: ['marketplace-pricing', 'analysis'],
    queryFn: () => getRepricingAnalysis(),
  });
}

export function useStockAllocations() {
  return useQuery({
    queryKey: ['marketplace-pricing', 'allocations'],
    queryFn: () => getStockAllocations(),
  });
}

export function useExecuteReprice() {
  const qc = useQueryClient();
  const { toast } = useUIStore();

  return useMutation({
    mutationFn: ({ listingId, targetPrice }: { listingId: string; targetPrice?: number }) =>
      executeReprice(listingId, targetPrice),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['marketplace-pricing'] });
      qc.invalidateQueries({ queryKey: ['marketplace-listings'] });
      toast.success(`İlan fiyatı ${data.newPrice} TRY olarak başarıyla güncellendi!`);
    },
    onError: (err: unknown) => toast.error(getErrorMessage(err)),
  });
}

export function useReallocateStock() {
  const qc = useQueryClient();
  const { toast } = useUIStore();

  return useMutation({
    mutationFn: (productId: string) => reallocateStock(productId),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['marketplace-pricing'] });
      toast.success(data.message);
    },
    onError: (err: unknown) => toast.error(getErrorMessage(err)),
  });
}

export function useRunBatchRepricingScan() {
  const qc = useQueryClient();
  const { toast } = useUIStore();

  return useMutation({
    mutationFn: (autoApply: boolean = true) => runBatchRepricingScan(autoApply),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['marketplace-pricing'] });
      toast.success(
        `Otonom Repricing Taraması Tamamlandı! ${data.totalListingsScanned} ilan tarandı, ${data.updatedCount} ilan fiyatı otomatik güncellendi.`,
      );
    },
    onError: (err: unknown) => toast.error(getErrorMessage(err)),
  });
}
