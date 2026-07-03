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

export type MaintenancePlanStatus = 'overdue' | 'due_soon' | 'planned';
export type MaintenanceFaultStatus = 'open' | 'in_progress' | 'waiting_parts' | 'waiting_customer';
export type MaintenancePriority = 'low' | 'medium' | 'high' | 'critical';
export type SparePartRisk = 'available' | 'low_stock' | 'unlinked';

export interface MaintenanceAssetRef {
  id: string;
  name: string;
  brand: string | null;
  model: string | null;
  serialNo: string | null;
}

export interface MaintenanceContactRef {
  id: string;
  code: string | null;
  name: string;
}

export interface MaintenanceProductRef {
  id: string;
  code: string;
  name: string;
}

export interface MaintenancePlanRow {
  id: string;
  asset: MaintenanceAssetRef;
  contact: MaintenanceContactRef;
  nextDueAt: string;
  lastServiceAt: string | null;
  status: MaintenancePlanStatus;
  openFaultCount: number;
  recommendedAction: string;
}

export interface MaintenanceFaultRow {
  id: string;
  number: string;
  asset: MaintenanceAssetRef | null;
  contact: MaintenanceContactRef | null;
  subject: string;
  status: MaintenanceFaultStatus;
  priority: MaintenancePriority;
  createdAt: string;
  sparePartCount: number;
  href: string;
}

export interface MaintenanceSparePartRow {
  id: string;
  serviceRequestId: string;
  serviceRequestNumber: string;
  asset: MaintenanceAssetRef | null;
  product: MaintenanceProductRef | null;
  description: string;
  quantity: number;
  availableQty: number | null;
  risk: SparePartRisk;
}

export interface MaintenanceManagementResult {
  summary: {
    horizonDays: number;
    assetCount: number;
    duePlanCount: number;
    overduePlanCount: number;
    openFaultCount: number;
    waitingPartFaultCount: number;
    sparePartLinkCount: number;
    lowStockPartCount: number;
  };
  plans: MaintenancePlanRow[];
  faults: MaintenanceFaultRow[];
  spareParts: MaintenanceSparePartRow[];
}

export type FieldServiceCheckpointKind = 'SERVICE_FORM' | 'CUSTOMER_APPROVAL' | 'VISIT_NOTE';
export type FieldServiceStepStatus = 'complete' | 'pending' | 'blocked';

export interface FieldServiceContactRef {
  id: string;
  code: string | null;
  name: string;
  phone: string | null;
  address: string | null;
  city: string | null;
}

export interface FieldServiceAssetRef {
  id: string;
  name: string;
  brand: string | null;
  model: string | null;
  serialNo: string | null;
}

export interface FieldServiceRouteStop {
  serviceRequestId: string;
  serviceRequestNumber: string;
  sequence: number;
  title: string;
  address: string | null;
  city: string | null;
  contactPhone: string | null;
}

export interface FieldServiceStep {
  key: 'assignment' | 'route' | 'photos' | 'signature' | 'service_form' | 'customer_approval';
  label: string;
  status: FieldServiceStepStatus;
  detail: string;
}

export interface FieldServiceJobRow {
  id: string;
  number: string;
  subject: string;
  status: string;
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  assignedToId: string | null;
  contact: FieldServiceContactRef | null;
  asset: FieldServiceAssetRef | null;
  createdAt: string;
  routeStop: FieldServiceRouteStop;
  photoCount: number;
  signatureCount: number;
  serviceFormSubmitted: boolean;
  customerApproved: boolean;
  steps: FieldServiceStep[];
  href: string;
}

export interface FieldServiceMobileFlow {
  summary: {
    totalJobs: number;
    assignedJobCount: number;
    routeReadyCount: number;
    photoReadyCount: number;
    signatureReadyCount: number;
    formSubmittedCount: number;
    customerApprovedCount: number;
  };
  route: FieldServiceRouteStop[];
  jobs: FieldServiceJobRow[];
}

export interface FieldServiceCheckpointInput {
  kind: FieldServiceCheckpointKind;
  note?: string;
  customerName?: string;
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

export const getMaintenanceManagement = (params?: { horizonDays?: number }) =>
  apiClient.get<{ data: MaintenanceManagementResult }>('/api/service/maintenance', { params }).then((r) => r.data.data);

export const getFieldServiceMobileFlow = (params?: { assignedToId?: string }) =>
  apiClient.get<{ data: FieldServiceMobileFlow }>('/api/service/mobile-flow', { params }).then((r) => r.data.data);

export const createFieldServiceCheckpoint = (serviceRequestId: string, data: FieldServiceCheckpointInput) =>
  apiClient.post<{ data: { id: string } }>(`/api/service/mobile-flow/${serviceRequestId}/checkpoint`, data).then((r) => r.data.data);
