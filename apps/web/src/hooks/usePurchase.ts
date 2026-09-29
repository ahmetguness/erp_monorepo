'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useUIStore } from '@/store/ui.store';
import { getErrorMessage } from '@/types/api.types';
import {
  getPurchaseRequests, createPurchaseRequest, updatePurchaseRequest, getPurchaseRequestHistory,
  submitPurchaseRequest, approvePurchaseRequest, rejectPurchaseRequest, cancelPurchaseRequest, convertRequestToOrder,
  getPurchaseOrders, getPurchaseOrderById, getPurchaseOrderHistory, createPurchaseOrder,
  sendPurchaseOrder, receivePurchaseOrder, cancelPurchaseOrder, runPurchaseReorderAutomation, getPurchaseOrderThreeWayMatch,
  type ListParams, type CreatePurchaseRequestDTO, type CreatePurchaseOrderDTO, type ReceiveOrderDTO,
} from '@/services/purchase.service';

const KEYS = {
  requests: (p: ListParams) => ['purchase', 'requests', p] as const,
  requestHistory: (id: string) => ['purchase', 'requests', id, 'history'] as const,
  orders: (p: ListParams) => ['purchase', 'orders', p] as const,
  order: (id: string) => ['purchase', 'orders', id] as const,
  orderHistory: (id: string) => ['purchase', 'orders', id, 'history'] as const,
  threeWayMatch: (id: string) => ['purchase', 'orders', id, 'three-way-match'] as const,
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

export function useUpdatePurchaseRequest() {
  const qc = useQueryClient();
  const { toast } = useUIStore();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: CreatePurchaseRequestDTO }) => updatePurchaseRequest(id, data),
    onSuccess: (_result, variables) => {
      qc.invalidateQueries({ queryKey: ['purchase', 'requests'] });
      qc.invalidateQueries({ queryKey: KEYS.requestHistory(variables.id) });
      toast.success('Talep güncellendi.');
    },
    onError: (e: unknown) => toast.error(getErrorMessage(e)),
  });
}

export function usePurchaseRequestHistory(id?: string) {
  return useQuery({
    queryKey: KEYS.requestHistory(id ?? ''),
    queryFn: () => getPurchaseRequestHistory(id!),
    enabled: Boolean(id),
  });
}

function useRequestTransition(
  mutationFn: ({ id, reason }: { id: string; reason?: string }) => Promise<unknown>,
  successMessage: string,
) {
  const qc = useQueryClient();
  const { toast } = useUIStore();
  return useMutation({
    mutationFn,
    onSuccess: (_result, variables) => {
      qc.invalidateQueries({ queryKey: ['purchase', 'requests'] });
      qc.invalidateQueries({ queryKey: KEYS.requestHistory(variables.id) });
      toast.success(successMessage);
    },
    onError: (e: unknown) => toast.error(getErrorMessage(e)),
  });
}

export function useSubmitPurchaseRequest() {
  return useRequestTransition(({ id }) => submitPurchaseRequest(id), 'Talep onaya gönderildi.');
}

export function useRejectPurchaseRequest() {
  return useRequestTransition(({ id, reason }) => rejectPurchaseRequest(id, reason), 'Talep reddedildi.');
}

export function useCancelPurchaseRequest() {
  return useRequestTransition(({ id, reason }) => cancelPurchaseRequest(id, reason), 'Talep iptal edildi.');
}

export function useApprovePurchaseRequest() {
  const qc = useQueryClient();
  const { toast } = useUIStore();
  return useMutation({
    mutationFn: (id: string) => approvePurchaseRequest(id),
    onSuccess: (_result, id) => {
      qc.invalidateQueries({ queryKey: ['purchase', 'requests'] });
      qc.invalidateQueries({ queryKey: KEYS.requestHistory(id) });
      toast.success('Talep onaylandı.');
    },
    onError: (e: unknown) => toast.error(getErrorMessage(e)),
  });
}

export function useConvertRequestToOrder() {
  const qc = useQueryClient();
  const { toast } = useUIStore();
  return useMutation({
    mutationFn: ({ id, contactId, items }: { id: string; contactId: string; items?: Array<{ productId: string; unitPrice: number }> }) =>
      convertRequestToOrder(id, contactId, items),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['purchase'] });
      toast.success('Talep siparişe dönüştürüldü.');
    },
    onError: (e: unknown) => toast.error(getErrorMessage(e)),
  });
}

// ── Purchase Orders ──────────────────────────

export function useRunPurchaseReorderAutomation() {
  const qc = useQueryClient();
  const { toast } = useUIStore();
  return useMutation({
    mutationFn: runPurchaseReorderAutomation,
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: ['purchase', 'requests'] });
      qc.invalidateQueries({ queryKey: ['stock'] });

      if (result.createdRequest) {
        toast.success(`${result.createdRequest.number} otomatik oluşturuldu.`);
        return;
      }

      if (result.existingRequest) {
        toast.info(`${result.existingRequest.number} zaten açık. Yeni talep oluşturulmadı.`);
        return;
      }

      toast.info(result.skippedReason ?? 'Satın alma otomasyonu tamamlandı.');
    },
    onError: (e: unknown) => toast.error(getErrorMessage(e)),
  });
}

export function usePurchaseOrders(params: ListParams) {
  return useQuery({ queryKey: KEYS.orders(params), queryFn: () => getPurchaseOrders(params) });
}

export function usePurchaseOrder(id: string) {
  return useQuery({ queryKey: KEYS.order(id), queryFn: () => getPurchaseOrderById(id), enabled: !!id });
}

export function usePurchaseOrderHistory(id: string) {
  return useQuery({ queryKey: KEYS.orderHistory(id), queryFn: () => getPurchaseOrderHistory(id), enabled: !!id });
}

export function usePurchaseOrderThreeWayMatch(id: string) {
  return useQuery({ queryKey: KEYS.threeWayMatch(id), queryFn: () => getPurchaseOrderThreeWayMatch(id), enabled: !!id });
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
