'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useUIStore } from '@/store/ui.store';
import { getErrorMessage } from '@/types/api.types';
import {
  getMarketplaceAutomationSummary,
  getMarketplaceAutomationPolicy,
  updateMarketplaceAutomationPolicy,
  triggerOrderAutomation,
  triggerStockSync,
  type MarketplaceAutomationPolicy,
} from '@/services/marketplace.automation.service';

export function useMarketplaceAutomationSummary() {
  return useQuery({
    queryKey: ['marketplace', 'automation', 'summary'],
    queryFn: getMarketplaceAutomationSummary,
    refetchInterval: 30 * 1000,
  });
}

export function useMarketplaceAutomationPolicy() {
  return useQuery({
    queryKey: ['marketplace', 'automation', 'policy'],
    queryFn: getMarketplaceAutomationPolicy,
  });
}

export function useUpdateMarketplaceAutomationPolicy() {
  const qc = useQueryClient();
  const { toast } = useUIStore();

  return useMutation({
    mutationFn: (data: Partial<MarketplaceAutomationPolicy>) => updateMarketplaceAutomationPolicy(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['marketplace', 'automation'] });
      toast.success('Pazaryeri otomasyon politikası güncellendi.');
    },
    onError: (err: unknown) => toast.error(getErrorMessage(err)),
  });
}

export function useTriggerOrderAutomation() {
  const qc = useQueryClient();
  const { toast } = useUIStore();

  return useMutation({
    mutationFn: (id: string) => triggerOrderAutomation(id),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['marketplace'] });
      if (res.errors.length > 0) {
        toast.warning(`Sipariş otomasyonu tamamlandı ancak uyarısı var: ${res.errors.join(', ')}`);
      } else {
        toast.success(`Sipariş otomasyon boru hattı çalıştırıldı. (#${res.externalId})`);
      }
    },
    onError: (err: unknown) => toast.error(getErrorMessage(err)),
  });
}

export function useTriggerStockSync() {
  const qc = useQueryClient();
  const { toast } = useUIStore();

  return useMutation({
    mutationFn: (productId: string) => triggerStockSync(productId),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['marketplace'] });
      toast.success(`${res.syncedListings} pazaryeri ilanının stoku güncellendi.`);
    },
    onError: (err: unknown) => toast.error(getErrorMessage(err)),
  });
}
