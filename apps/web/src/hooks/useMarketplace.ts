'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useUIStore } from '@/store/ui.store';
import { getErrorMessage } from '@/types/api.types';
import * as svc from '@/services/marketplace.service';

// ─── Integrations ─────────────────────────────

export function useIntegrations() {
  return useQuery({ queryKey: ['mp-integrations'], queryFn: svc.getIntegrations });
}

export function useIntegration(id: string) {
  return useQuery({ queryKey: ['mp-integrations', id], queryFn: () => svc.getIntegration(id), enabled: !!id });
}

export function useCreateIntegration() {
  const qc = useQueryClient();
  const { toast } = useUIStore();
  return useMutation({
    mutationFn: svc.createIntegration,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['mp-integrations'] }); toast.success('Entegrasyon oluşturuldu.'); },
    onError: (e: unknown) => toast.error(getErrorMessage(e)),
  });
}

export function useUpdateIntegration() {
  const qc = useQueryClient();
  const { toast } = useUIStore();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Parameters<typeof svc.updateIntegration>[1] }) => svc.updateIntegration(id, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['mp-integrations'] }); toast.success('Entegrasyon güncellendi.'); },
    onError: (e: unknown) => toast.error(getErrorMessage(e)),
  });
}

export function useDeleteIntegration() {
  const qc = useQueryClient();
  const { toast } = useUIStore();
  return useMutation({
    mutationFn: svc.deleteIntegration,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['mp-integrations'] }); toast.success('Entegrasyon silindi.'); },
    onError: (e: unknown) => toast.error(getErrorMessage(e)),
  });
}

// ─── Listings ─────────────────────────────────

export function useListings(params?: { page?: number; limit?: number; integrationId?: string }) {
  return useQuery({ queryKey: ['mp-listings', params], queryFn: () => svc.getListings(params) });
}

export function useCreateListing() {
  const qc = useQueryClient();
  const { toast } = useUIStore();
  return useMutation({
    mutationFn: svc.createListing,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['mp-listings'] }); toast.success('Listeleme oluşturuldu.'); },
    onError: (e: unknown) => toast.error(getErrorMessage(e)),
  });
}

export function useUpdateListing() {
  const qc = useQueryClient();
  const { toast } = useUIStore();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Parameters<typeof svc.updateListing>[1] }) => svc.updateListing(id, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['mp-listings'] }); toast.success('Listeleme güncellendi.'); },
    onError: (e: unknown) => toast.error(getErrorMessage(e)),
  });
}

export function useDeleteListing() {
  const qc = useQueryClient();
  const { toast } = useUIStore();
  return useMutation({
    mutationFn: svc.deleteListing,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['mp-listings'] }); toast.success('Listeleme silindi.'); },
    onError: (e: unknown) => toast.error(getErrorMessage(e)),
  });
}

export function usePublishListingToMarketplace() {
  const qc = useQueryClient();
  const { toast } = useUIStore();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Parameters<typeof svc.publishListingToMarketplace>[1] }) =>
      svc.publishListingToMarketplace(id, data),
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: ['mp-listings'] });
      toast.success(`Ürün pazaryerine gönderildi. Batch: ${result.batchRequestId}`);
    },
    onError: (e: unknown) => toast.error(getErrorMessage(e)),
  });
}

export function useUpdateMarketplaceProduct() {
  const qc = useQueryClient();
  const { toast } = useUIStore();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Parameters<typeof svc.updateMarketplaceProduct>[1] }) =>
      svc.updateMarketplaceProduct(id, data),
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: ['mp-listings'] });
      toast.success(`Pazaryeri ürünü güncellendi. Batch: ${result.batchRequestId}`);
    },
    onError: (e: unknown) => toast.error(getErrorMessage(e)),
  });
}

export function useDeleteMarketplaceProduct() {
  const qc = useQueryClient();
  const { toast } = useUIStore();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data?: Parameters<typeof svc.deleteMarketplaceProduct>[1] }) =>
      svc.deleteMarketplaceProduct(id, data),
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: ['mp-listings'] });
      toast.success(`Pazaryeri silme isteği gönderildi. Batch: ${result.batchRequestId}`);
    },
    onError: (e: unknown) => toast.error(getErrorMessage(e)),
  });
}

export function useTrendyolCategories(integrationId: string, query: string) {
  return useQuery({
    queryKey: ['mp-trendyol-categories', integrationId, query],
    queryFn: () => svc.searchTrendyolCategories(integrationId, query),
    enabled: !!integrationId,
  });
}

export function useTrendyolBrands(integrationId: string, query: string) {
  return useQuery({
    queryKey: ['mp-trendyol-brands', integrationId, query],
    queryFn: () => svc.searchTrendyolBrands(integrationId, query),
    enabled: !!integrationId && query.trim().length >= 2,
  });
}

