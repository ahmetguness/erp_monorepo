import { adminApiClient } from '@/lib/admin-api-client';

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

export interface AdminUser { id: string; email: string; name: string; isActive: boolean; lastLoginAt: string | null; createdAt: string }

export interface TenantListItem {
  id: string; slug: string; companyName: string; email: string; phone: string | null;
  plan: string; status: string; city: string | null; sector: string | null;
  maxUsers: number | null; trialEndsAt: string | null;
  subscriptionStart: string | null; subscriptionEnd: string | null;
  planChangedAt: string | null; isCustomPricing: boolean;
  modules: string[]; notes: string | null;
  createdAt: string; updatedAt: string;
  _count: { users: number; products: number; invoices: number; contacts: number };
}

export interface TenantDetail extends TenantListItem {
  _count: TenantListItem['_count'] & { salesOrders: number; purchaseOrders: number; warehouses: number; payments: number; journalEntries: number };
  featureOverrides: Array<{ id: string; featureKey: string; value: string; isEnabled: boolean; reason: string | null; expiresAt: string | null }>;
}

export interface PlanFeature { id: string; plan: string; key: string; value: string; type: string; isEnabled: boolean; description: string | null; featureKey: string | null }
export interface FeatureOverride { id: string; tenantId: string; featureKey: string; value: string; isEnabled: boolean; reason: string | null; expiresAt: string | null; tenant?: { id: string; companyName: string; slug: string } }

export interface PlatformMetrics {
  tenants: { total: number; active: number; trial: number; suspended: number };
  plans: { starter: number; professional: number; enterprise: number };
  totals: { users: number; products: number; invoices: number; payments: number };
}

export type DomainEventStatus = 'PENDING' | 'PROCESSING' | 'PROCESSED' | 'FAILED' | 'DEAD_LETTER';
export type SyncJobStatus = 'PENDING' | 'RUNNING' | 'DONE' | 'FAILED';

export interface EndpointLatencySnapshot {
  key: string;
  method: string;
  path: string;
  count: number;
  errorCount: number;
  avgMs: number;
  p95Ms: number;
  p99Ms: number;
  errorRatePct: number;
  maxMs: number;
  histogram: { le100ms: number; le300ms: number; le1000ms: number; gt1000ms: number };
}

export interface ErrorRateTrendSnapshot {
  bucketStart: string;
  requestCount: number;
  errorCount: number;
  errorRatePct: number;
}

export interface SlowEndpointSnapshot {
  method: string;
  path: string;
  status: number;
  durationMs: number;
  requestId: string;
  correlationId: string;
  occurredAt: string;
}

export interface RecentErrorSnapshot {
  method: string;
  path: string;
  message: string;
  requestId: string;
  correlationId: string;
  occurredAt: string;
}

export interface SlowQuerySnapshot {
  model: string | null;
  action: string;
  durationMs: number;
  requestId: string | null;
  correlationId: string | null;
  occurredAt: string;
}

export interface DomainEventFailureSnapshot {
  id: string;
  tenantId: string;
  tenantName: string | null;
  name: string;
  source: string;
  status: DomainEventStatus;
  attempts: number;
  lastError: string | null;
  updatedAt: string;
}

export interface WorkerJobMetricSnapshot {
  status: SyncJobStatus;
  count: number;
}

export interface RecentWorkerJobSnapshot {
  id: string;
  tenantId: string;
  tenantName: string | null;
  integrationId: string;
  jobType: string;
  status: SyncJobStatus;
  processedCount: number;
  errorCount: number;
  errorMessage: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  updatedAt: string;
}

export interface OperationalObservability {
  runtime: {
    appRole: string;
    marketplaceWorkerEnabled: boolean;
    uptimeSeconds: number;
    generatedAt: string;
  };
  http: {
    totalRequests: number;
    totalErrors: number;
    errorRatePct: number;
    slowThresholdMs: number;
    p95Ms: number;
    p99Ms: number;
    endpoints: EndpointLatencySnapshot[];
    errorRateTrend: ErrorRateTrendSnapshot[];
    recentSlowEndpoints: SlowEndpointSnapshot[];
    recentErrors: RecentErrorSnapshot[];
  };
  slowQueries: {
    thresholdMs: number;
    recent: SlowQuerySnapshot[];
  };
  domainEvents: {
    failedCount: number;
    deadLetterCount: number;
    recentFailures: DomainEventFailureSnapshot[];
  };
  workerJobs: {
    byStatus: WorkerJobMetricSnapshot[];
    recentProblemJobs: RecentWorkerJobSnapshot[];
  };
  telemetry: {
    persistence: {
      mode: 'in-memory' | 'persistent';
      durable: boolean;
      detail: string;
    };
    sentry: { enabled: boolean };
    openTelemetry: { enabled: boolean; exporter: string | null };
  };
}

export interface ObservabilityAuditSearchResult {
  query: string;
  slowEndpoints: SlowEndpointSnapshot[];
  errors: RecentErrorSnapshot[];
  slowQueries: SlowQuerySnapshot[];
  auditLogs: Array<{
    id: string;
    tenantId: string;
    userId: string | null;
    module: string;
    entityType: string;
    entityId: string;
    action: string;
    createdAt: string;
  }>;
}

