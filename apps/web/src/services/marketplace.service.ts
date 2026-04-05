import { apiClient } from '@/lib/api-client';

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

export interface MarketplaceIntegration {
  id: string; tenantId: string; channel: string; name: string;
  apiKey: string | null; apiSecret: string | null; storeId: string | null;
  isActive: boolean; lastSyncAt: string | null; syncErrors: number;
  createdAt: string; updatedAt: string;
  _count?: { listings: number; orders: number };
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

export const createIntegration = (data: { channel: string; name: string; apiKey?: string; apiSecret?: string; storeId?: string }) =>
  apiClient.post<{ data: MarketplaceIntegration }>('/api/marketplace/integrations', data).then((r) => r.data.data);

export const updateIntegration = (id: string, data: { name?: string; apiKey?: string; apiSecret?: string; storeId?: string; isActive?: boolean }) =>
  apiClient.patch<{ data: MarketplaceIntegration }>(`/api/marketplace/integrations/${id}`, data).then((r) => r.data.data);

export const deleteIntegration = (id: string) => apiClient.delete(`/api/marketplace/integrations/${id}`);

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
