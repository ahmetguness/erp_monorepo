'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useUIStore } from '@/store/ui.store';
import { getErrorMessage } from '@/types/api.types';
import {
  getApprovalFlows, getApprovalFlowById, createApprovalFlow, updateApprovalFlow, deleteApprovalFlow,
  getApprovalRequests, createApprovalRequest, addApprovalAction, deleteApprovalRequest,
  type FlowListParams, type RequestListParams, type CreateFlowDTO, type UpdateFlowDTO, type CreateRequestDTO, type ActionDTO,
} from '@/services/approval.service';

const KEYS = {
  flows: (p: FlowListParams) => ['approval-flows', p] as const,
  flow: (id: string) => ['approval-flows', id] as const,
  requests: (p: RequestListParams) => ['approval-requests', p] as const,
};

export function useApprovalFlows(params: FlowListParams) {
  return useQuery({ queryKey: KEYS.flows(params), queryFn: () => getApprovalFlows(params) });
}
export function useApprovalFlow(id: string) {
  return useQuery({ queryKey: KEYS.flow(id), queryFn: () => getApprovalFlowById(id), enabled: !!id });
}
export function useCreateApprovalFlow() {
  const qc = useQueryClient(); const { toast } = useUIStore();
  return useMutation({
    mutationFn: (data: CreateFlowDTO) => createApprovalFlow(data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['approval-flows'] }); toast.success('Onay akışı oluşturuldu.'); },
    onError: (e: unknown) => toast.error(getErrorMessage(e)),
  });
}
export function useDeleteApprovalFlow() {
  const qc = useQueryClient(); const { toast } = useUIStore();
  return useMutation({
    mutationFn: (id: string) => deleteApprovalFlow(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['approval-flows'] }); toast.success('Onay akışı silindi.'); },
    onError: (e: unknown) => toast.error(getErrorMessage(e)),
  });
}
export function useUpdateApprovalFlow() {
  const qc = useQueryClient(); const { toast } = useUIStore();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateFlowDTO }) => updateApprovalFlow(id, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['approval-flows'] }); toast.success('Onay akışı güncellendi.'); },
    onError: (e: unknown) => toast.error(getErrorMessage(e)),
  });
}
export function useApprovalRequests(params: RequestListParams) {
  return useQuery({ queryKey: KEYS.requests(params), queryFn: () => getApprovalRequests(params) });
}
export function useCreateApprovalRequest() {
  const qc = useQueryClient(); const { toast } = useUIStore();
  return useMutation({
    mutationFn: (data: CreateRequestDTO) => createApprovalRequest(data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['approval-requests'] }); toast.success('Onay talebi oluşturuldu.'); },
    onError: (e: unknown) => toast.error(getErrorMessage(e)),
  });
}
export function useAddApprovalAction() {
  const qc = useQueryClient(); const { toast } = useUIStore();
  return useMutation({
    mutationFn: ({ requestId, data }: { requestId: string; data: ActionDTO }) => addApprovalAction(requestId, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['approval-requests'] }); toast.success('İşlem kaydedildi.'); },
    onError: (e: unknown) => toast.error(getErrorMessage(e)),
  });
}
export function useDeleteApprovalRequest() {
  const qc = useQueryClient(); const { toast } = useUIStore();
  return useMutation({
    mutationFn: (id: string) => deleteApprovalRequest(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['approval-requests'] }); toast.success('Onay talebi silindi.'); },
    onError: (e: unknown) => toast.error(getErrorMessage(e)),
  });
}
