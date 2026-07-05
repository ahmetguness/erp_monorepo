'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useUIStore } from '@/store/ui.store';
import { getErrorMessage } from '@/types/api.types';
import {
  getEDocuments, getEDocumentById, getEDocumentSummary, createEDocument, updateEDocumentStatus,
  type ListParams, type CreateEDocumentDTO, type EDocumentStatus,
} from '@/services/e-document.service';

const KEYS = {
  list: (p: ListParams) => ['e-documents', p] as const,
  detail: (id: string) => ['e-documents', id] as const,
  summary: ['e-documents', 'summary'] as const,
};

export function useEDocuments(params: ListParams) {
  return useQuery({ queryKey: KEYS.list(params), queryFn: () => getEDocuments(params) });
}
export function useEDocument(id: string) {
  return useQuery({ queryKey: KEYS.detail(id), queryFn: () => getEDocumentById(id), enabled: !!id });
}

export function useEDocumentSummary(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: KEYS.summary,
    queryFn: getEDocumentSummary,
    enabled: options?.enabled ?? true,
    staleTime: 60 * 1000,
  });
}

export function useCreateEDocument() {
  const qc = useQueryClient(); const { toast } = useUIStore();
  return useMutation({
    mutationFn: (data: CreateEDocumentDTO) => createEDocument(data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['e-documents'] }); toast.success('E-Belge oluşturuldu.'); },
    onError: (e: unknown) => toast.error(getErrorMessage(e)),
  });
}
export function useUpdateEDocumentStatus() {
  const qc = useQueryClient(); const { toast } = useUIStore();
  return useMutation({
    mutationFn: ({ id, status, providerMessage }: { id: string; status: EDocumentStatus; providerMessage?: string }) => updateEDocumentStatus(id, status, providerMessage),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['e-documents'] }); toast.success('E-Belge durumu güncellendi.'); },
    onError: (e: unknown) => toast.error(getErrorMessage(e)),
  });
}
