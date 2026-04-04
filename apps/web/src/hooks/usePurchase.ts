'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useUIStore } from '@/store/ui.store';
import { getErrorMessage } from '@/types/api.types';
import {
  getPurchaseRequests, createPurchaseRequest, approvePurchaseRequest, convertRequestToOrder,
  getPurchaseOrders, getPurchaseOrderById, createPurchaseOrder,
  sendPurchaseOrder, receivePurchaseOrder, cancelPurchaseOrder,
  type ListParams, type CreatePurchaseRequestDTO, type CreatePurchaseOrderDTO, type ReceiveOrderDTO,
} from '@/services/purchase.service';

const KEYS = {
  requests: (p: ListParams) => ['purchase', 'requests', p] as const,
  orders: (p: ListParams) => ['purchase', 'orders', p] as const,
  order: (id: string) => ['purchase', 'orders', id] as const,
};

// ── Purchase Requests ────────────────────────

export function usePurchaseRequests(params: ListParams) {
  return useQuery({ queryKey: KEYS.requests(params), queryFn: () => getPurchaseRequests(params) });
}

export function useCreatePurchaseRequest() {
  const qc = useQueryClient();
  const { toast } = useUIStore();
  return useMutation({
    mutationFn: (data: CreatePurchaseRequestDTO) => createPurchaseRequest(data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['purchase', 'requests'] }); toast.success('Talep oluşturuldu.'); },
    onError: (e: unknown) => toast.error(getErrorMessage(e)),
  });
}

export function useApprovePurchaseRequest() {
  const qc = useQueryClient();
  const { toast } = useUIStore();
  return useMutation({
    mutationFn: (id: string) => approvePurchaseRequest(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['purchase', 'requests'] }); toast.success('Talep onaylandı.'); },
    onError: (e: unknown) => toast.error(getErrorMessage(e)),
  });
}

export function useConvertRequestToOrder() {
  const qc = useQueryClient();
  const { toast } = useUIStore();
  return useMutation({
    mutationFn: ({ id, contactId }: { id: string; contactId: string }) => convertRequestToOrder(id, contactId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['purchase'] });
      toast.success('Talep siparişe dönüştürüldü.');
    },
    onError: (e: unknown) => toast.error(getErrorMessage(e)),
  });
}

// ── Purchase Orders ──────────────────────────

export function usePurchaseOrders(params: ListParams) {
  return useQuery({ queryKey: KEYS.orders(params), queryFn: () => getPurchaseOrders(params) });
}

export function usePurchaseOrder(id: string) {
  return useQuery({ queryKey: KEYS.order(id), queryFn: () => getPurchaseOrderById(id), enabled: !!id });
}

export function useCreatePurchaseOrder() {
  const qc = useQueryClient();
  const { toast } = useUIStore();
  return useMutation({
    mutationFn: (data: CreatePurchaseOrderDTO) => createPurchaseOrder(data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['purchase', 'orders'] }); toast.success('Sipariş oluşturuldu.'); },
    onError: (e: unknown) => toast.error(getErrorMessage(e)),
  });
}

export function useSendPurchaseOrder() {
  const qc = useQueryClient();
  const { toast } = useUIStore();
  return useMutation({
    mutationFn: (id: string) => sendPurchaseOrder(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['purchase'] }); toast.success('Sipariş tedarikçiye gönderildi.'); },
    onError: (e: unknown) => toast.error(getErrorMessage(e)),
  });
}

export function useReceivePurchaseOrder() {
  const qc = useQueryClient();
  const { toast } = useUIStore();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: ReceiveOrderDTO }) => receivePurchaseOrder(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['purchase'] });
      qc.invalidateQueries({ queryKey: ['stock'] });
      toast.success('Teslim alındı, stok güncellendi.');
    },
    onError: (e: unknown) => toast.error(getErrorMessage(e)),
  });
}

export function useCancelPurchaseOrder() {
  const qc = useQueryClient();
  const { toast } = useUIStore();
  return useMutation({
    mutationFn: (id: string) => cancelPurchaseOrder(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['purchase'] }); toast.success('Sipariş iptal edildi.'); },
    onError: (e: unknown) => toast.error(getErrorMessage(e)),
  });
}