export function useTrendyolAttributes(integrationId: string, categoryId: number | null) {
  return useQuery({
    queryKey: ['mp-trendyol-attributes', integrationId, categoryId],
    queryFn: () => svc.getTrendyolAttributes(integrationId, categoryId ?? 0),
    enabled: !!integrationId && categoryId !== null,
  });
}

export function useTrendyolCargoProviders(integrationId: string) {
  return useQuery({
    queryKey: ['mp-trendyol-cargo-providers', integrationId],
    queryFn: () => svc.getTrendyolCargoProviders(integrationId),
    enabled: !!integrationId,
  });
}

// ─── Orders ───────────────────────────────────

export function useMarketplaceOrders(params?: { page?: number; limit?: number; status?: string; channel?: string }) {
  return useQuery({ queryKey: ['mp-orders', params], queryFn: () => svc.getOrders(params) });
}

export function useMarketplaceOrder(id: string) {
  return useQuery({ queryKey: ['mp-orders', id], queryFn: () => svc.getOrder(id), enabled: !!id });
}

export function useChangeOrderStatus() {
  const qc = useQueryClient();
  const { toast } = useUIStore();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: { status: string } }) => svc.changeOrderStatus(id, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['mp-orders'] }); toast.success('Sipariş durumu güncellendi.'); },
    onError: (e: unknown) => toast.error(getErrorMessage(e)),
  });
}

export function useDeleteMarketplaceOrder() {
  const qc = useQueryClient();
  const { toast } = useUIStore();
  return useMutation({
    mutationFn: (id: string) => svc.deleteOrder(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['mp-orders'] }); toast.success('Sipariş silindi.'); },
    onError: (e: unknown) => toast.error(getErrorMessage(e)),
  });
}

// ─── Monitoring ───────────────────────────────

export function useMarketplaceHealthCenter() {
  return useQuery({ queryKey: ['mp-health-center'], queryFn: svc.getMarketplaceHealthCenter });
}

export function useSyncJobs(params?: { page?: number; limit?: number; integrationId?: string; status?: string; jobType?: string }) {
  return useQuery({ queryKey: ['mp-sync-jobs', params], queryFn: () => svc.getSyncJobs(params) });
}

export function useSyncJob(id: string) {
  return useQuery({
    queryKey: ['mp-sync-jobs', id],
    queryFn: () => svc.getSyncJob(id),
    enabled: !!id,
    refetchInterval: (query) => {
      const data = query.state.data;
      if (data && (data.status === 'DONE' || data.status === 'FAILED')) return false;
      return 3_000; // poll every 3s while PENDING/RUNNING
    },
  });
}

export function useRetrySyncJob() {
  const qc = useQueryClient();
  const { toast } = useUIStore();
  return useMutation({
    mutationFn: (id: string) => svc.retrySyncJob(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['mp-sync-jobs'] });
      qc.invalidateQueries({ queryKey: ['mp-integrations'] });
      toast.success('Sync job tekrar kuyruğa alındı.');
    },
    onError: (e: unknown) => toast.error(getErrorMessage(e)),
  });
}

export function useWebhookEvents(params?: { page?: number; limit?: number; integrationId?: string; eventType?: string; processed?: string }) {
  return useQuery({ queryKey: ['mp-webhook-events', params], queryFn: () => svc.getWebhookEvents(params) });
}

export function useWebhookEvent(id: string) {
  return useQuery({ queryKey: ['mp-webhook-events', id], queryFn: () => svc.getWebhookEvent(id), enabled: !!id });
}

export function useReplayWebhookEvent() {
  const qc = useQueryClient();
  const { toast } = useUIStore();
  return useMutation({
    mutationFn: (id: string) => svc.replayWebhookEvent(id),
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: ['mp-webhook-events'] });
      qc.invalidateQueries({ queryKey: ['mp-health-center'] });
      qc.invalidateQueries({ queryKey: ['mp-orders'] });
      toast.success(`Webhook replay tamamlandi. Islenen: ${result.replayed}, hata: ${result.failed}`);
    },
    onError: (e: unknown) => toast.error(getErrorMessage(e)),
  });
}

export function useListingSnapshots(params?: { page?: number; limit?: number; integrationId?: string }) {
  return useQuery({ queryKey: ['mp-listing-snapshots', params], queryFn: () => svc.getListingSnapshots(params) });
}

export function useDriftReport(params?: { integrationId?: string }) {
  return useQuery({ queryKey: ['mp-drift-report', params], queryFn: () => svc.getDriftReport(params) });
}
