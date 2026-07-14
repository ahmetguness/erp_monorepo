'use client';

import { useState } from 'react';
import { Shield, Key, Globe, Clock, Copy, Check, RefreshCw, Save, UsersRound, RadioTower, Send, Archive, FileCheck, ServerCog, DatabaseBackup } from 'lucide-react';
import { PageHeader } from '@/components/shared/PageHeader';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { useUIStore } from '@/store/ui.store';
import {
  useCorporateSecuritySettings,
  useUpdateCorporateSecuritySettings,
  useGenerateScimToken,
  useSiemSettings,
  useUpdateSiemSettings,
  useRunSiemExportTest,
  useAuditLogFullStatus,
  useUpdateAuditLogFullSettings,
  useDataRetentionSettings,
  useUpdateDataRetentionSettings,
  useDataRetentionPreview,
  useRunDataRetentionDryRun,
  useDeploymentOperationsSnapshot,
  useDeploymentOperationsSettings,
  useUpdateDeploymentOperationsSettings,
  useSimulateDeploymentBackup,
} from '@/hooks/useSettings';
import { useRoles } from '@/hooks/useRoles';
import type { CorporateSecuritySettings, DataRetentionSettings, DeploymentOperationsSettings, RetentionPolicyRule, SiemSettings } from '@/services/settings.service';

interface ScimRoleMappingFormRow {
  group: string;
  roleId: string;
}

function parseScimRoleMappings(value: string): ScimRoleMappingFormRow[] {
  const parsed = (() => {
    try {
      return JSON.parse(value) as unknown;
    } catch {
      return [];
    }
  })();
  if (!Array.isArray(parsed)) return [];
  return parsed
    .filter((item): item is Record<string, unknown> => typeof item === 'object' && item !== null && !Array.isArray(item))
    .map((item) => ({
      group: typeof item.group === 'string' ? item.group : '',
      roleId: typeof item.roleId === 'string' ? item.roleId : '',
    }))
    .filter((item) => item.group.length > 0 || item.roleId.length > 0);
}

function stringifyScimRoleMappings(rows: readonly ScimRoleMappingFormRow[]): string {
  return JSON.stringify(rows.filter((row) => row.group.trim().length > 0 && row.roleId.trim().length > 0));
}

const DEFAULT_SECURITY_FORM: CorporateSecuritySettings = {
  ssoEnabled: false,
  ssoProvider: 'saml',
  samlMetadataUrl: '',
  oidcClientId: '',
  oidcClientSecret: '',
  scimEnabled: false,
  scimToken: '',
  scimRoleSyncEnabled: false,
  scimDefaultRoleId: '',
  scimRoleMappings: '[]',
  ipRestrictionEnabled: false,
  ipWhitelist: '',
  sessionMaxAgeDays: 7,
  sessionConcurrentLimit: 5,
  sessionIdleTimeoutMins: 30,
};

const DEFAULT_SIEM_FORM: SiemSettings = {
  enabled: false,
  destinationType: 'webhook',
  endpointUrl: '',
  authHeader: '',
  minSeverity: 'warning',
  includeDiff: true,
  lastExportAt: null,
  lastStatus: null,
};

const RETENTION_MODULE_LABELS: Record<RetentionPolicyRule['module'], string> = {
  audit_logs: 'Audit log',
  contacts: 'Cari hesaplar',
  invoices: 'Faturalar',
  accounting: 'Muhasebe',
  inventory: 'Stok',
  hr: 'IK / Personel',
  mail: 'Mail merkezi',
  notifications: 'Bildirimler',
  marketplace: 'Pazaryeri',
};

const RETENTION_ACTION_LABELS: Record<RetentionPolicyRule['action'], string> = {
  review: 'Manuel inceleme',
  archive: 'Arsivle',
  anonymize: 'Anonimlestir',
  legal_hold: 'Yasal arsivde tut',
};

const DEFAULT_RETENTION_FORM: DataRetentionSettings = {
  enabled: false,
  legalArchiveEnabled: true,
  kvkkGdprEnabled: true,
  lastRunAt: null,
  lastSummary: null,
  rules: [
    { module: 'audit_logs', retentionDays: 2555, action: 'legal_hold', legalArchive: true, anonymizeFields: ['ipAddress', 'userAgent'], gdprBasis: 'legal_obligation', enabled: true },
    { module: 'contacts', retentionDays: 1825, action: 'anonymize', legalArchive: true, anonymizeFields: ['taxNumber', 'email', 'phone', 'address'], gdprBasis: 'legitimate_interest', enabled: true },
    { module: 'invoices', retentionDays: 3650, action: 'legal_hold', legalArchive: true, anonymizeFields: [], gdprBasis: 'legal_obligation', enabled: true },
    { module: 'accounting', retentionDays: 3650, action: 'legal_hold', legalArchive: true, anonymizeFields: [], gdprBasis: 'legal_obligation', enabled: true },
    { module: 'inventory', retentionDays: 1825, action: 'archive', legalArchive: false, anonymizeFields: [], gdprBasis: 'legitimate_interest', enabled: true },
    { module: 'hr', retentionDays: 3650, action: 'anonymize', legalArchive: true, anonymizeFields: ['email', 'phone', 'salary'], gdprBasis: 'legal_obligation', enabled: true },
    { module: 'mail', retentionDays: 1095, action: 'archive', legalArchive: false, anonymizeFields: ['to', 'cc', 'bcc'], gdprBasis: 'consent', enabled: true },
    { module: 'notifications', retentionDays: 365, action: 'archive', legalArchive: false, anonymizeFields: ['message'], gdprBasis: 'legitimate_interest', enabled: true },
    { module: 'marketplace', retentionDays: 1825, action: 'anonymize', legalArchive: true, anonymizeFields: ['customerEmail', 'customerPhone', 'shippingAddress'], gdprBasis: 'contract', enabled: true },
  ],
};

