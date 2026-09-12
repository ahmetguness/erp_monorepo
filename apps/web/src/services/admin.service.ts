import { adminApiClient } from '@/lib/admin-api-client';
import type { AdminAuditLog, AdminChangeRequest, AdminChangeRequestStatus, AdminIdentity, AdminSensitiveAccessState, AdminTenantSettingsUpdate, PendingAdminChangeResult } from '@repo/types';

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

export type AdminUser = AdminIdentity;
export type AdminMutationResult<T> = T | PendingAdminChangeResult;
export function isPendingAdminChange<T>(value: AdminMutationResult<T>): value is PendingAdminChangeResult {
  return typeof value === 'object' && value !== null && 'requiresApproval' in value && value.requiresApproval === true;
}

export interface TenantListItem {
  id: string; slug: string; companyName: string; email: string; phone: string | null;
  plan: string; status: string; city: string | null; sector: string | null;
  maxUsers: number | null; trialEndsAt: string | null;
  subscriptionStart: string | null; subscriptionEnd: string | null;
  planChangedAt: string | null; isCustomPricing: boolean;
  modules: string[]; notes: string | null;
  createdAt: string; updatedAt: string;
  sensitiveAccess?: AdminSensitiveAccessState;
  _count: { users: number; products: number; invoices: number; contacts: number };
}

export interface TenantDetail extends TenantListItem {
  _count: TenantListItem['_count'] & { salesOrders: number; purchaseOrders: number; warehouses: number; payments: number; journalEntries: number };
  featureOverrides: Array<{ id: string; featureKey: string; value: string; isEnabled: boolean; reason: string | null; expiresAt: string | null }>;
}

export type PlanFeatureType = 'BOOLEAN' | 'LIMIT' | 'ENUM';
export interface PlanFeature { id: string; plan: string; key: string; value: string; type: PlanFeatureType; isEnabled: boolean; description: string | null; featureKey: string | null }
export interface UpdatePlanFeatureInput {
  plan: string;
  key: string;
  value: string;
  type: PlanFeatureType;
  isEnabled: boolean;
  description?: string | null;
  featureKey?: string | null;
  reason: string;
  ticketId?: string;
}
export interface FeatureOverride { id: string; tenantId: string; featureKey: string; value: string; isEnabled: boolean; reason: string | null; expiresAt: string | null; tenant?: { id: string; companyName: string; slug: string } }

export interface PlatformMetrics {
  tenants: { total: number; active: number; trial: number; suspended: number };
  plans: { starter: number; professional: number; enterprise: number };
  totals: { users: number; products: number; invoices: number; payments: number };
}

export type DomainEventStatus = 'PENDING' | 'PROCESSING' | 'PROCESSED' | 'FAILED' | 'DEAD_LETTER';
export type SyncJobStatus = 'PENDING' | 'RUNNING' | 'DONE' | 'FAILED' | 'DEAD_LETTER';

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
  attempts: number;
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
  authorization: {
    resolutionCount: number;
    deniedCount: number;
    avgDurationMs: number;
    maxDurationMs: number;
    totalQueryCount: number;
    avgQueryCount: number;
  };
  externalServices: Array<{
    service: string;
    requestCount: number;
    errorCount: number;
    avgDurationMs: number;
    maxDurationMs: number;
  }>;
  domainEvents: {
    pendingCount: number;
    processingCount: number;
    failedCount: number;
    deadLetterCount: number;
    recentFailures: DomainEventFailureSnapshot[];
  };
  workerJobs: {
    retryScheduledCount: number;
    deadLetterCount: number;
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
    prometheus: { enabled: boolean; path: string; protected: boolean };
  };
  alerts: Array<{
    key: 'http_error_rate' | 'http_p95_latency' | 'outbox_backlog' | 'worker_retry' | 'dead_letter';
    severity: 'warning' | 'critical';
    active: boolean;
    value: number;
    threshold: number;
    unit: 'percent' | 'milliseconds' | 'count';
  }>;
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

export type CreateTenantInput = import('@repo/types').TenantProvisioningInput;

// ─────────────────────────────────────────────
// Auth
// ─────────────────────────────────────────────

