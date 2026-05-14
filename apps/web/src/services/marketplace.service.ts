import { apiClient } from '@/lib/api-client';

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

export interface MarketplaceIntegration {
  id: string; tenantId: string; channel: string; name: string;
  apiKey: string | null; apiSecret: string | null; storeId: string | null;
  isActive: boolean; lastSyncAt: string | null; syncErrors: number;
  createdAt: string; updatedAt: string;
  hasApiKey?: boolean; hasApiSecret?: boolean;
  _count?: { listings: number; orders: number };
}

export interface CreateIntegrationDTO {
  channel: string;
  name: string;
  apiKey?: string;
  apiSecret?: string;
  storeId?: string;
}

export interface UpdateIntegrationDTO {
  name?: string;
  apiKey?: string;
  apiSecret?: string;
  storeId?: string;
  isActive?: boolean;
}

export interface MarketplaceHealth {
  label: 'Sağlıklı' | 'Uyarı' | 'Hatalı';
  tone: 'success' | 'warning' | 'danger';
  reasons: string[];
}

export interface MarketplaceListing {
  id: string; tenantId: string; integrationId: string; productId: string;
  externalId: string; externalSku: string | null;
  price: number; stock: number; isActive: boolean;
  lastSyncAt: string | null; syncError: string | null;
  product?: { id: string; code: string; name: string; salesPrice?: number };
  integration?: { id: string; channel: string; name: string };
}

export interface MarketplaceOrderItem {
  id: string; externalProductId: string; productId: string | null;
  name: string; quantity: number; unitPrice: number; lineTotal: number;
  product?: { id: string; code: string; name: string };
}

export interface MarketplaceOrder {
  id: string; tenantId: string; integrationId: string; externalId: string;
  channel: string; status: string; customerName: string | null;
  customerEmail: string | null; customerPhone: string | null;
  shippingAddress: string | null; totalAmount: number;
  orderDate: string; syncedAt: string; updatedAt: string;
  integration?: { id: string; channel: string; name: string };
  items?: MarketplaceOrderItem[];
  _count?: { items: number };
}

type Paginated<T> = { data: T[]; meta: { total: number; page: number; pageSize: number; totalPages: number } };

// ─── Integrations ─────────────────────────────

export const getIntegrations = () =>
  apiClient.get<{ data: MarketplaceIntegration[] }>('/api/marketplace/integrations').then((r) => r.data.data);

export const getIntegration = (id: string) =>
  apiClient.get<{ data: MarketplaceIntegration }>(`/api/marketplace/integrations/${id}`).then((r) => r.data.data);

export const createIntegration = (data: CreateIntegrationDTO) =>
  apiClient.post<{ data: MarketplaceIntegration }>('/api/marketplace/integrations', data).then((r) => r.data.data);

export const updateIntegration = (id: string, data: UpdateIntegrationDTO) =>
  apiClient.patch<{ data: MarketplaceIntegration }>(`/api/marketplace/integrations/${id}`, data).then((r) => r.data.data);

export const deleteIntegration = (id: string) => apiClient.delete(`/api/marketplace/integrations/${id}`);

export function getIntegrationHealth(integration: MarketplaceIntegration): MarketplaceHealth {
  const reasons: string[] = [];

  if (!integration.isActive) reasons.push('Entegrasyon pasif.');
  if (!integration.hasApiKey || !integration.hasApiSecret || !integration.storeId) {
    reasons.push('Kimlik bilgileri eksik.');
  }
  if (integration.syncErrors > 0) {
    reasons.push(`${integration.syncErrors} senkronizasyon hatası var.`);
  }
  if (!integration.lastSyncAt) {
    reasons.push('Henüz başarılı senkronizasyon yok.');
  }

  if (!integration.isActive || !integration.hasApiKey || !integration.hasApiSecret || !integration.storeId) {
    return { label: 'Hatalı', tone: 'danger', reasons };
  }

  if (integration.syncErrors > 0 || !integration.lastSyncAt) {
    return { label: 'Uyarı', tone: 'warning', reasons };
  }

  return { label: 'Sağlıklı', tone: 'success', reasons: ['Entegrasyon aktif ve kimlik bilgileri tanımlı.'] };
}

export function buildMarketplaceWebhookUrl(integrationId: string): string {
  const apiBase = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';
  return `${apiBase.replace(/\/$/, '')}/api/public/marketplace/webhook/${integrationId}`;
}

// ─── Listings ─────────────────────────────────

export const getListings = (params?: { page?: number; limit?: number; integrationId?: string }) =>
  apiClient.get<Paginated<MarketplaceListing>>('/api/marketplace/listings', { params }).then((r) => r.data);

export const createListing = (data: { integrationId: string; productId: string; externalId: string; externalSku?: string; price: number; stock?: number }) =>
  apiClient.post<{ data: MarketplaceListing }>('/api/marketplace/listings', data).then((r) => r.data.data);

export const updateListing = (id: string, data: { price?: number; stock?: number; isActive?: boolean }) =>
  apiClient.patch<{ data: MarketplaceListing }>(`/api/marketplace/listings/${id}`, data).then((r) => r.data.data);

export const deleteListing = (id: string) => apiClient.delete(`/api/marketplace/listings/${id}`);

// ─── Orders ───────────────────────────────────

export const getOrders = (params?: { page?: number; limit?: number; status?: string; channel?: string }) =>
  apiClient.get<Paginated<MarketplaceOrder>>('/api/marketplace/orders', { params }).then((r) => r.data);

