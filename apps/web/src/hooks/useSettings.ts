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
  getSetupChecklist,
  revokeSecuritySession,
  runQuickStart,
  cleanDemoData,
  getCorporateSecuritySettings,
  updateCorporateSecuritySettings,
  generateScimToken,
  getSiemSettings,
  updateSiemSettings,
  runSiemExportTest,
  getDataRetentionSettings,
  updateDataRetentionSettings,
  previewDataRetention,
  runDataRetentionDryRun,
  getDeploymentOperationsSnapshot,
  getDeploymentOperationsSettings,
  updateDeploymentOperationsSettings,
  simulateDeploymentBackup,
  getBiSettings,
  updateBiSettings,
  generateBiToken,
  runBiScheduleSimulation,
  getPortalToken,
  generatePortalToken,
  runSlaSweep,
  type BusinessRule,
  type QuickStartDTO,
  type CorporateSecuritySettings,
  type SiemSettings,
  type DataRetentionSettings,
  type DeploymentOperationsSettings,
  type BiSettings,
} from '@/services/settings.service';

function invalidateSetupData(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ['settings', 'tenant'] });
  qc.invalidateQueries({ queryKey: ['settings', 'setup-checklist'] });
  qc.invalidateQueries({ queryKey: ['master'] });
  qc.invalidateQueries({ queryKey: ['contacts'] });
  qc.invalidateQueries({ queryKey: ['products'] });
}

export function useTenantSettings() {
  return useQuery({ queryKey: ['settings', 'tenant'], queryFn: getTenantSettings, staleTime: 5 * 60 * 1000 });
}

export function useUpsertTenantSetting() {
  const qc = useQueryClient();
  const { toast } = useUIStore();
  return useMutation({
    mutationFn: ({ key, value }: { key: string; value: string }) => upsertTenantSetting(key, value),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['settings', 'tenant'] });
      qc.invalidateQueries({ queryKey: ['settings', 'setup-checklist'] });
      toast.success('Ayar kaydedildi.');
    },
    onError: (e: unknown) => toast.error(getErrorMessage(e)),
  });
}

export function useDeleteTenantSetting() {
  const qc = useQueryClient();
  const { toast } = useUIStore();
  return useMutation({
    mutationFn: (key: string) => deleteTenantSetting(key),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['settings', 'tenant'] });
      qc.invalidateQueries({ queryKey: ['settings', 'setup-checklist'] });
      toast.success('Ayar silindi.');
    },
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

export function useSetupChecklist(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: ['settings', 'setup-checklist'],
    queryFn: getSetupChecklist,
    enabled: options?.enabled ?? true,
    staleTime: 60 * 1000,
  });
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
      invalidateSetupData(qc);
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
      invalidateSetupData(qc);
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

export function useCorporateSecuritySettings() {
  return useQuery({ queryKey: ['settings', 'corporate-security'], queryFn: getCorporateSecuritySettings, staleTime: 5 * 60 * 1000 });
}

export function useUpdateCorporateSecuritySettings() {
  const qc = useQueryClient();
  const { toast } = useUIStore();
  return useMutation({
    mutationFn: updateCorporateSecuritySettings,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['settings', 'corporate-security'] });
      toast.success('Güvenlik ayarları güncellendi.');
    },
    onError: (e: unknown) => toast.error(getErrorMessage(e)),
  });
}

export function useGenerateScimToken() {
  const qc = useQueryClient();
  const { toast } = useUIStore();
  return useMutation({
    mutationFn: generateScimToken,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['settings', 'corporate-security'] });
      toast.success('Yeni SCIM token üretildi.');
    },
    onError: (e: unknown) => toast.error(getErrorMessage(e)),
  });
}

export function useSiemSettings() {
  return useQuery({ queryKey: ['settings', 'siem'], queryFn: getSiemSettings, staleTime: 5 * 60 * 1000 });
}

export function useUpdateSiemSettings() {
  const qc = useQueryClient();
  const { toast } = useUIStore();
  return useMutation({
    mutationFn: (data: SiemSettings) => updateSiemSettings(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['settings', 'siem'] });
      toast.success('SIEM entegrasyon ayarlari kaydedildi.');
    },
    onError: (e: unknown) => toast.error(getErrorMessage(e)),
  });
}

export function useRunSiemExportTest() {
  const qc = useQueryClient();
  const { toast } = useUIStore();
  return useMutation({
    mutationFn: runSiemExportTest,
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['settings', 'siem'] });
      toast.success(`SIEM export testi tamamlandi: ${data.eventCount} olay hazirlandi.`);
    },
    onError: (e: unknown) => toast.error(getErrorMessage(e)),
  });
}

export function useDataRetentionSettings() {
  return useQuery({ queryKey: ['settings', 'data-retention'], queryFn: getDataRetentionSettings, staleTime: 5 * 60 * 1000 });
}

