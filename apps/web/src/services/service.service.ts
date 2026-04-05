import { apiClient } from '@/lib/api-client';

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

export interface CustomerAsset {
  id: string; tenantId: string; contactId: string; name: string;
  brand: string | null; model: string | null; serialNo: string | null;
  purchaseDate: string | null; warrantyEnd: string | null;
  notes: string | null; isActive: boolean; createdAt: string;
  contact?: { id: string; name: string; code: string; phone?: string; email?: string };
  serviceRequests?: Array<{ id: string; number: string; subject: string; status: string; priority: string; createdAt: string }>;
  _count?: { serviceRequests: number };
}

export interface ServiceRequestItem {
  id: string; description: string; productId: string | null;
  quantity: number; unitPrice: number; lineTotal: number;
  product?: { id: string; code: string; name: string };
}

export interface ServiceActivity {
  id: string; activityType: string; notes: string | null;
  actorId: string | null; createdAt: string;
}

export interface ServiceRequest {
  id: string; tenantId: string; number: string; status: string;
  subject: string; description: string | null; priority: string;
  contactId: string | null; customerAssetId: string | null;
  assignedToId: string | null; warrantyEnd: string | null;
  closedAt: string | null; createdAt: string; updatedAt: string;
  contact?: { id: string; name: string; code: string; phone?: string; email?: string } | null;
  customerAsset?: { id: string; name: string; brand: string | null; model: string | null; serialNo: string | null; warrantyEnd: string | null } | null;
  items?: ServiceRequestItem[];
  activities?: ServiceActivity[];
  history?: Array<{ id: string; fromStatus: string | null; toStatus: string; notes: string | null; createdAt: string }>;
  _count?: { items: number; activities: number };
}

type PaginatedResponse<T> = { data: T[]; meta: { total: number; page: number; pageSize: number; totalPages: number } };

// ─────────────────────────────────────────────
// Customer Assets
// ─────────────────────────────────────────────

export const getCustomerAssets = (params?: { page?: number; limit?: number; contactId?: string }) =>
  apiClient.get<PaginatedResponse<CustomerAsset>>('/api/service/assets', { params }).then((r) => r.data);

export const getCustomerAsset = (id: string) =>
  apiClient.get<{ data: CustomerAsset }>(`/api/service/assets/${id}`).then((r) => r.data.data);

export const createCustomerAsset = (data: {
  contactId: string; name: string; brand?: string; model?: string;
  serialNo?: string; purchaseDate?: string; warrantyEnd?: string; notes?: string;
}) => apiClient.post<{ data: CustomerAsset }>('/api/service/assets', data).then((r) => r.data.data);

export const updateCustomerAsset = (id: string, data: Partial<{
  name: string; brand: string; model: string; serialNo: string;
  purchaseDate: string; warrantyEnd: string; notes: string; isActive: boolean;
}>) => apiClient.patch<{ data: CustomerAsset }>(`/api/service/assets/${id}`, data).then((r) => r.data.data);

export const deleteCustomerAsset = (id: string) => apiClient.delete(`/api/service/assets/${id}`);

// ─────────────────────────────────────────────
// Service Requests
// ─────────────────────────────────────────────

export const getServiceRequests = (params?: { page?: number; limit?: number; status?: string; priority?: string; assignedToId?: string }) =>
  apiClient.get<PaginatedResponse<ServiceRequest>>('/api/service/requests', { params }).then((r) => r.data);

export const getServiceRequest = (id: string) =>
  apiClient.get<{ data: ServiceRequest }>(`/api/service/requests/${id}`).then((r) => r.data.data);

export const createServiceRequest = (data: {
  contactId?: string; customerAssetId?: string; subject: string;
  description?: string; priority?: string; assignedToId?: string;
}) => apiClient.post<{ data: ServiceRequest }>('/api/service/requests', data).then((r) => r.data.data);

export const updateServiceRequest = (id: string, data: { subject?: string; description?: string; priority?: string }) =>
  apiClient.patch<{ data: ServiceRequest }>(`/api/service/requests/${id}`, data).then((r) => r.data.data);

export const changeServiceRequestStatus = (id: string, data: { status: string; notes?: string }) =>
  apiClient.post<{ data: ServiceRequest }>(`/api/service/requests/${id}/status`, data).then((r) => r.data.data);

export const assignServiceRequest = (id: string, data: { assignedToId: string | null }) =>
  apiClient.post<{ data: ServiceRequest }>(`/api/service/requests/${id}/assign`, data).then((r) => r.data.data);

export const addServiceRequestItem = (srId: string, data: { description: string; productId?: string; quantity?: number; unitPrice?: number }) =>
  apiClient.post<{ data: ServiceRequestItem }>(`/api/service/requests/${srId}/items`, data).then((r) => r.data.data);

export const removeServiceRequestItem = (srId: string, itemId: string) =>
  apiClient.delete(`/api/service/requests/${srId}/items/${itemId}`);

export const addServiceActivity = (srId: string, data: { activityType: string; notes?: string }) =>
  apiClient.post<{ data: ServiceActivity }>(`/api/service/requests/${srId}/activities`, data).then((r) => r.data.data);

export const deleteServiceRequest = (id: string) => apiClient.delete(`/api/service/requests/${id}`);
