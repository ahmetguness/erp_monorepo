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

export interface TenantMetrics {
  tenantId: string;
  counts: { users: number; products: number; contacts: number; invoices: number; salesOrders: number; purchaseOrders: number; payments: number; warehouses: number; stockLevels: number; journalEntries: number };
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

export async function adminLogin(email: string, password: string): Promise<{ token: string; admin: AdminUser }> {
  const res = await adminApiClient.post('/api/admin/auth/login', { email, password });
  return res.data.data;
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

// ─────────────────────────────────────────────
// Audit
// ─────────────────────────────────────────────

export async function getAdminAuditLogs(params?: { page?: number; limit?: number; tenantId?: string; module?: string; action?: string }) {
  const res = await adminApiClient.get('/api/admin/audit-logs', { params });
  return res.data as { data: Array<Record<string, unknown>>; meta: { total: number; page: number; pageSize: number; totalPages: number } };
}