const DEFAULT_DEPLOYMENT_OPERATIONS_FORM: DeploymentOperationsSettings = {
  environmentName: 'production',
  releaseChannel: 'stable',
  backupEnabled: true,
  backupFrequency: 'daily',
  backupRetentionDays: 30,
  backupLastRunAt: null,
  backupLastStatus: null,
  maintenanceWindow: 'Sunday 02:00-04:00',
};

export default function CorporateSecurityPage() {
  const { data: settings, isLoading } = useCorporateSecuritySettings();
  const { data: siemSettings } = useSiemSettings();
  const { data: auditLogFullStatus } = useAuditLogFullStatus();
  const { data: retentionSettings } = useDataRetentionSettings();
  const { data: retentionPreview } = useDataRetentionPreview();
  const { data: deploymentSnapshot } = useDeploymentOperationsSnapshot();
  const { data: deploymentSettings } = useDeploymentOperationsSettings();
  const updateSettings = useUpdateCorporateSecuritySettings();
  const generateScim = useGenerateScimToken();
  const updateSiemSettings = useUpdateSiemSettings();
  const runSiemExportTest = useRunSiemExportTest();
  const updateAuditLogFullSettings = useUpdateAuditLogFullSettings();
  const updateRetentionSettings = useUpdateDataRetentionSettings();
  const runRetentionDryRun = useRunDataRetentionDryRun();
  const updateDeploymentSettings = useUpdateDeploymentOperationsSettings();
  const simulateDeploymentBackup = useSimulateDeploymentBackup();
  const { data: rolesData } = useRoles({ page: 1, limit: 100 });
  const { toast } = useUIStore();

  const [draftForm, setDraftForm] = useState<CorporateSecuritySettings | null>(null);
  const [draftSiemForm, setDraftSiemForm] = useState<SiemSettings | null>(null);
  const [draftRetentionForm, setDraftRetentionForm] = useState<DataRetentionSettings | null>(null);
  const [draftDeploymentForm, setDraftDeploymentForm] = useState<DeploymentOperationsSettings | null>(null);
  const [copied, setCopied] = useState(false);
  const [draftScimMappings, setDraftScimMappings] = useState<ScimRoleMappingFormRow[] | null>(null);
  const roles = rolesData?.data ?? [];
  const form = draftForm ?? settings ?? DEFAULT_SECURITY_FORM;
  const siemForm = draftSiemForm ?? siemSettings ?? DEFAULT_SIEM_FORM;
  const retentionForm = draftRetentionForm ?? retentionSettings ?? DEFAULT_RETENTION_FORM;
  const deploymentForm = draftDeploymentForm ?? deploymentSettings ?? DEFAULT_DEPLOYMENT_OPERATIONS_FORM;
  const scimMappings = draftScimMappings ?? parseScimRoleMappings(form.scimRoleMappings);

  const setForm = (updater: (current: CorporateSecuritySettings) => CorporateSecuritySettings) => {
    setDraftForm((current) => updater(current ?? settings ?? DEFAULT_SECURITY_FORM));
  };

  const setScimMappings = (updater: (current: ScimRoleMappingFormRow[]) => ScimRoleMappingFormRow[]) => {
    setDraftScimMappings((current) => updater(current ?? parseScimRoleMappings(form.scimRoleMappings)));
  };

  const setSiemForm = (updater: (current: SiemSettings) => SiemSettings) => {
    setDraftSiemForm((current) => updater(current ?? siemSettings ?? DEFAULT_SIEM_FORM));
  };

  const setRetentionForm = (updater: (current: DataRetentionSettings) => DataRetentionSettings) => {
    setDraftRetentionForm((current) => updater(current ?? retentionSettings ?? DEFAULT_RETENTION_FORM));
  };

  const updateRetentionRule = (module: RetentionPolicyRule['module'], updater: (rule: RetentionPolicyRule) => RetentionPolicyRule) => {
    setRetentionForm((current) => ({
      ...current,
      rules: current.rules.map((rule) => rule.module === module ? updater(rule) : rule),
    }));
  };

  const setDeploymentForm = (updater: (current: DeploymentOperationsSettings) => DeploymentOperationsSettings) => {
    setDraftDeploymentForm((current) => updater(current ?? deploymentSettings ?? DEFAULT_DEPLOYMENT_OPERATIONS_FORM));
  };

  const handleCopyToken = () => {
    if (form.scimToken) {
      navigator.clipboard.writeText(form.scimToken);
      setCopied(true);
      toast.success('SCIM Token panoya kopyalandı.');
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleGenerateScimToken = () => {
    if (confirm('Yeni bir SCIM entegrasyon tokenı oluşturmak istediğinize emin misiniz? Eski token geçersiz kalacaktır.')) {
      generateScim.mutate(undefined, {
        onSuccess: (data) => {
          setForm((prev) => ({ ...prev, scimToken: data.token }));
        },
      });
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    updateSettings.mutate({ ...form, scimRoleMappings: stringifyScimRoleMappings(scimMappings) });
  };

  const handleSaveSiemSettings = () => {
    updateSiemSettings.mutate(siemForm);
  };

  const handleSaveRetentionSettings = () => {
    updateRetentionSettings.mutate(retentionForm);
  };

  const handleSaveDeploymentSettings = () => {
    updateDeploymentSettings.mutate(deploymentForm);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="w-8 h-8 border-4 border-sky-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl space-y-6">
      <PageHeader
        title="Kurumsal Güvenlik Politikaları"
        subtitle="SSO (SAML/OIDC), SCIM kullanıcı eşitleme, IP kısıtlamaları ve oturum politikalarını yönetin."
      />

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* SSO Panel */}
        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 space-y-4 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-sky-500/5 rounded-full blur-3xl pointer-events-none" />
          <div className="flex items-center gap-3 border-b border-slate-800 pb-4">
            <div className="w-10 h-10 rounded-xl bg-sky-500/10 flex items-center justify-center shrink-0">
              <Key className="w-5 h-5 text-sky-400" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-white">Tekli Oturum Açma (SSO / SAML / OIDC)</h3>
              <p className="text-xs text-slate-500">Okta, Azure AD (Entra ID) veya Google Workspace ile oturum açmayı zorunlu kılın.</p>
            </div>
          </div>

          <div className="space-y-4">
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={form.ssoEnabled}
                onChange={(e) => setForm((prev) => ({ ...prev, ssoEnabled: e.target.checked }))}
                className="w-4.5 h-4.5 rounded border-slate-800 bg-slate-950 text-sky-500 focus:ring-sky-500/20"
              />
              <span className="text-sm text-slate-200 font-medium">SSO Girişini Etkinleştir</span>
            </label>

            {form.ssoEnabled && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 pl-7 border-l-2 border-slate-800">
                <div className="space-y-2">
                  <label className="text-xs text-slate-400 font-medium">SSO Sağlayıcı Tipi</label>
                  <select
                    value={form.ssoProvider}
                    onChange={(e) => setForm((prev) => ({ ...prev, ssoProvider: e.target.value }))}
                    className="w-full h-10 px-3 rounded-lg border border-slate-800 bg-slate-950 text-slate-200 text-sm focus:border-sky-500/50 focus:outline-none transition-colors"
                  >
                    <option value="saml">SAML 2.0</option>
                    <option value="oidc">OpenID Connect (OIDC)</option>
                  </select>
                </div>

                {form.ssoProvider === 'saml' ? (
                  <div className="space-y-2 col-span-2">
                    <Input
                      label="SAML Metadata URL / XML"
                      placeholder="https://identityprovider.okta.com/app/.../metadata"
                      value={form.samlMetadataUrl}
                      onChange={(e) => setForm((prev) => ({ ...prev, samlMetadataUrl: e.target.value }))}
                    />
                  </div>
                ) : (
                  <>
                    <div className="space-y-2">
                      <Input
                        label="OIDC Client ID"
                        placeholder="client_id"
                        value={form.oidcClientId}
                        onChange={(e) => setForm((prev) => ({ ...prev, oidcClientId: e.target.value }))}
                      />
                    </div>
                    <div className="space-y-2">
                      <Input
                        label="OIDC Client Secret"
                        type="password"
                        placeholder="••••••••••••••••"
                        value={form.oidcClientSecret}
                        onChange={(e) => setForm((prev) => ({ ...prev, oidcClientSecret: e.target.value }))}
                      />
                    </div>
                  </>
                )}

                <div className="bg-slate-950/60 border border-slate-850 p-4 rounded-xl col-span-2 mt-2">
                  <span className="text-xs font-semibold text-slate-300 block mb-1">Kurumsal Giriş Bağlantısı (Simülasyon):</span>
                  <span className="text-[11px] text-slate-500 font-mono select-all">
                    /api/auth/sso/login (email ve tenantSlug parametreleri ile)
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* SCIM Panel */}
        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 space-y-4 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/5 rounded-full blur-3xl pointer-events-none" />
          <div className="flex items-center gap-3 border-b border-slate-800 pb-4">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center shrink-0">
              <Globe className="w-5 h-5 text-emerald-400" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-white">SCIM 2.0 Kullanıcı Provizyonlama</h3>
              <p className="text-xs text-slate-500">Okta veya Azure AD üzerinden kullanıcıları otomatik ekleyin, güncelleyin veya pasife alın.</p>
            </div>
          </div>

          <div className="space-y-4">
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={form.scimEnabled}
                onChange={(e) => setForm((prev) => ({ ...prev, scimEnabled: e.target.checked }))}
                className="w-4.5 h-4.5 rounded border-slate-800 bg-slate-950 text-emerald-500 focus:ring-emerald-500/20"
              />
              <span className="text-sm text-slate-200 font-medium">SCIM Provizyonlamayı Etkinleştir</span>
            </label>

            {form.scimEnabled && (
              <div className="space-y-4 pt-2 pl-7 border-l-2 border-slate-800">
                <div className="space-y-2">
                  <label className="text-xs text-slate-400 font-medium">SCIM Base URL</label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      readOnly
                      value={`${window.location.origin}/api/scim/v2`}
                      className="flex-1 h-10 px-3 rounded-lg border border-slate-800 bg-slate-950 text-slate-400 text-xs font-mono focus:outline-none"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-xs text-slate-400 font-medium">SCIM Bearer Token</label>
                  <div className="flex gap-2">
                    <input
                      type={form.scimToken ? 'text' : 'password'}
                      readOnly
                      placeholder="Henüz token oluşturulmadı"
                      value={form.scimToken || '••••••••••••••••••••••••'}
                      className="flex-1 h-10 px-3 rounded-lg border border-slate-800 bg-slate-950 text-slate-200 text-xs font-mono focus:outline-none"
                    />
                    {form.scimToken && (
                      <Button type="button" variant="secondary" size="sm" onClick={handleCopyToken} className="px-3 shrink-0">
                        {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                      </Button>
                    )}
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={handleGenerateScimToken}
                      loading={generateScim.isPending}
                      className="shrink-0"
                    >
                      <RefreshCw className="w-4 h-4" />
                      Token Üret
                    </Button>
                  </div>
                </div>

                <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-4 space-y-4">
                  <div className="flex items-center gap-2">
                    <UsersRound className="h-4 w-4 text-emerald-400" />
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Kullanıcı / rol senkronizasyonu</p>
                      <p className="mt-1 text-xs text-slate-500">SCIM Groups rollere baglanir; /Groups endpointi rollerinizi provider tarafina yayinlar.</p>
                    </div>
                  </div>

                  <label className="flex items-center gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={form.scimRoleSyncEnabled}
                      onChange={(e) => setForm((prev) => ({ ...prev, scimRoleSyncEnabled: e.target.checked }))}
                      className="w-4.5 h-4.5 rounded border-slate-800 bg-slate-950 text-emerald-500 focus:ring-emerald-500/20"
                    />
                    <span className="text-sm text-slate-200 font-medium">SCIM group bilgisiyle rol atamasini senkronize et</span>
                  </label>

                  <div className="grid gap-4 md:grid-cols-2">
                    <label className="space-y-2">
                      <span className="text-xs text-slate-400 font-medium">Varsayilan rol</span>
                      <select
                        value={form.scimDefaultRoleId}
                        onChange={(e) => setForm((prev) => ({ ...prev, scimDefaultRoleId: e.target.value }))}
                        className="w-full h-10 px-3 rounded-lg border border-slate-800 bg-slate-950 text-slate-200 text-sm focus:border-emerald-500/50 focus:outline-none"
                      >
                        <option value="">Rol atama</option>
                        {roles.map((role) => (
                          <option key={role.id} value={role.id}>{role.name}</option>
                        ))}
                      </select>
                    </label>
                    <div className="rounded-lg border border-slate-800 bg-slate-900/50 p-3">
                      <p className="text-xs font-semibold text-slate-300">Group endpointleri</p>
                      <p className="mt-1 text-[11px] text-slate-500 font-mono">GET /api/scim/v2/Groups</p>
                      <p className="text-[11px] text-slate-500 font-mono">PATCH /api/scim/v2/Groups/:roleId</p>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-slate-400 font-medium">Provider group to Axon rol eslestirmeleri</span>
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        onClick={() => setScimMappings((current) => [...current, { group: '', roleId: '' }])}
                      >
                        Satir ekle
                      </Button>
                    </div>
                    <div className="space-y-2">
                      {scimMappings.length === 0 ? (
                        <p className="rounded-lg border border-slate-800 bg-slate-900/50 p-3 text-xs text-slate-500">
                          Mapping yoksa provider group adi ile Axon rol adi ayni olan kayitlar otomatik eslesir.
                        </p>
                      ) : (
                        scimMappings.map((mapping, index) => (
                          <div key={`${mapping.group}-${index}`} className="grid gap-2 md:grid-cols-[minmax(0,1fr)_220px_32px]">
                            <input
                              value={mapping.group}
                              onChange={(event) => setScimMappings((current) => current.map((row, rowIndex) => rowIndex === index ? { ...row, group: event.target.value } : row))}
                              placeholder="Okta/Entra group adi"
                              className="h-10 px-3 rounded-lg border border-slate-800 bg-slate-950 text-slate-200 text-sm focus:border-emerald-500/50 focus:outline-none"
                            />
                            <select
                              value={mapping.roleId}
                              onChange={(event) => setScimMappings((current) => current.map((row, rowIndex) => rowIndex === index ? { ...row, roleId: event.target.value } : row))}
                              className="h-10 px-3 rounded-lg border border-slate-800 bg-slate-950 text-slate-200 text-sm focus:border-emerald-500/50 focus:outline-none"
                            >
                              <option value="">Rol sec</option>
                              {roles.map((role) => (
                                <option key={role.id} value={role.id}>{role.name}</option>
                              ))}
                            </select>
                            <button
                              type="button"
                              onClick={() => setScimMappings((current) => current.filter((_, rowIndex) => rowIndex !== index))}
                              className="h-10 rounded-lg border border-slate-800 text-slate-400 hover:border-red-500/30 hover:text-red-300"
                            >
                              x
                            </button>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Audit Log Full Panel */}
        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 space-y-4 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-violet-500/5 rounded-full blur-3xl pointer-events-none" />
          <div className="flex items-center gap-3 border-b border-slate-800 pb-4">
            <div className="w-10 h-10 rounded-xl bg-violet-500/10 flex items-center justify-center shrink-0">
              <Shield className="w-5 h-5 text-violet-400" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-white">Audit Log Full</h3>
              <p className="text-xs text-slate-500">Retention, export API, SIEM push ve immutable log zinciri tek kontrolde izlenir.</p>
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-4">
            <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
              <p className="text-[10px] uppercase tracking-wide text-slate-500">Audit seviyesi</p>
              <p className="mt-1 text-sm font-semibold text-slate-100">{auditLogFullStatus?.auditLevel ?? 'full'}</p>
            </div>
            <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
              <p className="text-[10px] uppercase tracking-wide text-slate-500">Retention</p>
              <p className="mt-1 text-sm font-semibold text-slate-100">
                {auditLogFullStatus?.retention.auditLogRule
                  ? auditLogFullStatus.retention.auditLogRule.retentionDays === null
                    ? 'Limitsiz'
                    : `${auditLogFullStatus.retention.auditLogRule.retentionDays} gun`
                  : 'kural yok'}
              </p>
              <p className="mt-1 text-[11px] text-slate-500">
                {auditLogFullStatus?.retention.auditLogRule?.legalArchive ? 'Yasal arsiv aktif' : 'Yasal arsiv kapali'}
              </p>
            </div>
            <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
              <p className="text-[10px] uppercase tracking-wide text-slate-500">Export API</p>
              <p className={`mt-1 text-sm font-semibold ${auditLogFullStatus?.exportApi.enabled ? 'text-emerald-300' : 'text-slate-400'}`}>
                {auditLogFullStatus?.exportApi.enabled ? 'Aktif' : 'Kapalı'}
              </p>
              <p className="mt-1 text-[11px] text-slate-500">Limit {auditLogFullStatus?.exportApi.maxRows ?? 10000} satir</p>
            </div>
            <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
              <p className="text-[10px] uppercase tracking-wide text-slate-500">SIEM push</p>
              <p className={`mt-1 text-sm font-semibold ${auditLogFullStatus?.siemPush.enabled ? 'text-emerald-300' : 'text-slate-400'}`}>
                {auditLogFullStatus?.siemPush.enabled ? auditLogFullStatus.siemPush.destinationType : 'Kapalı'}
              </p>
              <p className="mt-1 text-[11px] text-slate-500">{auditLogFullStatus?.siemPush.lastStatus ?? 'Son durum yok'}</p>
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-[1fr_auto] md:items-center rounded-xl border border-slate-800 bg-slate-950/60 p-4">
            <div>
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={auditLogFullStatus?.immutable.enabled ?? false}
                  onChange={(e) => updateAuditLogFullSettings.mutate({ immutableEnabled: e.target.checked })}
                  disabled={updateAuditLogFullSettings.isPending}
                  className="w-4.5 h-4.5 rounded border-slate-800 bg-slate-950 text-violet-500 focus:ring-violet-500/20"
                />
                <span className="text-sm text-slate-200 font-medium">Immutable hash zinciri aktif</span>
              </label>
              <p className="mt-2 text-[11px] text-slate-500">
                Son log: {auditLogFullStatus?.immutable.lastLogId ?? 'yok'} - Son hash: {auditLogFullStatus?.immutable.lastHash?.slice(0, 16) ?? 'yok'}
              </p>
            </div>
            <div className="text-right text-[11px] text-slate-500">
              <p>Durum zamani</p>
              <p className="font-mono text-slate-400">{auditLogFullStatus?.generatedAt ?? '-'}</p>
            </div>
          </div>
        </div>

        {/* SIEM Panel */}
        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 space-y-4 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-cyan-500/5 rounded-full blur-3xl pointer-events-none" />
          <div className="flex items-center gap-3 border-b border-slate-800 pb-4">
            <div className="w-10 h-10 rounded-xl bg-cyan-500/10 flex items-center justify-center shrink-0">
              <RadioTower className="w-5 h-5 text-cyan-400" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-white">SIEM / Syslog Audit Export</h3>
              <p className="text-xs text-slate-500">Audit log full seviyesini webhook, syslog uyumlu satır veya generic JSON export ile SIEM tarafına aktarın.</p>
            </div>
          </div>

          <div className="space-y-4">
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={siemForm.enabled}
                onChange={(e) => setSiemForm((prev) => ({ ...prev, enabled: e.target.checked }))}
                className="w-4.5 h-4.5 rounded border-slate-800 bg-slate-950 text-cyan-500 focus:ring-cyan-500/20"
              />
              <span className="text-sm text-slate-200 font-medium">SIEM push/export aktif</span>
            </label>

            <div className="grid gap-4 md:grid-cols-3">
              <label className="space-y-2">
                <span className="text-xs text-slate-400 font-medium">Hedef tipi</span>
                <select
                  value={siemForm.destinationType}
                  onChange={(e) => setSiemForm((prev) => ({ ...prev, destinationType: e.target.value as SiemSettings['destinationType'] }))}
                  className="w-full h-10 px-3 rounded-lg border border-slate-800 bg-slate-950 text-slate-200 text-sm focus:border-cyan-500/50 focus:outline-none"
                >
                  <option value="webhook">Webhook JSON</option>
                  <option value="syslog">Syslog RFC5424</option>
                  <option value="generic">Generic SIEM JSON</option>
                </select>
              </label>

              <label className="space-y-2">
                <span className="text-xs text-slate-400 font-medium">Minimum seviye</span>
                <select
                  value={siemForm.minSeverity}
                  onChange={(e) => setSiemForm((prev) => ({ ...prev, minSeverity: e.target.value as SiemSettings['minSeverity'] }))}
                  className="w-full h-10 px-3 rounded-lg border border-slate-800 bg-slate-950 text-slate-200 text-sm focus:border-cyan-500/50 focus:outline-none"
                >
                  <option value="info">Info ve ustu</option>
                  <option value="warning">Warning ve ustu</option>
                  <option value="critical">Sadece critical</option>
                </select>
              </label>

              <label className="flex items-end gap-3 pb-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={siemForm.includeDiff}
                  onChange={(e) => setSiemForm((prev) => ({ ...prev, includeDiff: e.target.checked }))}
                  className="w-4.5 h-4.5 rounded border-slate-800 bg-slate-950 text-cyan-500 focus:ring-cyan-500/20"
                />
                <span className="text-sm text-slate-200 font-medium">Diff alanlarini dahil et</span>
              </label>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <Input
                label="SIEM endpoint URL"
                placeholder="https://siem.example.com/audit/webhook"
                value={siemForm.endpointUrl}
                onChange={(e) => setSiemForm((prev) => ({ ...prev, endpointUrl: e.target.value }))}
              />
              <Input
                label="Auth header"
                placeholder="Authorization: Bearer token veya x-api-key: key"
                value={siemForm.authHeader}
                onChange={(e) => setSiemForm((prev) => ({ ...prev, authHeader: e.target.value }))}
              />
            </div>

            <div className="grid gap-3 md:grid-cols-[1fr_auto_auto] md:items-end">
              <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
                <p className="text-xs font-semibold text-slate-300">Son SIEM durumu</p>
                <p className="mt-1 text-[11px] text-slate-500">
                  {siemForm.lastStatus ?? 'Henüz export çalismadi.'}
                </p>
                {siemForm.lastExportAt && (
                  <p className="mt-1 text-[11px] font-mono text-slate-600">{siemForm.lastExportAt}</p>
                )}
              </div>
              <Button
                type="button"
                variant="secondary"
                loading={runSiemExportTest.isPending}
                leftIcon={<Send className="h-4 w-4" />}
                onClick={() => runSiemExportTest.mutate()}
              >
                Test Export
              </Button>
              <Button
                type="button"
                variant="secondary"
                loading={updateSiemSettings.isPending}
                leftIcon={<Save className="h-4 w-4" />}
                onClick={handleSaveSiemSettings}
              >
                SIEM Kaydet
              </Button>
            </div>

            {runSiemExportTest.data?.sample && (
              <pre className="max-h-48 overflow-auto rounded-xl border border-slate-800 bg-slate-950 p-3 text-[11px] text-slate-400">
                {runSiemExportTest.data.sample}
              </pre>
            )}
          </div>
        </div>

        {/* Data Retention Panel */}
        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 space-y-4 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-lime-500/5 rounded-full blur-3xl pointer-events-none" />
          <div className="flex items-center gap-3 border-b border-slate-800 pb-4">
            <div className="w-10 h-10 rounded-xl bg-lime-500/10 flex items-center justify-center shrink-0">
              <Archive className="w-5 h-5 text-lime-400" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-white">Veri Saklama ve Arsiv Politikasi</h3>
              <p className="text-xs text-slate-500">Modul bazli saklama suresi, yasal arsiv, anonimlestirme ve KVKK/GDPR dry-run akisini yonetin.</p>
            </div>
          </div>

          <div className="space-y-4">
            <div className="grid gap-3 md:grid-cols-3">
              <label className="flex items-center gap-3 cursor-pointer rounded-xl border border-slate-800 bg-slate-950/60 p-3">
                <input
                  type="checkbox"
                  checked={retentionForm.enabled}
                  onChange={(e) => setRetentionForm((prev) => ({ ...prev, enabled: e.target.checked }))}
                  className="w-4.5 h-4.5 rounded border-slate-800 bg-slate-950 text-lime-500 focus:ring-lime-500/20"
                />
                <span className="text-sm text-slate-200 font-medium">Politika aktif</span>
              </label>
              <label className="flex items-center gap-3 cursor-pointer rounded-xl border border-slate-800 bg-slate-950/60 p-3">
                <input
                  type="checkbox"
                  checked={retentionForm.legalArchiveEnabled}
                  onChange={(e) => setRetentionForm((prev) => ({ ...prev, legalArchiveEnabled: e.target.checked }))}
                  className="w-4.5 h-4.5 rounded border-slate-800 bg-slate-950 text-lime-500 focus:ring-lime-500/20"
                />
                <span className="text-sm text-slate-200 font-medium">Yasal arsiv</span>
              </label>
              <label className="flex items-center gap-3 cursor-pointer rounded-xl border border-slate-800 bg-slate-950/60 p-3">
                <input
                  type="checkbox"
                  checked={retentionForm.kvkkGdprEnabled}
                  onChange={(e) => setRetentionForm((prev) => ({ ...prev, kvkkGdprEnabled: e.target.checked }))}
                  className="w-4.5 h-4.5 rounded border-slate-800 bg-slate-950 text-lime-500 focus:ring-lime-500/20"
                />
                <span className="text-sm text-slate-200 font-medium">KVKK/GDPR alanlari</span>
              </label>
            </div>

            <div className="overflow-x-auto rounded-xl border border-slate-800">
              <table className="min-w-[920px] w-full text-left text-xs">
                <thead className="bg-slate-950/80 text-slate-500">
                  <tr>
                    <th className="px-3 py-2 font-medium">Modul</th>
                    <th className="px-3 py-2 font-medium">Sure (gun)</th>
                    <th className="px-3 py-2 font-medium">Aksiyon</th>
                    <th className="px-3 py-2 font-medium">Anonim alanlar</th>
                    <th className="px-3 py-2 font-medium">KVKK/GDPR dayanak</th>
                    <th className="px-3 py-2 font-medium">Yasal</th>
                    <th className="px-3 py-2 font-medium">Aktif</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800 bg-slate-900/40">
                  {retentionForm.rules.map((rule) => (
                    <tr key={rule.module}>
                      <td className="px-3 py-2 font-medium text-slate-200">{RETENTION_MODULE_LABELS[rule.module]}</td>
                      <td className="px-3 py-2">
                        <input
                          type="number"
                          min={30}
                          value={rule.retentionDays}
                          onChange={(e) => updateRetentionRule(rule.module, (current) => ({ ...current, retentionDays: Number(e.target.value) }))}
                          className="h-9 w-24 rounded-lg border border-slate-800 bg-slate-950 px-2 text-slate-200 focus:border-lime-500/50 focus:outline-none"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <select
                          value={rule.action}
                          onChange={(e) => updateRetentionRule(rule.module, (current) => ({ ...current, action: e.target.value as RetentionPolicyRule['action'] }))}
                          className="h-9 w-36 rounded-lg border border-slate-800 bg-slate-950 px-2 text-slate-200 focus:border-lime-500/50 focus:outline-none"
                        >
                          {Object.entries(RETENTION_ACTION_LABELS).map(([value, label]) => (
                            <option key={value} value={value}>{label}</option>
                          ))}
                        </select>
                      </td>
                      <td className="px-3 py-2">
                        <input
                          value={rule.anonymizeFields.join(', ')}
                          onChange={(e) => updateRetentionRule(rule.module, (current) => ({
                            ...current,
                            anonymizeFields: e.target.value.split(',').map((item) => item.trim()).filter(Boolean),
                          }))}
                          className="h-9 w-48 rounded-lg border border-slate-800 bg-slate-950 px-2 text-slate-200 focus:border-lime-500/50 focus:outline-none"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <input
                          value={rule.gdprBasis}
                          onChange={(e) => updateRetentionRule(rule.module, (current) => ({ ...current, gdprBasis: e.target.value }))}
                          className="h-9 w-40 rounded-lg border border-slate-800 bg-slate-950 px-2 text-slate-200 focus:border-lime-500/50 focus:outline-none"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="checkbox"
                          checked={rule.legalArchive}
                          onChange={(e) => updateRetentionRule(rule.module, (current) => ({ ...current, legalArchive: e.target.checked }))}
                          className="w-4 h-4 rounded border-slate-800 bg-slate-950 text-lime-500 focus:ring-lime-500/20"
                        />
                      </td>
                      <td className="px-3 py-2">
                        <input
                          type="checkbox"
                          checked={rule.enabled}
                          onChange={(e) => updateRetentionRule(rule.module, (current) => ({ ...current, enabled: e.target.checked }))}
                          className="w-4 h-4 rounded border-slate-800 bg-slate-950 text-lime-500 focus:ring-lime-500/20"
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="grid gap-3 md:grid-cols-[1fr_auto_auto] md:items-end">
              <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
                <p className="text-xs font-semibold text-slate-300">Dry-run ozeti</p>
                <p className="mt-1 text-[11px] text-slate-500">
                  {retentionPreview ? `${retentionPreview.totalCandidates} aday kayıt, ${retentionPreview.items.length} modül` : 'Henüz önizleme üretilmedi.'}
                </p>
                {retentionForm.lastRunAt && (
                  <p className="mt-1 font-mono text-[11px] text-slate-600">{retentionForm.lastRunAt}</p>
                )}
              </div>
              <Button
                type="button"
                variant="secondary"
                loading={runRetentionDryRun.isPending}
                leftIcon={<FileCheck className="h-4 w-4" />}
                onClick={() => runRetentionDryRun.mutate()}
              >
                Dry-run
              </Button>
              <Button
                type="button"
                variant="secondary"
                loading={updateRetentionSettings.isPending}
                leftIcon={<Save className="h-4 w-4" />}
                onClick={handleSaveRetentionSettings}
              >
                Retention Kaydet
              </Button>
            </div>

            {(runRetentionDryRun.data ?? retentionPreview)?.items.length ? (
              <div className="grid gap-2 md:grid-cols-3">
                {(runRetentionDryRun.data ?? retentionPreview)?.items.slice(0, 6).map((item) => (
                  <div key={item.module} className="rounded-xl border border-slate-800 bg-slate-950/50 p-3">
                    <p className="text-xs font-semibold text-slate-200">{RETENTION_MODULE_LABELS[item.module]}</p>
                    <p className="mt-1 text-[11px] text-slate-500">{item.candidateCount} aday kayit</p>
                    <p className="mt-1 text-[11px] text-lime-300">{RETENTION_ACTION_LABELS[item.action]}</p>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        </div>

        {/* Deployment Operations Panel */}
        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 space-y-4 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-teal-500/5 rounded-full blur-3xl pointer-events-none" />
          <div className="flex items-center gap-3 border-b border-slate-800 pb-4">
            <div className="w-10 h-10 rounded-xl bg-teal-500/10 flex items-center justify-center shrink-0">
              <ServerCog className="w-5 h-5 text-teal-400" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-white">On-premise / Private Cloud Operasyon Paneli</h3>
              <p className="text-xs text-slate-500">Ortam, versiyon, yedek, health ve migration gorunurlugunu Enterprise icin takip edin.</p>
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-4">
            <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
              <p className="text-[10px] uppercase tracking-wide text-slate-500">Deployment</p>
              <p className="mt-1 text-sm font-semibold text-slate-100">{deploymentSnapshot?.tenant.deploymentType ?? 'CLOUD'}</p>
            </div>
            <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
              <p className="text-[10px] uppercase tracking-wide text-slate-500">Versiyon</p>
              <p className="mt-1 text-sm font-semibold text-slate-100">{deploymentSnapshot?.environment.version ?? 'dev'}</p>
            </div>
            <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
              <p className="text-[10px] uppercase tracking-wide text-slate-500">Health</p>
              <p className={`mt-1 text-sm font-semibold ${
                deploymentSnapshot?.health.status === 'fail'
                  ? 'text-red-300'
                  : deploymentSnapshot?.health.status === 'warn'
                    ? 'text-amber-300'
                    : 'text-emerald-300'
              }`}>
                {deploymentSnapshot?.health.status ?? 'ok'}
              </p>
            </div>
            <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
              <p className="text-[10px] uppercase tracking-wide text-slate-500">Migration</p>
              <p className="mt-1 text-sm font-semibold text-slate-100">
                {deploymentSnapshot ? `${deploymentSnapshot.migrations.pendingMigrations.length} pending` : 'kontrol yok'}
              </p>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <Input
              label="Ortam adi"
              value={deploymentForm.environmentName}
              onChange={(e) => setDeploymentForm((prev) => ({ ...prev, environmentName: e.target.value }))}
            />
            <Input
              label="Release kanali"
              value={deploymentForm.releaseChannel}
              onChange={(e) => setDeploymentForm((prev) => ({ ...prev, releaseChannel: e.target.value }))}
            />
            <label className="space-y-2">
              <span className="text-xs text-slate-400 font-medium">Yedek frekansi</span>
              <select
                value={deploymentForm.backupFrequency}
                onChange={(e) => setDeploymentForm((prev) => ({ ...prev, backupFrequency: e.target.value as DeploymentOperationsSettings['backupFrequency'] }))}
                className="w-full h-10 px-3 rounded-lg border border-slate-800 bg-slate-950 text-slate-200 text-sm focus:border-teal-500/50 focus:outline-none"
              >
                <option value="hourly">Saatlik</option>
                <option value="daily">Gunluk</option>
                <option value="weekly">Haftalik</option>
              </select>
            </label>
            <Input
              label="Yedek saklama (gun)"
              type="number"
              min={1}
              value={deploymentForm.backupRetentionDays}
              onChange={(e) => setDeploymentForm((prev) => ({ ...prev, backupRetentionDays: Number(e.target.value) }))}
            />
            <Input
              label="Bakim penceresi"
              value={deploymentForm.maintenanceWindow}
              onChange={(e) => setDeploymentForm((prev) => ({ ...prev, maintenanceWindow: e.target.value }))}
            />
            <label className="flex items-end gap-3 pb-2 cursor-pointer">
              <input
                type="checkbox"
                checked={deploymentForm.backupEnabled}
                onChange={(e) => setDeploymentForm((prev) => ({ ...prev, backupEnabled: e.target.checked }))}
                className="w-4.5 h-4.5 rounded border-slate-800 bg-slate-950 text-teal-500 focus:ring-teal-500/20"
              />
              <span className="text-sm text-slate-200 font-medium">Yedek politikasi aktif</span>
            </label>
          </div>

          <div className="grid gap-3 md:grid-cols-[1fr_auto_auto] md:items-end">
            <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
              <p className="text-xs font-semibold text-slate-300">Son yedek</p>
              <p className="mt-1 text-[11px] text-slate-500">
                {deploymentSnapshot?.backup.lastRunAt ?? deploymentForm.backupLastRunAt ?? 'Henuz yedek kosumu yok.'}
              </p>
              <p className="mt-1 text-[11px] text-slate-600">
                {deploymentSnapshot?.backup.lastStatus ?? deploymentForm.backupLastStatus ?? 'status bekleniyor'}
              </p>
            </div>
            <Button
              type="button"
              variant="secondary"
              loading={simulateDeploymentBackup.isPending}
              leftIcon={<DatabaseBackup className="h-4 w-4" />}
              onClick={() => simulateDeploymentBackup.mutate()}
            >
              Yedek Testi
            </Button>
            <Button
              type="button"
              variant="secondary"
              loading={updateDeploymentSettings.isPending}
              leftIcon={<Save className="h-4 w-4" />}
              onClick={handleSaveDeploymentSettings}
            >
              Operasyon Kaydet
            </Button>
          </div>

          <div className="grid gap-2 md:grid-cols-2">
            {(deploymentSnapshot?.health.checks ?? []).map((check) => (
              <div key={check.key} className="rounded-xl border border-slate-800 bg-slate-950/50 p-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs font-semibold text-slate-200">{check.label}</p>
                  <span className={`text-[10px] font-semibold uppercase ${
                    check.status === 'fail' ? 'text-red-300' : check.status === 'warn' ? 'text-amber-300' : 'text-emerald-300'
                  }`}>
                    {check.status}
                  </span>
                </div>
                <p className="mt-1 text-[11px] text-slate-500">{check.message}</p>
              </div>
            ))}
          </div>

          {deploymentSnapshot?.migrations.pendingMigrations.length ? (
            <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 p-3">
              <p className="text-xs font-semibold text-amber-200">Bekleyen migration</p>
              <p className="mt-1 text-[11px] text-amber-100/80">
                {deploymentSnapshot.migrations.pendingMigrations.slice(0, 3).join(', ')}
              </p>
            </div>
          ) : null}
        </div>

        {/* IP Restriction Panel */}
        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 space-y-4 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-amber-500/5 rounded-full blur-3xl pointer-events-none" />
          <div className="flex items-center gap-3 border-b border-slate-800 pb-4">
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center shrink-0">
              <Shield className="w-5 h-5 text-amber-400" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-white">IP Adresi Kısıtlamaları</h3>
              <p className="text-xs text-slate-500">Sadece izin verilen IP adreslerinden veya ofis ağınızdan (CIDR) erişim sağlayın.</p>
            </div>
          </div>

          <div className="space-y-4">
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={form.ipRestrictionEnabled}
                onChange={(e) => setForm((prev) => ({ ...prev, ipRestrictionEnabled: e.target.checked }))}
                className="w-4.5 h-4.5 rounded border-slate-800 bg-slate-950 text-amber-500 focus:ring-amber-500/20"
              />
              <span className="text-sm text-slate-200 font-medium">IP Adresi Kısıtlamasını Etkinleştir</span>
            </label>

            {form.ipRestrictionEnabled && (
              <div className="space-y-2 pt-2 pl-7 border-l-2 border-slate-800">
                <label className="text-xs text-slate-400 font-medium">İzin Verilen IP Adresleri (Virgül ile ayırın)</label>
                <textarea
                  placeholder="ör. 127.0.0.1, 192.168.1.0/24, 82.165.12.33"
                  value={form.ipWhitelist}
                  onChange={(e) => setForm((prev) => ({ ...prev, ipWhitelist: e.target.value }))}
                  className="w-full min-h-[80px] p-3 rounded-lg border border-slate-800 bg-slate-950 text-slate-200 text-sm focus:border-amber-500/50 focus:outline-none transition-colors"
                />
                <span className="text-[10px] text-slate-500 block leading-normal">
                  IP adresleri tekil değerler veya CIDR blokları formatında yazılabilir. Kendi mevcut IP adresinizi dahil ettiğinizden emin olun, aksi halde sistem dışı kalabilirsiniz.
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Session Lifecycle Panel */}
        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 space-y-4 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-violet-500/5 rounded-full blur-3xl pointer-events-none" />
          <div className="flex items-center gap-3 border-b border-slate-800 pb-4">
            <div className="w-10 h-10 rounded-xl bg-violet-500/10 flex items-center justify-center shrink-0">
              <Clock className="w-5 h-5 text-violet-400" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-white">Oturum Yaşam Döngüsü Politikaları</h3>
              <p className="text-xs text-slate-500">Maksimum oturum süresi, eşzamanlı aktif oturum sayısı ve boşta kalma aşımı limitlerini belirleyin.</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Input
                label="Oturum Maksimum Süresi (Gün)"
                type="number"
                min={1}
                max={90}
                value={form.sessionMaxAgeDays}
                onChange={(e) => setForm((prev) => ({ ...prev, sessionMaxAgeDays: Number(e.target.value) }))}
              />
            </div>
            <div className="space-y-2">
              <Input
                label="Eşzamanlı Oturum Limiti (Cihaz)"
                type="number"
                min={1}
                max={20}
                value={form.sessionConcurrentLimit}
                onChange={(e) => setForm((prev) => ({ ...prev, sessionConcurrentLimit: Number(e.target.value) }))}
              />
            </div>
            <div className="space-y-2">
              <Input
                label="Boşta Kalma Aşımı (Dakika)"
                type="number"
                min={5}
                max={1440}
                value={form.sessionIdleTimeoutMins}
                onChange={(e) => setForm((prev) => ({ ...prev, sessionIdleTimeoutMins: Number(e.target.value) }))}
              />
            </div>
          </div>
        </div>

        {/* Submit */}
        <div className="flex justify-end gap-3 pt-2">
          <Button type="submit" loading={updateSettings.isPending}>
            <Save className="w-4 h-4" />
            Politikaları Kaydet
          </Button>
        </div>
      </form>
    </div>
  );
}
