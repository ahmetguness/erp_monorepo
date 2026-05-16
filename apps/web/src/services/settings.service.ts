import { z } from 'zod';
import { apiClient } from '@/lib/api-client';
import { safeParse } from '@/lib/safe-parse';
import { SingleResponseSchema } from '@/types/api.types';

export const TenantSettingSchema = z.object({
  id: z.string(), tenantId: z.string(), key: z.string(), value: z.string(),
  createdAt: z.string(), updatedAt: z.string(),
});

export const ModuleSettingSchema = z.object({
  id: z.string(), tenantId: z.string(), module: z.string(), key: z.string(), value: z.string(),
  createdAt: z.string(), updatedAt: z.string(),
});

export type TenantSetting = z.infer<typeof TenantSettingSchema>;
export type ModuleSetting = z.infer<typeof ModuleSettingSchema>;

export async function getTenantSettings(): Promise<TenantSetting[]> {
  const res = await apiClient.get('/api/settings');
  return safeParse(SingleResponseSchema(z.array(TenantSettingSchema)), res.data, 'getTenantSettings').data;
}

export async function upsertTenantSetting(key: string, value: string): Promise<TenantSetting> {
  const res = await apiClient.put('/api/settings', { key, value });
  return safeParse(SingleResponseSchema(TenantSettingSchema), res.data, 'upsertTenantSetting').data;
}

export async function deleteTenantSetting(key: string): Promise<void> {
  await apiClient.delete(`/api/settings/${key}`);
}

export async function uploadTenantLogo(file: File): Promise<TenantSetting> {
  const formData = new FormData();
  formData.append('file', file);
  const res = await apiClient.post('/api/settings/logo', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return safeParse(SingleResponseSchema(TenantSettingSchema), res.data, 'uploadTenantLogo').data;
}

export async function downloadTenantLogo(): Promise<Blob | null> {
  const res = await apiClient.get('/api/settings/logo', {
    responseType: 'blob',
    validateStatus: (status) => status === 200 || status === 204,
  });
  if (res.status === 204) return null;
  return res.data as Blob;
}

export async function deleteTenantLogo(): Promise<void> {
  await apiClient.delete('/api/settings/logo');
}

export async function getModuleSettings(module?: string): Promise<ModuleSetting[]> {
  const res = await apiClient.get('/api/settings/modules', { params: module ? { module } : {} });
  return safeParse(SingleResponseSchema(z.array(ModuleSettingSchema)), res.data, 'getModuleSettings').data;
}

export async function upsertModuleSetting(module: string, key: string, value: string): Promise<ModuleSetting> {
  const res = await apiClient.put('/api/settings/modules', { module, key, value });
  return safeParse(SingleResponseSchema(ModuleSettingSchema), res.data, 'upsertModuleSetting').data;
}
