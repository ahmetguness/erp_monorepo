'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useUIStore } from '@/store/ui.store';
import { getErrorMessage } from '@/types/api.types';
import * as svc from '@/services/production.service';

// ─── Work Centers ─────────────────────────────

export function useWorkCenters(params?: { page?: number; limit?: number }) {
  return useQuery({ queryKey: ['work-centers', params], queryFn: () => svc.getWorkCenters(params) });
}

export function useWorkCenter(id: string) {
  return useQuery({ queryKey: ['work-centers', id], queryFn: () => svc.getWorkCenter(id), enabled: !!id });
}

export function useCreateWorkCenter() {
  const qc = useQueryClient();
  const { toast } = useUIStore();
  return useMutation({
    mutationFn: svc.createWorkCenter,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['work-centers'] }); toast.success('İş merkezi oluşturuldu.'); },
    onError: (e: unknown) => toast.error(getErrorMessage(e)),
  });
}

export function useUpdateWorkCenter() {
  const qc = useQueryClient();
  const { toast } = useUIStore();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Parameters<typeof svc.updateWorkCenter>[1] }) => svc.updateWorkCenter(id, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['work-centers'] }); toast.success('İş merkezi güncellendi.'); },
    onError: (e: unknown) => toast.error(getErrorMessage(e)),
  });
}

export function useDeleteWorkCenter() {
  const qc = useQueryClient();
  const { toast } = useUIStore();
  return useMutation({
    mutationFn: svc.deleteWorkCenter,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['work-centers'] }); toast.success('İş merkezi silindi.'); },
    onError: (e: unknown) => toast.error(getErrorMessage(e)),
  });
}

// ─── BOMs ─────────────────────────────────────

export function useBOMs(params?: { page?: number; limit?: number }) {
  return useQuery({ queryKey: ['boms', params], queryFn: () => svc.getBOMs(params) });
}

export function useBOM(id: string) {
  return useQuery({ queryKey: ['boms', id], queryFn: () => svc.getBOM(id), enabled: !!id });
}

export function useCreateBOM() {
  const qc = useQueryClient();
  const { toast } = useUIStore();
  return useMutation({
    mutationFn: svc.createBOM,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['boms'] }); toast.success('BOM oluşturuldu.'); },
    onError: (e: unknown) => toast.error(getErrorMessage(e)),
  });
}

export function useUpdateBOM() {
  const qc = useQueryClient();
  const { toast } = useUIStore();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Parameters<typeof svc.updateBOM>[1] }) => svc.updateBOM(id, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['boms'] }); toast.success('BOM güncellendi.'); },
    onError: (e: unknown) => toast.error(getErrorMessage(e)),
  });
}

export function useAddBOMItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ bomId, data }: { bomId: string; data: Parameters<typeof svc.addBOMItem>[1] }) => svc.addBOMItem(bomId, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['boms'] }),
  });
}

export function useRemoveBOMItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ bomId, itemId }: { bomId: string; itemId: string }) => svc.removeBOMItem(bomId, itemId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['boms'] }),
  });
}

export function useAddBOMRouting() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ bomId, data }: { bomId: string; data: Parameters<typeof svc.addBOMRouting>[1] }) => svc.addBOMRouting(bomId, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['boms'] }),
  });
}

export function useRemoveBOMRouting() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ bomId, routingId }: { bomId: string; routingId: string }) => svc.removeBOMRouting(bomId, routingId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['boms'] }),
  });
}

// ─── Work Orders ──────────────────────────────

export function useWorkOrders(params?: { page?: number; limit?: number; status?: string }) {
  return useQuery({ queryKey: ['work-orders', params], queryFn: () => svc.getWorkOrders(params) });
}

export function useWorkOrder(id: string) {
  return useQuery({ queryKey: ['work-orders', id], queryFn: () => svc.getWorkOrder(id), enabled: !!id });
}

export function useCreateWorkOrder() {
  const qc = useQueryClient();
  const { toast } = useUIStore();
  return useMutation({
    mutationFn: svc.createWorkOrder,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['work-orders'] }); toast.success('İş emri oluşturuldu.'); },
    onError: (e: unknown) => toast.error(getErrorMessage(e)),
  });
}

export function useChangeWorkOrderStatus() {
  const qc = useQueryClient();
  const { toast } = useUIStore();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: { status: string; notes?: string } }) => svc.changeWorkOrderStatus(id, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['work-orders'] }); toast.success('Durum güncellendi.'); },
    onError: (e: unknown) => toast.error(getErrorMessage(e)),
  });
}

export function useReportProduction() {
  const qc = useQueryClient();
  const { toast } = useUIStore();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Parameters<typeof svc.reportProduction>[1] }) => svc.reportProduction(id, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['work-orders'] }); toast.success('Üretim bildirimi kaydedildi.'); },
    onError: (e: unknown) => toast.error(getErrorMessage(e)),
  });
}

export function useUpdateWorkOrderOperation() {
  const qc = useQueryClient();
  const { toast } = useUIStore();
  return useMutation({
    mutationFn: ({ workOrderId, operationId, data }: {
      workOrderId: string;
      operationId: string;
      data: Parameters<typeof svc.updateWorkOrderOperation>[2];
    }) => svc.updateWorkOrderOperation(workOrderId, operationId, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['work-orders'] }); toast.success('Operasyon güncellendi.'); },
    onError: (e: unknown) => toast.error(getErrorMessage(e)),
  });
}

export function useDeleteWorkOrder() {
  const qc = useQueryClient();
  const { toast } = useUIStore();
  return useMutation({
    mutationFn: svc.deleteWorkOrder,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['work-orders'] }); toast.success('İş emri silindi.'); },
    onError: (e: unknown) => toast.error(getErrorMessage(e)),
  });
}