export const getOrder = (id: string) =>
  apiClient.get<{ data: MarketplaceOrder }>(`/api/marketplace/orders/${id}`).then((r) => r.data.data);

export const changeOrderStatus = (id: string, data: { status: string }) =>
  apiClient.post<{ data: MarketplaceOrder }>(`/api/marketplace/orders/${id}/status`, data).then((r) => r.data.data);

export const deleteOrder = (id: string) =>
  apiClient.delete(`/api/marketplace/orders/${id}`);

// ─── Monitoring (read-only) ───────────────────

export interface MarketplaceSyncJobRecord {
  id: string; tenantId: string; integrationId: string;
  jobType: string; status: 'PENDING' | 'RUNNING' | 'DONE' | 'FAILED';
  startedAt: string | null; finishedAt: string | null;
  processedCount: number; errorCount: number; errorMessage: string | null;
  params: Record<string, unknown> | null; result: Record<string, unknown> | null;
  createdAt: string; updatedAt: string;
}

export interface MarketplaceWebhookEventRecord {
  id: string; tenantId: string; integrationId: string;
  eventId: string; eventType: string; payload: Record<string, unknown>;
  processedAt: string | null; errorMessage: string | null; createdAt: string;
}

export interface MarketplaceListingSnapshotRecord {
  id: string; tenantId: string; listingId: string;
  lastSentQty: number; lastSentSalePrice: number; lastSentListPrice: number;
  lastSentAt: string; batchRequestId: string | null;
  listing?: { id: string; externalId: string; externalSku: string | null; price: number; isActive: boolean };
}

export const getSyncJobs = (params?: { page?: number; limit?: number; integrationId?: string; status?: string; jobType?: string }) =>
  apiClient.get<Paginated<MarketplaceSyncJobRecord>>('/api/marketplace/sync-jobs', { params }).then((r) => r.data);

export const getSyncJob = (id: string) =>
  apiClient.get<{ data: MarketplaceSyncJobRecord }>(`/api/marketplace/sync-jobs/${id}`).then((r) => r.data.data);

export const retrySyncJob = (id: string) =>
  apiClient.post<{ data: TrendyolJobEnqueueResult }>(`/api/marketplace/sync-jobs/${id}/retry`).then((r) => r.data.data);

export const getWebhookEvents = (params?: { page?: number; limit?: number; integrationId?: string; eventType?: string; processed?: string }) =>
  apiClient.get<Paginated<MarketplaceWebhookEventRecord>>('/api/marketplace/webhook-events', { params }).then((r) => r.data);

export const getWebhookEvent = (id: string) =>
  apiClient.get<{ data: MarketplaceWebhookEventRecord }>(`/api/marketplace/webhook-events/${id}`).then((r) => r.data.data);

export const getListingSnapshots = (params?: { page?: number; limit?: number; integrationId?: string }) =>
  apiClient.get<Paginated<MarketplaceListingSnapshotRecord>>('/api/marketplace/listing-snapshots', { params }).then((r) => r.data);

// ─── Trendyol Sync ────────────────────────────

export interface TrendyolJobEnqueueResult {
  jobId: string;
  message: string;
}

export interface TrendyolSyncJob {
  id: string;
  tenantId: string;
  integrationId: string;
  jobType: string;
  status: 'PENDING' | 'RUNNING' | 'DONE' | 'FAILED';
  startedAt: string | null;
  finishedAt: string | null;
  processedCount: number;
  errorCount: number;
  errorMessage: string | null;
  params: Record<string, unknown> | null;
  result: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
}

export interface TrendyolBatchSummary {
  batchRequestId: string;
  status: 'IN_PROGRESS' | 'COMPLETED' | 'FAILED';
  total: number;
  succeeded: number;
  failed: number;
  failures: Array<{ barcode: string; reasons: string[] }>;
}

// Test connection
export const testTrendyolConnection = (integrationId: string) =>
  apiClient.post<{ data: { success: boolean; message: string } }>(
    `/api/marketplace/integrations/${integrationId}/trendyol/test`,
  ).then((r) => r.data.data);

// Enqueue sync-orders job → returns jobId (202)
export const syncTrendyolOrders = (
  integrationId: string,
  params?: { hoursBack?: number; status?: string },
) =>
  apiClient.post<{ data: TrendyolJobEnqueueResult }>(
    `/api/marketplace/integrations/${integrationId}/trendyol/sync-orders`,
    params ?? {},
  ).then((r) => r.data.data);

// Enqueue sync-stock job → returns jobId (202)
export const syncTrendyolStock = (integrationId: string, params?: { force?: boolean }) =>
  apiClient.post<{ data: TrendyolJobEnqueueResult }>(
    `/api/marketplace/integrations/${integrationId}/trendyol/sync-stock`,
    params ?? {},
  ).then((r) => r.data.data);

// Poll job status
export const getTrendyolJobStatus = (integrationId: string, jobId: string) =>
  apiClient.get<{ data: TrendyolSyncJob }>(
    `/api/marketplace/integrations/${integrationId}/trendyol/jobs/${jobId}`,
  ).then((r) => r.data.data);

// Get batch result (waits up to 30s on backend)
export const getTrendyolBatchResult = (integrationId: string, batchRequestId: string) =>
  apiClient.get<{ data: TrendyolBatchSummary }>(
    `/api/marketplace/integrations/${integrationId}/trendyol/batch/${batchRequestId}`,
  ).then((r) => r.data.data);
