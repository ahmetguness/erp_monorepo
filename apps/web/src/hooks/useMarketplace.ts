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
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Parameters<typeof svc.updateListing>[1] }) => svc.updateListing(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['mp-listings'] }),
  });
}

export function useDeleteListing() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: svc.deleteListing,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['mp-listings'] }),
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
