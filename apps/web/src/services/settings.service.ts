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

export const SetupChecklistItemSchema = z.object({
  key: z.enum(['company_profile', 'tax_rates', 'currencies', 'invoice_series', 'products', 'contacts', 'data_quality']),
  label: z.string(),
  description: z.string(),
  completed: z.boolean(),
  count: z.coerce.number(),
  href: z.string(),
  actionLabel: z.string(),
  severity: z.enum(['required', 'recommended']),
});

export const SetupChecklistStatusSchema = z.object({
  summary: z.object({
    total: z.coerce.number(),
    completed: z.coerce.number(),
    remaining: z.coerce.number(),
    percent: z.coerce.number(),
  }),
  items: z.array(SetupChecklistItemSchema),
  generatedAt: z.string(),
});

export type TenantSetting = z.infer<typeof TenantSettingSchema>;
export type ModuleSetting = z.infer<typeof ModuleSettingSchema>;
export type BusinessRule = z.infer<typeof BusinessRuleSchema>;
export type TenantSecurityScore = z.infer<typeof TenantSecurityScoreSchema>;
export type SecuritySession = z.infer<typeof SecuritySessionSchema>;
export type SecurityHardeningSnapshot = z.infer<typeof SecurityHardeningSnapshotSchema>;
export type SetupChecklistItem = z.infer<typeof SetupChecklistItemSchema>;
export type SetupChecklistStatus = z.infer<typeof SetupChecklistStatusSchema>;

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