export function useUpdateDataRetentionSettings() {
  const qc = useQueryClient();
  const { toast } = useUIStore();
  return useMutation({
    mutationFn: (data: DataRetentionSettings) => updateDataRetentionSettings(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['settings', 'data-retention'] });
      qc.invalidateQueries({ queryKey: ['settings', 'data-retention-preview'] });
      toast.success('Veri saklama politikasi kaydedildi.');
    },
    onError: (e: unknown) => toast.error(getErrorMessage(e)),
  });
}

export function useDataRetentionPreview() {
  return useQuery({ queryKey: ['settings', 'data-retention-preview'], queryFn: previewDataRetention, staleTime: 60 * 1000 });
}

export function useRunDataRetentionDryRun() {
  const qc = useQueryClient();
  const { toast } = useUIStore();
  return useMutation({
    mutationFn: runDataRetentionDryRun,
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['settings', 'data-retention'] });
      qc.invalidateQueries({ queryKey: ['settings', 'data-retention-preview'] });
      toast.success(`Retention dry-run tamamlandi: ${data.totalCandidates} aday kayit bulundu.`);
    },
    onError: (e: unknown) => toast.error(getErrorMessage(e)),
  });
}

export function useDeploymentOperationsSnapshot() {
  return useQuery({ queryKey: ['settings', 'deployment-operations'], queryFn: getDeploymentOperationsSnapshot, staleTime: 60 * 1000 });
}

export function useDeploymentOperationsSettings() {
  return useQuery({ queryKey: ['settings', 'deployment-operations-settings'], queryFn: getDeploymentOperationsSettings, staleTime: 5 * 60 * 1000 });
}

export function useUpdateDeploymentOperationsSettings() {
  const qc = useQueryClient();
  const { toast } = useUIStore();
  return useMutation({
    mutationFn: (data: DeploymentOperationsSettings) => updateDeploymentOperationsSettings(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['settings', 'deployment-operations'] });
      qc.invalidateQueries({ queryKey: ['settings', 'deployment-operations-settings'] });
      toast.success('Deployment operasyon ayarlari kaydedildi.');
    },
    onError: (e: unknown) => toast.error(getErrorMessage(e)),
  });
}

export function useSimulateDeploymentBackup() {
  const qc = useQueryClient();
  const { toast } = useUIStore();
  return useMutation({
    mutationFn: simulateDeploymentBackup,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['settings', 'deployment-operations'] });
      qc.invalidateQueries({ queryKey: ['settings', 'deployment-operations-settings'] });
      toast.success('Yedek simulasyonu tamamlandi.');
    },
    onError: (e: unknown) => toast.error(getErrorMessage(e)),
  });
}

export function useBiSettings() {
  return useQuery({ queryKey: ['settings', 'bi'], queryFn: getBiSettings, staleTime: 5 * 60 * 1000 });
}

export function useUpdateBiSettings() {
  const qc = useQueryClient();
  const { toast } = useUIStore();
  return useMutation({
    mutationFn: updateBiSettings,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['settings', 'bi'] });
      toast.success('BI entegrasyon ayarları kaydedildi.');
    },
    onError: (e: unknown) => toast.error(getErrorMessage(e)),
  });
}

export function useGenerateBiToken() {
  const qc = useQueryClient();
  const { toast } = useUIStore();
  return useMutation({
    mutationFn: generateBiToken,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['settings', 'bi'] });
      toast.success('Yeni BI Connector tokenı üretildi.');
    },
    onError: (e: unknown) => toast.error(getErrorMessage(e)),
  });
}

export function useRunBiScheduleSimulation() {
  const qc = useQueryClient();
  const { toast } = useUIStore();
  return useMutation({
    mutationFn: runBiScheduleSimulation,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['settings', 'bi'] });
      toast.success('Simüle edilmiş planlı BI aktarımı başarıyla çalıştırıldı.');
    },
    onError: (e: unknown) => toast.error(getErrorMessage(e)),
  });
}

export function usePortalToken(contactId: string) {
  return useQuery({
    queryKey: ['settings', 'portal-token', contactId],
    queryFn: () => getPortalToken(contactId),
    enabled: Boolean(contactId),
    staleTime: 30 * 1000,
  });
}

export function useGeneratePortalToken(contactId: string) {
  const qc = useQueryClient();
  const { toast } = useUIStore();
  return useMutation({
    mutationFn: () => generatePortalToken(contactId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['settings', 'portal-token', contactId] });
      toast.success('Müşteri portalı tokenı başarıyla üretildi.');
    },
    onError: (e: unknown) => toast.error(getErrorMessage(e)),
  });
}

export function useRunSlaSweep() {
  const { toast } = useUIStore();
  return useMutation({
    mutationFn: runSlaSweep,
    onSuccess: (data) => {
      toast.success(
        `SLA taraması tamamlandı: ${data.checked} talep incelendi, ${data.breachedCount} ihlal tespit edildi.`
      );
    },
    onError: (e: unknown) => toast.error(getErrorMessage(e)),
  });
}
