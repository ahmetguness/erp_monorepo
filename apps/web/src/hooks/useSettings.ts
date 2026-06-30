'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useUIStore } from '@/store/ui.store';
import { getErrorMessage } from '@/types/api.types';
import {
  getTenantSettings, upsertTenantSetting, deleteTenantSetting,
  getModuleSettings, upsertModuleSetting,
  downloadTenantLogo, uploadTenantLogo, deleteTenantLogo,
  getBusinessRules, upsertBusinessRule,
  getTenantSecurityScore,
  getSecurityHardeningSnapshot,
  revokeSecuritySession,
  runQuickStart,
  cleanDemoData,
  type BusinessRule,
  type QuickStartDTO,
} from '@/services/settings.service';

export function useTenantSettings() {
  return useQuery({ queryKey: ['settings', 'tenant'], queryFn: getTenantSettings, staleTime: 5 * 60 * 1000 });
}

export function useUpsertTenantSetting() {
  const qc = useQueryClient();
  const { toast } = useUIStore();
  return useMutation({
    mutationFn: ({ key, value }: { key: string; value: string }) => upsertTenantSetting(key, value),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['settings', 'tenant'] }); toast.success('Ayar kaydedildi.'); },
    onError: (e: unknown) => toast.error(getErrorMessage(e)),
  });
}

export function useDeleteTenantSetting() {
  const qc = useQueryClient();
  const { toast } = useUIStore();
  return useMutation({
    mutationFn: (key: string) => deleteTenantSetting(key),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['settings', 'tenant'] }); toast.success('Ayar silindi.'); },
    onError: (e: unknown) => toast.error(getErrorMessage(e)),
  });
}

export function useBusinessRules() {
  return useQuery({ queryKey: ['settings', 'business-rules'], queryFn: getBusinessRules, staleTime: 5 * 60 * 1000 });
}

export function useTenantSecurityScore() {
  return useQuery({ queryKey: ['settings', 'security-score'], queryFn: getTenantSecurityScore, staleTime: 2 * 60 * 1000 });
}

export function useSecurityHardeningSnapshot() {
  return useQuery({ queryKey: ['settings', 'security-hardening'], queryFn: getSecurityHardeningSnapshot, staleTime: 60 * 1000 });
}

export function useRevokeSecuritySession() {
  const qc = useQueryClient();
  const { toast } = useUIStore();
  return useMutation({
    mutationFn: (sessionId: string) => revokeSecuritySession(sessionId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['settings', 'security-hardening'] });
      qc.invalidateQueries({ queryKey: ['settings', 'security-score'] });
      toast.success('Oturum sonlandirildi.');
    },
    onError: (e: unknown) => toast.error(getErrorMessage(e)),
  });
}

export function useUpsertBusinessRule() {
  const qc = useQueryClient();
  const { toast } = useUIStore();
  return useMutation({
    mutationFn: ({ key, value }: { key: BusinessRule['key']; value: BusinessRule['value'] }) => upsertBusinessRule(key, value),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['settings', 'business-rules'] });
      qc.invalidateQueries({ queryKey: ['settings', 'tenant'] });
      toast.success('İş kuralı kaydedildi.');
    },
    onError: (e: unknown) => toast.error(getErrorMessage(e)),
  });
}

export function useTenantLogo() {
  return useQuery({ queryKey: ['settings', 'tenant-logo'], queryFn: downloadTenantLogo, staleTime: 5 * 60 * 1000 });
}

export function useUploadTenantLogo() {
  const qc = useQueryClient();
  const { toast } = useUIStore();
  return useMutation({
    mutationFn: (file: File) => uploadTenantLogo(file),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['settings', 'tenant'] });
      qc.invalidateQueries({ queryKey: ['settings', 'tenant-logo'] });
      toast.success('Logo yüklendi.');
    },
    onError: (e: unknown) => toast.error(getErrorMessage(e)),
  });
}

export function useDeleteTenantLogo() {
  const qc = useQueryClient();
  const { toast } = useUIStore();
  return useMutation({
    mutationFn: deleteTenantLogo,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['settings', 'tenant'] });
      qc.invalidateQueries({ queryKey: ['settings', 'tenant-logo'] });
      toast.success('Logo silindi.');
    },
    onError: (e: unknown) => toast.error(getErrorMessage(e)),
  });
}

export function useRunQuickStart() {
  const qc = useQueryClient();
  const { toast } = useUIStore();
  return useMutation({
    mutationFn: (data: QuickStartDTO) => runQuickStart(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['settings', 'tenant'] });
      toast.success('Hızlı başlangıç kurulumu tamamlandı!');
    },
    onError: (e: unknown) => toast.error(getErrorMessage(e)),
  });
}

export function useCleanDemoData() {
  const qc = useQueryClient();
  const { toast } = useUIStore();
  return useMutation({
    mutationFn: () => cleanDemoData(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['settings', 'tenant'] });
      toast.success('Demo veriler temizlendi ve canlı moda geçildi.');
    },
    onError: (e: unknown) => toast.error(getErrorMessage(e)),
  });
}

export function useModuleSettings(module?: string) {
  return useQuery({ queryKey: ['settings', 'modules', module], queryFn: () => getModuleSettings(module), staleTime: 5 * 60 * 1000 });
}

export function useUpsertModuleSetting() {
  const qc = useQueryClient();
  const { toast } = useUIStore();
  return useMutation({
    mutationFn: ({ module, key, value }: { module: string; key: string; value: string }) => upsertModuleSetting(module, key, value),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['settings'] }); toast.success('Modül ayarı kaydedildi.'); },
    onError: (e: unknown) => toast.error(getErrorMessage(e)),
  });
}