export async function getSetupChecklist(): Promise<SetupChecklistStatus> {
  const res = await apiClient.get('/api/settings/setup-checklist');
  return safeParse(SingleResponseSchema(SetupChecklistStatusSchema), res.data, 'getSetupChecklist').data;
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

export interface QuickStartDTO {
  companyName: string;
  taxNumber?: string;
  taxOffice?: string;
  address?: string;
  city?: string;
  warehouseName: string;
  currencyCode: string;
  invoicePrefix: string;
  firstProductCode: string;
  firstProductName: string;
  firstProductPrice: number;
  firstProductTaxRate: number;
  firstContactName: string;
  firstContactCode: string;
  firstContactType: 'CUSTOMER' | 'SUPPLIER' | 'BOTH';
  firstContactTaxNumber: string;
  firstContactEmail?: string;
  firstContactPhone?: string;
}

export async function runQuickStart(data: QuickStartDTO): Promise<unknown> {
  const res = await apiClient.post('/api/settings/quick-start', data);
  return res.data;
}

export async function cleanDemoData(): Promise<unknown> {
  const res = await apiClient.post('/api/settings/clean-demo-data');
  return res.data;
}

// ── Corporate Security Settings ─────────────────

export const CorporateSecuritySettingsSchema = z.object({
  ssoEnabled: z.boolean(),
  ssoProvider: z.string(),
  samlMetadataUrl: z.string(),
  oidcClientId: z.string(),
  oidcClientSecret: z.string(),
  scimEnabled: z.boolean(),
  scimToken: z.string(),
  scimRoleSyncEnabled: z.boolean().default(false),
  scimDefaultRoleId: z.string().default(''),
  scimRoleMappings: z.string().default('[]'),
  ipRestrictionEnabled: z.boolean(),
  ipWhitelist: z.string(),
  sessionMaxAgeDays: z.coerce.number(),
  sessionConcurrentLimit: z.coerce.number(),
  sessionIdleTimeoutMins: z.coerce.number(),
});

export type CorporateSecuritySettings = z.infer<typeof CorporateSecuritySettingsSchema>;

export async function getCorporateSecuritySettings(): Promise<CorporateSecuritySettings> {
  const res = await apiClient.get('/api/settings/security/corporate');
  return safeParse(SingleResponseSchema(CorporateSecuritySettingsSchema), res.data, 'getCorporateSecuritySettings').data;
}

export async function updateCorporateSecuritySettings(data: CorporateSecuritySettings): Promise<void> {
  await apiClient.post('/api/settings/security/corporate', data);
}

export async function generateScimToken(): Promise<{ token: string }> {
  const res = await apiClient.post('/api/settings/security/scim/generate-token');
  return safeParse(SingleResponseSchema(z.object({ token: z.string() })), res.data, 'generateScimToken').data;
}

export const SiemSettingsSchema = z.object({
  enabled: z.boolean(),
  destinationType: z.enum(['webhook', 'syslog', 'generic']),
  endpointUrl: z.string(),
  authHeader: z.string(),
  minSeverity: z.enum(['info', 'warning', 'critical']),
  includeDiff: z.boolean(),
  lastExportAt: z.string().nullable(),
  lastStatus: z.string().nullable(),
});

export const SiemExportResultSchema = z.object({
  status: z.enum(['skipped', 'delivered', 'prepared', 'failed']),
  destinationType: z.enum(['webhook', 'syslog', 'generic']),
  eventCount: z.coerce.number(),
  exportedAt: z.string(),
  message: z.string(),
  sample: z.string(),
});

export type SiemSettings = z.infer<typeof SiemSettingsSchema>;
export type SiemExportResult = z.infer<typeof SiemExportResultSchema>;

export async function getSiemSettings(): Promise<SiemSettings> {
  const res = await apiClient.get('/api/settings/security/siem');
  return safeParse(SingleResponseSchema(SiemSettingsSchema), res.data, 'getSiemSettings').data;
}

export async function updateSiemSettings(data: SiemSettings): Promise<void> {
  await apiClient.post('/api/settings/security/siem', data);
}

export async function runSiemExportTest(): Promise<SiemExportResult> {
  const res = await apiClient.post('/api/settings/security/siem/test-export');
  return safeParse(SingleResponseSchema(SiemExportResultSchema), res.data, 'runSiemExportTest').data;
}

export const RetentionModuleKeySchema = z.enum([
  'audit_logs',
  'contacts',
  'invoices',
  'accounting',
  'inventory',
  'hr',
  'mail',
  'notifications',
  'marketplace',
]);

export const RetentionActionSchema = z.enum(['review', 'archive', 'anonymize', 'legal_hold']);

export const RetentionPolicyRuleSchema = z.object({
  module: RetentionModuleKeySchema,
  retentionDays: z.coerce.number().int().positive(),
  action: RetentionActionSchema,
  legalArchive: z.boolean(),
  anonymizeFields: z.array(z.string()),
  gdprBasis: z.string(),
  enabled: z.boolean(),
});

export const DataRetentionSettingsSchema = z.object({
  enabled: z.boolean(),
  legalArchiveEnabled: z.boolean(),
  kvkkGdprEnabled: z.boolean(),
  rules: z.array(RetentionPolicyRuleSchema),
  lastRunAt: z.string().nullable(),
  lastSummary: z.string().nullable(),
});

export const DataRetentionPreviewItemSchema = z.object({
  module: RetentionModuleKeySchema,
  cutoffDate: z.string(),
  candidateCount: z.coerce.number(),
  action: RetentionActionSchema,
  legalArchive: z.boolean(),
  anonymizeFields: z.array(z.string()),
  gdprBasis: z.string(),
  enabled: z.boolean(),
});

export const DataRetentionPreviewSchema = z.object({
  generatedAt: z.string(),
  enabled: z.boolean(),
  legalArchiveEnabled: z.boolean(),
  kvkkGdprEnabled: z.boolean(),
  totalCandidates: z.coerce.number(),
  items: z.array(DataRetentionPreviewItemSchema),
});

export type RetentionModuleKey = z.infer<typeof RetentionModuleKeySchema>;
export type RetentionAction = z.infer<typeof RetentionActionSchema>;
export type RetentionPolicyRule = z.infer<typeof RetentionPolicyRuleSchema>;
export type DataRetentionSettings = z.infer<typeof DataRetentionSettingsSchema>;
export type DataRetentionPreview = z.infer<typeof DataRetentionPreviewSchema>;

export async function getDataRetentionSettings(): Promise<DataRetentionSettings> {
  const res = await apiClient.get('/api/settings/security/data-retention');
  return safeParse(SingleResponseSchema(DataRetentionSettingsSchema), res.data, 'getDataRetentionSettings').data;
}

export async function updateDataRetentionSettings(data: DataRetentionSettings): Promise<void> {
  await apiClient.post('/api/settings/security/data-retention', data);
}

export async function previewDataRetention(): Promise<DataRetentionPreview> {
  const res = await apiClient.get('/api/settings/security/data-retention/preview');
  return safeParse(SingleResponseSchema(DataRetentionPreviewSchema), res.data, 'previewDataRetention').data;
}

export async function runDataRetentionDryRun(): Promise<DataRetentionPreview> {
  const res = await apiClient.post('/api/settings/security/data-retention/dry-run');
  return safeParse(SingleResponseSchema(DataRetentionPreviewSchema), res.data, 'runDataRetentionDryRun').data;
}

export const DeploymentOperationsSettingsSchema = z.object({
  environmentName: z.string(),
  releaseChannel: z.string(),
  backupEnabled: z.boolean(),
  backupFrequency: z.enum(['hourly', 'daily', 'weekly']),
  backupRetentionDays: z.coerce.number(),
  backupLastRunAt: z.string().nullable(),
  backupLastStatus: z.string().nullable(),
  maintenanceWindow: z.string(),
});

export const DeploymentHealthCheckSchema = z.object({
  key: z.string(),
  label: z.string(),
  status: z.enum(['ok', 'warn', 'fail']),
  message: z.string(),
});

export const DeploymentOperationsSnapshotSchema = z.object({
  tenant: z.object({
    id: z.string(),
    companyName: z.string(),
    plan: z.enum(['STARTER', 'PROFESSIONAL', 'ENTERPRISE']),
    deploymentType: z.enum(['CLOUD', 'ON_PREMISE']),
  }),
  environment: z.object({
    name: z.string(),
    nodeEnv: z.string(),
    appRole: z.string(),
    releaseChannel: z.string(),
    version: z.string(),
    maintenanceWindow: z.string(),
  }),
  backup: z.object({
    enabled: z.boolean(),
    frequency: z.enum(['hourly', 'daily', 'weekly']),
    retentionDays: z.coerce.number(),
    lastRunAt: z.string().nullable(),
    lastStatus: z.string().nullable(),
  }),
  health: z.object({
    status: z.enum(['ok', 'warn', 'fail']),
    checks: z.array(DeploymentHealthCheckSchema),
  }),
  migrations: z.object({
    totalMigrations: z.coerce.number(),
    appliedMigrations: z.coerce.number().nullable(),
    pendingMigrations: z.array(z.string()),
    latestMigration: z.string().nullable(),
    checkedAt: z.string(),
  }),
  generatedAt: z.string(),
});

export const DeploymentBackupSimulationSchema = z.object({
  lastRunAt: z.string(),
  lastStatus: z.string(),
  snapshot: DeploymentOperationsSnapshotSchema.nullable(),
});

export type DeploymentOperationsSettings = z.infer<typeof DeploymentOperationsSettingsSchema>;
export type DeploymentOperationsSnapshot = z.infer<typeof DeploymentOperationsSnapshotSchema>;
export type DeploymentBackupSimulation = z.infer<typeof DeploymentBackupSimulationSchema>;

export async function getDeploymentOperationsSnapshot(): Promise<DeploymentOperationsSnapshot> {
  const res = await apiClient.get('/api/settings/security/deployment-operations');
  return safeParse(SingleResponseSchema(DeploymentOperationsSnapshotSchema), res.data, 'getDeploymentOperationsSnapshot').data;
}

export async function getDeploymentOperationsSettings(): Promise<DeploymentOperationsSettings> {
  const res = await apiClient.get('/api/settings/security/deployment-operations/settings');
  return safeParse(SingleResponseSchema(DeploymentOperationsSettingsSchema), res.data, 'getDeploymentOperationsSettings').data;
}

export async function updateDeploymentOperationsSettings(data: DeploymentOperationsSettings): Promise<void> {
  await apiClient.post('/api/settings/security/deployment-operations/settings', data);
}

export async function simulateDeploymentBackup(): Promise<DeploymentBackupSimulation> {
  const res = await apiClient.post('/api/settings/security/deployment-operations/backup-simulation');
  return safeParse(SingleResponseSchema(DeploymentBackupSimulationSchema), res.data, 'simulateDeploymentBackup').data;
}

// ── BI & Data Warehouse Settings ────────────────

export const BiSettingsSchema = z.object({
  enabled: z.boolean(),
  interval: z.string(),
  entities: z.string(),
  lastRun: z.string().nullable(),
  token: z.string(),
});

export type BiSettings = z.infer<typeof BiSettingsSchema>;

export async function getBiSettings(): Promise<BiSettings> {
  const res = await apiClient.get('/api/settings/security/bi');
  return safeParse(SingleResponseSchema(BiSettingsSchema), res.data, 'getBiSettings').data;
}

export async function updateBiSettings(data: BiSettings): Promise<void> {
  await apiClient.post('/api/settings/security/bi', data);
}

export async function generateBiToken(): Promise<{ token: string }> {
  const res = await apiClient.post('/api/settings/security/bi/generate-token');
  return safeParse(SingleResponseSchema(z.object({ token: z.string() })), res.data, 'generateBiToken').data;
}

export async function runBiScheduleSimulation(): Promise<{ lastRun: string }> {
  const res = await apiClient.post('/api/settings/security/bi/run-schedule');
  return safeParse(SingleResponseSchema(z.object({ lastRun: z.string() })), res.data, 'runBiScheduleSimulation').data;
}

// ── Customer Portal & SLA ──────────────────────

export async function getPortalToken(contactId: string): Promise<{ token: string | null }> {
  const res = await apiClient.get(`/api/settings/security/portal-tokens/${contactId}`);
  return safeParse(SingleResponseSchema(z.object({ token: z.string().nullable() })), res.data, 'getPortalToken').data;
}

export async function generatePortalToken(contactId: string): Promise<{ token: string }> {
  const res = await apiClient.post(`/api/settings/security/portal-tokens/${contactId}/generate`);
  return safeParse(SingleResponseSchema(z.object({ token: z.string() })), res.data, 'generatePortalToken').data;
}

export async function runSlaSweep(): Promise<{ checked: number; breachedCount: number; breached: string[] }> {
  const res = await apiClient.post('/api/service/requests/check-sla');
  return safeParse(
    SingleResponseSchema(
      z.object({
        checked: z.number(),
        breachedCount: z.number(),
        breached: z.array(z.string()),
      })
    ),
    res.data,
    'runSlaSweep'
  ).data;
}
