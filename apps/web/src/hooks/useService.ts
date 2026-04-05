'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useUIStore } from '@/store/ui.store';
import { getErrorMessage } from '@/types/api.types';
import * as svc from '@/services/service.service';

// ─── Customer Assets ──────────────────────────

export function useCustomerAssets(params?: { page?: number; limit?: number; contactId?: string }) {
  return useQuery({ queryKey: ['customer-assets', params], queryFn: () => svc.getCustomerAssets(params) });
}

export function useCustomerAsset(id: string) {
  return useQuery({ queryKey: ['customer-assets', id], queryFn: () => svc.getCustomerAsset(id), enabled: !!id });
}

export function useCreateCustomerAsset() {
  const qc = useQueryClient();
  const { toast } = useUIStore();
  return useMutation({
    mutationFn: svc.createCustomerAsset,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['customer-assets'] }); toast.success('Varlık oluşturuldu.'); },
    onError: (e: unknown) => toast.error(getErrorMessage(e)),
  });
}

export function useUpdateCustomerAsset() {
  const qc = useQueryClient();
  const { toast } = useUIStore();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Parameters<typeof svc.updateCustomerAsset>[1] }) => svc.updateCustomerAsset(id, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['customer-assets'] }); toast.success('Varlık güncellendi.'); },
    onError: (e: unknown) => toast.error(getErrorMessage(e)),
  });
}

export function useDeleteCustomerAsset() {
  const qc = useQueryClient();
  const { toast } = useUIStore();
  return useMutation({
    mutationFn: svc.deleteCustomerAsset,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['customer-assets'] }); toast.success('Varlık silindi.'); },
    onError: (e: unknown) => toast.error(getErrorMessage(e)),
  });
}

// ─── Service Requests ─────────────────────────

export function useServiceRequests(params?: { page?: number; limit?: number; status?: string; priority?: string }) {
  return useQuery({ queryKey: ['service-requests', params], queryFn: () => svc.getServiceRequests(params) });
}

export function useServiceRequest(id: string) {
  return useQuery({ queryKey: ['service-requests', id], queryFn: () => svc.getServiceRequest(id), enabled: !!id });
}

export function useCreateServiceRequest() {
  const qc = useQueryClient();
  const { toast } = useUIStore();
  return useMutation({
    mutationFn: svc.createServiceRequest,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['service-requests'] }); toast.success('Servis talebi oluşturuldu.'); },
    onError: (e: unknown) => toast.error(getErrorMessage(e)),
  });
}

export function useUpdateServiceRequest() {
  const qc = useQueryClient();
  const { toast } = useUIStore();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Parameters<typeof svc.updateServiceRequest>[1] }) => svc.updateServiceRequest(id, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['service-requests'] }); toast.success('Talep güncellendi.'); },
    onError: (e: unknown) => toast.error(getErrorMessage(e)),
  });
}

export function useChangeServiceRequestStatus() {
  const qc = useQueryClient();
  const { toast } = useUIStore();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: { status: string; notes?: string } }) => svc.changeServiceRequestStatus(id, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['service-requests'] }); toast.success('Durum güncellendi.'); },
    onError: (e: unknown) => toast.error(getErrorMessage(e)),
  });
}

export function useAssignServiceRequest() {
  const qc = useQueryClient();
  const { toast } = useUIStore();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: { assignedToId: string | null } }) => svc.assignServiceRequest(id, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['service-requests'] }); toast.success('Atama güncellendi.'); },
    onError: (e: unknown) => toast.error(getErrorMessage(e)),
  });
}

export function useAddServiceRequestItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ srId, data }: { srId: string; data: Parameters<typeof svc.addServiceRequestItem>[1] }) => svc.addServiceRequestItem(srId, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['service-requests'] }),
  });
}

export function useRemoveServiceRequestItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ srId, itemId }: { srId: string; itemId: string }) => svc.removeServiceRequestItem(srId, itemId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['service-requests'] }),
  });
}

export function useAddServiceActivity() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ srId, data }: { srId: string; data: Parameters<typeof svc.addServiceActivity>[1] }) => svc.addServiceActivity(srId, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['service-requests'] }),
  });
}

export function useDeleteServiceRequest() {
  const qc = useQueryClient();
  const { toast } = useUIStore();
  return useMutation({
    mutationFn: svc.deleteServiceRequest,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['service-requests'] }); toast.success('Servis talebi silindi.'); },
    onError: (e: unknown) => toast.error(getErrorMessage(e)),
  });
}
