'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useUIStore } from '@/store/ui.store';
import { getErrorMessage } from '@/types/api.types';
import {
  getApiKeys,
  createApiKey,
  rotateApiKey,
  revokeApiKey,
  deleteApiKey,
  getApiKeyActivity,
  getExternalApiManifest,
  getIntegrationSandbox,
  type ListParams,
  type CreateApiKeyDTO,
} from '@/services/api-key.service';

const KEYS = {
  list: (p: ListParams) => ['api-keys', p] as const,
  activity: (id: string) => ['api-keys', id, 'activity'] as const,
  manifest: ['api-keys', 'manifest'] as const,
  sandbox: ['api-keys', 'sandbox'] as const,
};

export function useApiKeys(params: ListParams) {
  return useQuery({ queryKey: KEYS.list(params), queryFn: () => getApiKeys(params) });
}
export function useCreateApiKey() {
  const qc = useQueryClient(); const { toast } = useUIStore();
  return useMutation({
    mutationFn: (data: CreateApiKeyDTO) => createApiKey(data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['api-keys'] }); toast.success('API anahtarı oluşturuldu.'); },
    onError: (e: unknown) => toast.error(getErrorMessage(e)),
  });
}
export function useApiKeyActivity(id: string) {
  return useQuery({ queryKey: KEYS.activity(id), queryFn: () => getApiKeyActivity(id), enabled: Boolean(id) });
}
export function useExternalApiManifest() {
  return useQuery({ queryKey: KEYS.manifest, queryFn: getExternalApiManifest, staleTime: 10 * 60 * 1000 });
}
export function useIntegrationSandbox() {
  return useQuery({ queryKey: KEYS.sandbox, queryFn: getIntegrationSandbox, staleTime: 10 * 60 * 1000 });
}
export function useRevokeApiKey() {
  const qc = useQueryClient(); const { toast } = useUIStore();
  return useMutation({
    mutationFn: (id: string) => revokeApiKey(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['api-keys'] }); toast.success('API anahtarı iptal edildi.'); },
    onError: (e: unknown) => toast.error(getErrorMessage(e)),
  });
}
export function useRotateApiKey() {
  const qc = useQueryClient(); const { toast } = useUIStore();
  return useMutation({
    mutationFn: (id: string) => rotateApiKey(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['api-keys'] }); toast.success('API anahtari rotate edildi.'); },
    onError: (e: unknown) => toast.error(getErrorMessage(e)),
  });
}
export function useDeleteApiKey() {
  const qc = useQueryClient(); const { toast } = useUIStore();
  return useMutation({
    mutationFn: (id: string) => deleteApiKey(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['api-keys'] }); toast.success('API anahtarı silindi.'); },
    onError: (e: unknown) => toast.error(getErrorMessage(e)),
  });
}
