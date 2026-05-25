import { apiClient } from '@/lib/api-client';

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

export interface WorkCenter {
  id: string; tenantId: string; code: string; name: string;
  description: string | null; capacity: number | null;
  isActive: boolean; createdAt: string; updatedAt: string;
  _count?: { operations: number; workOrderOps: number };
}

export interface BOMItem {
  id: string; productId: string; quantity: number;
  unit: string | null; notes: string | null; sortOrder: number;
  product?: { id: string; code: string; name: string };
}

export interface RoutingOp {
  id: string; workCenterId: string; name: string; stepOrder: number;
  setupTime: number | null; runTime: number | null; notes: string | null;
  workCenter?: { id: string; code: string; name: string };
}

export interface BOM {
  id: string; tenantId: string; productId: string; name: string;
  version: string; isActive: boolean; createdAt: string; updatedAt: string;
  product?: { id: string; code: string; name: string };
  items?: BOMItem[]; routings?: RoutingOp[];
  _count?: { items: number; routings: number; workOrders: number };
}

export interface WorkOrderItem {
  id: string; productId: string; requiredQty: number; consumedQty: number;
  sourceWarehouseId: string | null;
  product?: { id: string; code: string; name: string };
}

export interface WorkOrderOp {
  id: string; workCenterId: string; name: string; stepOrder: number;
  status: string; plannedStartAt: string | null; actualStartAt: string | null;
  actualEndAt: string | null; notes: string | null;
  workCenter?: { id: string; code: string; name: string };
}

export interface WorkOrder {
  id: string; tenantId: string; number: string; status: string;
  productId: string; bomId: string | null;
  plannedQty: number; producedQty: number;
  startDate: string | null; endDate: string | null; notes: string | null;
  inputWarehouseId: string | null; outputWarehouseId: string | null;
  createdAt: string; updatedAt: string;
  product?: { id: string; code: string; name: string };
  bom?: { id: string; name: string; version: string } | null;
  inputWarehouse?: { id: string; code: string; name: string } | null;
  outputWarehouse?: { id: string; code: string; name: string } | null;
  items?: WorkOrderItem[]; operations?: WorkOrderOp[];
  history?: Array<{ id: string; fromStatus: string | null; toStatus: string; notes: string | null; createdAt: string }>;
  _count?: { items: number; operations: number };
}

// ─────────────────────────────────────────────
// Work Centers
// ─────────────────────────────────────────────

export const getWorkCenters = (params?: { page?: number; limit?: number }) =>
  apiClient.get<{ data: WorkCenter[]; meta: { total: number; page: number; pageSize: number; totalPages: number } }>('/api/production/work-centers', { params }).then((r) => r.data);

export const getWorkCenter = (id: string) =>
  apiClient.get<{ data: WorkCenter }>(`/api/production/work-centers/${id}`).then((r) => r.data.data);

export const createWorkCenter = (data: { code: string; name: string; description?: string; capacity?: number }) =>
  apiClient.post<{ data: WorkCenter }>('/api/production/work-centers', data).then((r) => r.data.data);

export const updateWorkCenter = (id: string, data: { name?: string; description?: string; capacity?: number; isActive?: boolean }) =>
  apiClient.patch<{ data: WorkCenter }>(`/api/production/work-centers/${id}`, data).then((r) => r.data.data);

export const deleteWorkCenter = (id: string) =>
  apiClient.delete(`/api/production/work-centers/${id}`);

// ─────────────────────────────────────────────
// BOMs
// ─────────────────────────────────────────────

export const getBOMs = (params?: { page?: number; limit?: number }) =>
  apiClient.get<{ data: BOM[]; meta: { total: number; page: number; pageSize: number; totalPages: number } }>('/api/production/boms', { params }).then((r) => r.data);

export const getBOM = (id: string) =>
  apiClient.get<{ data: BOM }>(`/api/production/boms/${id}`).then((r) => r.data.data);

export const createBOM = (data: { productId: string; name: string; version?: string; items?: Array<{ productId: string; quantity: number; unit?: string }> }) =>
  apiClient.post<{ data: BOM }>('/api/production/boms', data).then((r) => r.data.data);

export const updateBOM = (id: string, data: { name?: string; version?: string; isActive?: boolean }) =>
  apiClient.patch<{ data: BOM }>(`/api/production/boms/${id}`, data).then((r) => r.data.data);

export const addBOMItem = (bomId: string, data: { productId: string; quantity: number; unit?: string }) =>
  apiClient.post<{ data: BOMItem }>(`/api/production/boms/${bomId}/items`, data).then((r) => r.data.data);

export const removeBOMItem = (bomId: string, itemId: string) =>
  apiClient.delete(`/api/production/boms/${bomId}/items/${itemId}`);

export const addBOMRouting = (bomId: string, data: { workCenterId: string; name: string; stepOrder: number; setupTime?: number; runTime?: number }) =>
  apiClient.post<{ data: RoutingOp }>(`/api/production/boms/${bomId}/routings`, data).then((r) => r.data.data);

export const removeBOMRouting = (bomId: string, routingId: string) =>
  apiClient.delete(`/api/production/boms/${bomId}/routings/${routingId}`);

// ─────────────────────────────────────────────
// Work Orders
// ─────────────────────────────────────────────

export const getWorkOrders = (params?: { page?: number; limit?: number; status?: string }) =>
  apiClient.get<{ data: WorkOrder[]; meta: { total: number; page: number; pageSize: number; totalPages: number } }>('/api/production/work-orders', { params }).then((r) => r.data);

export const getWorkOrder = (id: string) =>
  apiClient.get<{ data: WorkOrder }>(`/api/production/work-orders/${id}`).then((r) => r.data.data);

export const createWorkOrder = (data: {
  productId: string; bomId?: string; plannedQty: number;
  startDate?: string; endDate?: string; notes?: string;
  inputWarehouseId?: string; outputWarehouseId?: string;
}) => apiClient.post<{ data: WorkOrder }>('/api/production/work-orders', data).then((r) => r.data.data);

export const changeWorkOrderStatus = (id: string, data: { status: string; notes?: string }) =>
  apiClient.post<{ data: WorkOrder }>(`/api/production/work-orders/${id}/status`, data).then((r) => r.data.data);

export const reportProduction = (id: string, data: {
  producedQty: number;
  scrapQty?: number;
  operationId?: string;
  notes?: string;
  consumptions?: Array<{ itemId: string; quantity: number }>;
}) =>
  apiClient.post(`/api/production/work-orders/${id}/report`, data).then((r) => r.data);

export const updateWorkOrderOperation = (workOrderId: string, operationId: string, data: {
  status?: string;
  actualStartAt?: string | null;
  actualEndAt?: string | null;
  notes?: string | null;
}) =>
  apiClient.patch<{ data: WorkOrderOp }>(`/api/production/work-orders/${workOrderId}/operations/${operationId}`, data).then((r) => r.data.data);

export const deleteWorkOrder = (id: string) =>
  apiClient.delete(`/api/production/work-orders/${id}`);