export interface TenantMetrics {
  tenantId: string;
  counts: { users: number; products: number; contacts: number; invoices: number; salesOrders: number; purchaseOrders: number; payments: number; warehouses: number; stockLevels: number; journalEntries: number };
}

export type SecurityCheckStatus = 'pass' | 'warn' | 'fail';

export interface SecurityChecklistItem {
  key: string;
  label: string;
  status: SecurityCheckStatus;
  message: string;
  details?: string[];
}

export interface SecurityChecklist {
  summary: SecurityCheckStatus;
  checks: SecurityChecklistItem[];
}

export interface CreateTenantInput {
  companyName: string;
  email: string;
  ownerName: string;
  slug?: string;
  phone?: string;
  city?: string;
  sector?: string;
  plan?: string;
  status?: string;
  maxUsers?: number | null;
  modules?: string[];
  notes?: string;
  isCustomPricing?: boolean;
  trialEndsAt?: string | null;
  subscriptionStart?: string | null;
  subscriptionEnd?: string | null;
}

// ─────────────────────────────────────────────
// Auth
// ─────────────────────────────────────────────

export async function adminLogin(email: string, password: string): Promise<{ admin: AdminUser }> {
  const res = await adminApiClient.post('/api/admin/auth/login', { email, password });
  return res.data.data;
}

export async function adminLogout(): Promise<void> {
  await adminApiClient.post('/api/admin/auth/logout');
}

export async function adminMe(): Promise<AdminUser> {
  const res = await adminApiClient.get('/api/admin/auth/me');
  return res.data.data;
}

// ─────────────────────────────────────────────
// Tenants
// ─────────────────────────────────────────────

export async function getTenants(params?: { page?: number; limit?: number; status?: string; plan?: string; search?: string }) {
  const res = await adminApiClient.get('/api/admin/tenants', { params });
  return res.data as { data: TenantListItem[]; meta: { total: number; page: number; pageSize: number; totalPages: number } };
}

export async function getTenantById(id: string): Promise<TenantDetail> {
  const res = await adminApiClient.get(`/api/admin/tenants/${id}`);
  return res.data.data;
}

export async function createTenant(data: CreateTenantInput): Promise<{ id: string }> {
  const res = await adminApiClient.post('/api/admin/tenants', data);
  return res.data.data;
}

export async function updateTenantPlan(id: string, plan: string) {
  const res = await adminApiClient.post(`/api/admin/tenants/${id}/plan`, { plan });
  return res.data.data;
}

export async function updateTenantStatus(id: string, status: string) {
  const res = await adminApiClient.post(`/api/admin/tenants/${id}/status`, { status });
  return res.data.data;
}

export async function updateTenant(id: string, data: Record<string, unknown>) {
  const res = await adminApiClient.patch(`/api/admin/tenants/${id}`, data);
  return res.data.data;
}
// ─────────────────────────────────────────────
// Features
// ─────────────────────────────────────────────

export async function getPlanFeatures(plan?: string): Promise<PlanFeature[]> {
  const res = await adminApiClient.get('/api/admin/features', { params: plan ? { plan } : {} });
  return res.data.data;
}

export async function getOverrides(tenantId?: string): Promise<FeatureOverride[]> {
  const res = await adminApiClient.get('/api/admin/overrides', { params: tenantId ? { tenantId } : {} });
  return res.data.data;
}

export async function createOverride(data: { tenantId: string; featureKey: string; value: string; isEnabled?: boolean; reason?: string; expiresAt?: string }) {
  const res = await adminApiClient.post('/api/admin/overrides', data);
  return res.data.data;
}

export async function deleteOverride(id: string) {
  await adminApiClient.delete(`/api/admin/overrides/${id}`);
}

// ─────────────────────────────────────────────
// Metrics
// ─────────────────────────────────────────────

export async function getPlatformMetrics(): Promise<PlatformMetrics> {
  const res = await adminApiClient.get('/api/admin/metrics');
  return res.data.data;
}

export async function getTenantMetrics(id: string): Promise<TenantMetrics> {
  const res = await adminApiClient.get(`/api/admin/metrics/tenants/${id}`);
  return res.data.data;
}

export async function getOperationalObservability(): Promise<OperationalObservability> {
  const res = await adminApiClient.get('/api/admin/observability');
  return res.data.data;
}

export async function searchOperationalObservability(q: string): Promise<ObservabilityAuditSearchResult> {
  const res = await adminApiClient.get('/api/admin/observability/search', { params: { q } });
  return res.data.data;
}

// ─────────────────────────────────────────────
// Audit
// ─────────────────────────────────────────────

export async function getAdminAuditLogs(params?: { page?: number; limit?: number; tenantId?: string; module?: string; action?: string }) {
  const res = await adminApiClient.get('/api/admin/audit-logs', { params });
  return res.data as { data: Array<Record<string, unknown>>; meta: { total: number; page: number; pageSize: number; totalPages: number } };
}

export async function getSecurityChecklist(): Promise<SecurityChecklist> {
  const res = await adminApiClient.get('/api/admin/security/checklist');
  return res.data.data;
}
