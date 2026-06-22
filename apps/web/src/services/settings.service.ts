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

export const BusinessRuleSchema = z.object({
  key: z.enum([
    'sales.quote_validity_days',
    'invoicing.invoice_due_days',
    'mail.default_signature',
    'payments.reminder_days_before_due',
    'approvals.default_limit',
    'service.default_sla_hours',
    'hr.required_employee_documents',
  ]),
  type: z.enum(['number', 'string', 'string_list']),
  defaultValue: z.union([z.number(), z.string(), z.array(z.string())]),
  minPlan: z.enum(['STARTER', 'PROFESSIONAL', 'ENTERPRISE']),
  module: z.string(),
  label: z.string(),
  description: z.string(),
  consumingModules: z.array(z.string()),
  validation: z.object({
    min: z.number().optional(),
    max: z.number().optional(),
    maxLength: z.number().optional(),
    maxItems: z.number().optional(),
  }),
  value: z.union([z.number(), z.string(), z.array(z.string())]),
  valueString: z.string(),
  isDefault: z.boolean(),
  isAvailable: z.boolean(),
  tenantPlan: z.enum(['STARTER', 'PROFESSIONAL', 'ENTERPRISE']),
});

export const TenantSecurityFindingSchema = z.object({
  key: z.string(),
  severity: z.enum(['critical', 'high', 'medium', 'low']),
  status: z.enum(['pass', 'warn', 'fail']),
  title: z.string(),
  description: z.string(),
  actionLabel: z.string(),
  href: z.string(),
  count: z.coerce.number(),
});

export const TenantSecurityScoreSchema = z.object({
  score: z.coerce.number(),
  status: z.enum(['pass', 'warn', 'fail']),
  generatedAt: z.string(),
  findings: z.array(TenantSecurityFindingSchema),
  metrics: z.object({
    activeUsers: z.coerce.number(),
    inactiveUsers: z.coerce.number(),
    activeApiKeys: z.coerce.number(),
    expiringApiKeys: z.coerce.number(),
    staleApiKeys: z.coerce.number(),
    riskyRoles: z.coerce.number(),
    owners: z.coerce.number(),
  }),
});

export const SecuritySessionSchema = z.object({
  id: z.string(),
  userId: z.string(),
  tenantId: z.string(),
  status: z.enum(['ACTIVE', 'REVOKED', 'EXPIRED']),
  createdAt: z.string(),
  lastSeenAt: z.string(),
  revokedAt: z.string().nullable(),
  revokedById: z.string().nullable(),
  ipAddress: z.string().nullable(),
  userAgent: z.string().nullable(),
  deviceLabel: z.string(),
});

export const WeakPermissionRiskSchema = z.object({
  roleId: z.string(),
  roleName: z.string(),
  severity: z.enum(['critical', 'high', 'medium', 'low']),
  reason: z.string(),
  permissionCount: z.coerce.number(),
  riskyPermissions: z.array(z.object({
    module: z.string(),
    action: z.enum(['CREATE', 'READ', 'UPDATE', 'DELETE', 'APPROVE', 'EXPORT']),
  })),
  assignedUserCount: z.coerce.number(),
});

export const ApiKeyRotationRiskSchema = z.object({
  id: z.string(),
  name: z.string(),
  keyPrefix: z.string(),
  severity: z.enum(['critical', 'high', 'medium', 'low']),
  reason: z.string(),
  createdAt: z.string(),
  lastUsedAt: z.string().nullable(),
  expiresAt: z.string().nullable(),
});

export const PublicEndpointAbuseMetricSchema = z.object({
  pathGroup: z.enum(['public', 'admin', 'api']),
  ipAddress: z.string(),
  exceededCount: z.coerce.number(),
  lastExceededAt: z.string(),
});

export const WebhookSecurityAuditSchema = z.object({
  missingSecretCount: z.coerce.number(),
  failedWebhookCount: z.coerce.number(),
  replayableWebhookCount: z.coerce.number(),
  duplicateWindowCount: z.coerce.number(),
  lastFailureAt: z.string().nullable(),
});

export const SecurityHardeningSnapshotSchema = z.object({
  generatedAt: z.string(),
  sessions: z.object({
    active: z.coerce.number(),
    revoked: z.coerce.number(),
    expired: z.coerce.number(),
    recent: z.array(SecuritySessionSchema),
  }),
  apiKeyRotation: z.array(ApiKeyRotationRiskSchema),
  weakPermissionRisks: z.array(WeakPermissionRiskSchema),
  publicEndpointAbuse: z.array(PublicEndpointAbuseMetricSchema),
  webhookAudit: WebhookSecurityAuditSchema,
});

export type TenantSetting = z.infer<typeof TenantSettingSchema>;
export type ModuleSetting = z.infer<typeof ModuleSettingSchema>;
export type BusinessRule = z.infer<typeof BusinessRuleSchema>;
export type TenantSecurityScore = z.infer<typeof TenantSecurityScoreSchema>;
export type SecuritySession = z.infer<typeof SecuritySessionSchema>;
export type SecurityHardeningSnapshot = z.infer<typeof SecurityHardeningSnapshotSchema>;

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

export async function getBusinessRules(): Promise<BusinessRule[]> {
  const res = await apiClient.get('/api/settings/business-rules');
  return safeParse(SingleResponseSchema(z.array(BusinessRuleSchema)), res.data, 'getBusinessRules').data;
}

export async function getTenantSecurityScore(): Promise<TenantSecurityScore> {
  const res = await apiClient.get('/api/settings/security-score');
  return safeParse(SingleResponseSchema(TenantSecurityScoreSchema), res.data, 'getTenantSecurityScore').data;
}

export async function getSecurityHardeningSnapshot(): Promise<SecurityHardeningSnapshot> {
  const res = await apiClient.get('/api/settings/security/dashboard');
  return safeParse(SingleResponseSchema(SecurityHardeningSnapshotSchema), res.data, 'getSecurityHardeningSnapshot').data;
}

export async function revokeSecuritySession(sessionId: string): Promise<SecuritySession> {
  const res = await apiClient.post(`/api/settings/security/sessions/${sessionId}/revoke`);
  return safeParse(SingleResponseSchema(SecuritySessionSchema), res.data, 'revokeSecuritySession').data;
}

export async function upsertBusinessRule(key: BusinessRule['key'], value: BusinessRule['value']): Promise<BusinessRule> {
  const res = await apiClient.put('/api/settings/business-rules', { key, value });
  return safeParse(SingleResponseSchema(BusinessRuleSchema), res.data, 'upsertBusinessRule').data;
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