export async function adminLogin(email: string, password: string, otp?: string, rememberMe = false): Promise<import('@repo/types').AdminLoginResult> {
  const res = await adminApiClient.post('/api/admin/auth/login', { email, password, otp, rememberMe });
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

export async function getTenants(params?: { page?: number; limit?: number; status?: string; plan?: string; search?: string; from?: string; to?: string; sortBy?: string; sortDirection?: string }) {
  const res = await adminApiClient.get('/api/admin/tenants', { params });
  return res.data as { data: TenantListItem[]; meta: { total: number; page: number; pageSize: number; totalPages: number } };
}

export async function getTenantById(id: string): Promise<TenantDetail> {
  const res = await adminApiClient.get(`/api/admin/tenants/${id}`);
  return res.data.data;
}

export async function previewTenant(data: CreateTenantInput): Promise<import('@repo/types').TenantProvisioningPreview> {
  const res = await adminApiClient.post('/api/admin/tenants/preview', data);
  return res.data.data;
}

export async function createTenant(data: CreateTenantInput, idempotencyKey: string): Promise<import('@repo/types').TenantProvisioningJob> {
  const res = await adminApiClient.post('/api/admin/tenants', data, { headers: { 'Idempotency-Key': idempotencyKey } });
  return res.data.data;
}

export async function retryTenantProvisioning(jobId: string): Promise<import('@repo/types').TenantProvisioningJob> {
  const res = await adminApiClient.post(`/api/admin/tenant-provisioning/${encodeURIComponent(jobId)}/retry`);
  return res.data.data;
}

export async function getTenantProvisioningJobs(): Promise<import('@repo/types').TenantProvisioningJob[]> {
  const res = await adminApiClient.get('/api/admin/tenant-provisioning');
  return res.data.data;
}

export async function updateTenantPlan(id: string, plan: string, reason?: string, ticketId?: string): Promise<AdminMutationResult<TenantDetail>> {
  const res = await adminApiClient.post(`/api/admin/tenants/${id}/plan`, { plan, reason, ticketId });
  return res.data.data;
}

export async function updateTenantStatus(id: string, status: string, reason?: string, ticketId?: string): Promise<AdminMutationResult<TenantDetail>> {
  const res = await adminApiClient.post(`/api/admin/tenants/${id}/status`, { status, reason, ticketId });
  return res.data.data;
}

export async function updateTenant(id: string, data: AdminTenantSettingsUpdate): Promise<TenantDetail> {
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

export async function updatePlanFeature(data: UpdatePlanFeatureInput): Promise<AdminMutationResult<PlanFeature>> {
  const res = await adminApiClient.put('/api/admin/features', data);
  return res.data.data;
}

export async function getOverrides(tenantId?: string): Promise<FeatureOverride[]> {
  const res = await adminApiClient.get('/api/admin/overrides', { params: tenantId ? { tenantId } : {} });
  return res.data.data;
}

export async function createOverride(data: { tenantId: string; featureKey: string; value: string; isEnabled?: boolean; reason?: string; ticketId?: string; expiresAt?: string }) {
  const res = await adminApiClient.post('/api/admin/overrides', data);
  return res.data.data;
}

export async function deleteOverride(id: string, reason?: string, ticketId?: string) {
  await adminApiClient.delete(`/api/admin/overrides/${id}`, { data: { reason, ticketId } });
}

export async function getAdminChangeRequests(status?: AdminChangeRequestStatus): Promise<AdminChangeRequest[]> {
  const res = await adminApiClient.get('/api/admin/change-requests', { params: status ? { status } : {} });
  return res.data.data;
}

export async function approveAdminChangeRequest(id: string, note?: string): Promise<AdminChangeRequest> {
  const res = await adminApiClient.post(`/api/admin/change-requests/${id}/approve`, { note });
  return res.data.data;
}

export async function rejectAdminChangeRequest(id: string, note?: string): Promise<AdminChangeRequest> {
  const res = await adminApiClient.post(`/api/admin/change-requests/${id}/reject`, { note });
  return res.data.data;
}

export type AdminChangePreviewInput =
  | { type: 'TENANT_PLAN_UPDATE'; payload: { tenantId: string; plan: 'STARTER' | 'PROFESSIONAL' | 'ENTERPRISE' } }
  | { type: 'TENANT_STATUS_UPDATE'; payload: { tenantId: string; status: 'TRIAL' | 'ACTIVE' | 'SUSPENDED' | 'CANCELLED' } }
  | { type: 'PLAN_FEATURE_UPDATE'; payload: Omit<UpdatePlanFeatureInput, 'reason' | 'ticketId'> };

export async function previewAdminChange(input: AdminChangePreviewInput): Promise<import('@repo/types').ChangePreview> {
  const res = await adminApiClient.post('/api/admin/change-requests/preview', input);
  return res.data.data;
}

export async function rollbackAdminChangeRequest(id: string, reason: string, ticketId?: string): Promise<AdminChangeRequest> {
  const res = await adminApiClient.post(`/api/admin/change-requests/${id}/rollback`, { reason, ticketId });
  return res.data.data;
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
  return res.data as { data: AdminAuditLog[]; meta: { total: number; page: number; pageSize: number; totalPages: number } };
}

export async function getSecurityChecklist(): Promise<SecurityChecklist> {
  const res = await adminApiClient.get('/api/admin/security/checklist');
  return res.data.data;
}

// ─────────────────────────────────────────────
// Billing Coupons
// ─────────────────────────────────────────────

export type CouponPlan = 'STARTER' | 'PROFESSIONAL' | 'ENTERPRISE';

export interface CouponDiscountTenant {
  id: string;
  companyName: string;
  slug: string;
  plan: string;
  status: string;
}

export interface CouponDiscount {
  id: string;
  tenantId: string;
  couponId: string;
  createdAt: string;
  expiresAt: string;
  tenant: CouponDiscountTenant;
}

export interface BillingCoupon {
  id: string;
  code: string;
  percent: number;
  plan: CouponPlan | null; // null = tüm planlar
  description: string | null;
  expiresAt: string;
  maxRedemptions: number | null;
  redemptionCount: number;
  isActive: boolean;
  createdAt: string;
  _count: { discounts: number };
  discounts?: CouponDiscount[];
}

export interface CreateCouponInput {
  code: string;
  percent: number;
  expiresAt: string; // ISO datetime
  maxRedemptions?: number;
  plan?: CouponPlan | null;
  description?: string;
}

export async function getCoupons(params?: { plan?: string; isActive?: boolean }): Promise<BillingCoupon[]> {
  const query: Record<string, string> = {};
  if (params?.plan) query.plan = params.plan;
  if (params?.isActive !== undefined) query.isActive = String(params.isActive);
  const res = await adminApiClient.get('/api/admin/billing/coupons', { params: query });
  return res.data.data;
}

export async function createAdminCoupon(data: CreateCouponInput): Promise<BillingCoupon> {
  const res = await adminApiClient.post('/api/admin/billing/coupons', data);
  return res.data.data;
}

export async function deactivateAdminCoupon(id: string): Promise<void> {
  await adminApiClient.delete(`/api/admin/billing/coupons/${id}`);
}
