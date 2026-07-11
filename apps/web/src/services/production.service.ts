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

export interface BomRevisionRow {
  id: string;
  version: string;
  isActive: boolean;
  effectiveFrom: string | null;
  effectiveTo: string | null;
  itemCount: number;
  routingCount: number;
  workOrderCount: number;
  status: 'active' | 'future' | 'expired' | 'draft';
}

export interface AlternativeMaterialRow {
  bomItemId: string;
  primaryProduct: { id: string; code: string; name: string };
  requiredQty: number;
  unit: string;
  primaryUnitCost: number;
  alternatives: Array<{
    product: { id: string; code: string; name: string };
    availableQty: number;
    unitCost: number;
    costDeltaPct: number;
    reason: string;
  }>;
}

export interface OperationRouteRow {
  routingId: string;
  stepOrder: number;
  operationName: string;
  workCenter: { id: string; code: string; name: string };
  setupMinutes: number;
  runMinutesPerUnit: number;
  laborRate: number;
  overheadRate: number;
  plannedCostPerUnit: number;
}

export interface ProductionCostComparisonRow {
  workOrderId: string;
  workOrderNumber: string;
  status: string;
  plannedQty: number;
  producedQty: number;
  plannedCost: number;
  actualCost: number;
  variance: number;
  variancePct: number;
  materialVariance: number;
  laborVariance: number;
  overheadVariance: number;
}

export interface ProductionEngineeringResult {
  bomId: string;
  generatedAt: string;
  summary: {
    revisionCount: number;
    activeRevisionCount: number;
    alternativeSuggestionCount: number;
    routeStepCount: number;
    plannedCostTotal: number;
    actualCostTotal: number;
    variancePct: number;
  };
  revisions: BomRevisionRow[];
  alternativeMaterials: AlternativeMaterialRow[];
  operationRoutes: OperationRouteRow[];
  costComparison: ProductionCostComparisonRow[];
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

export interface MrpProductRef {
  id: string;
  code: string;
  name: string;
}

export interface MrpProductionRecommendation {
  product: MrpProductRef;
  bom: { id: string; name: string; version: string };
  demandQty: number;
  openSalesOrderQty: number;
  forecastDemandQty: number;
  safetyStockQty: number;
  stockQty: number;
  openWorkOrderQty: number;
  minOrderQty: number;
  leadTimeDays: number;
  suggestedOrderDate: string;
  expectedAvailabilityDate: string;
  recommendedQty: number;
  capacityHours: number;
  capacityAvailableHours: number;
  capacityGapHours: number;
}

export interface MrpPurchaseRecommendation {
  product: MrpProductRef;
  source: 'finished_good_without_bom' | 'bom_component';
  parentProduct?: MrpProductRef;
  grossRequirementQty: number;
  safetyStockQty: number;
  stockQty: number;
  openPurchaseQty: number;
  minOrderQty: number;
  leadTimeDays: number;
  suggestedOrderDate: string;
  expectedReceiptDate: string;
  recommendedQty: number;
}

export interface MrpCapacityRecommendation {
  workCenter: MrpProductRef;
  requiredHours: number;
  availableHours: number;
  allocatedHours: number;
  gapHours: number;
}

export interface MrpPlanningResult {
  summary: {
    horizonDays: number;
    demandProducts: number;
    openSalesOrderQty: number;
    forecastDemandQty: number;
    safetyStockQty: number;
    openPurchaseQty: number;
    productionRecommendationCount: number;
    purchaseRecommendationCount: number;
    capacityGapCount: number;
  };
  productionRecommendations: MrpProductionRecommendation[];
  purchaseRecommendations: MrpPurchaseRecommendation[];
  capacityRecommendations: MrpCapacityRecommendation[];
}

export interface CapacityShiftSummary {
  shiftCount: number;
  hoursPerShift: number;
  totalHours: number;
}

export interface CapacityBlockageSummary {
  downtimeHours: number;
  maintenanceTaskCount: number;
  isFullyBlocked: boolean;
  reasons: string[];
}

export interface CapacityCalendarRow {
  workCenter: MrpProductRef;
  date: string;
  capacityHours: number;
  allocatedHours: number;
  availableHours: number;
  utilizationPct: number;
  shifts: CapacityShiftSummary;
  blockages: CapacityBlockageSummary;
}

export interface CapacityBottleneckRow {
  workCenter: MrpProductRef;
  capacityHours: number;
  allocatedHours: number;
  queuedHours: number;
  blockedHours: number;
  maintenanceTaskCount: number;
  totalLoadHours: number;
  availableHours: number;
  utilizationPct: number;
  severity: 'normal' | 'watch' | 'critical';
}

export type CapacityWorkOrderStatus = 'PLANNED' | 'IN_PROGRESS' | 'PAUSED';

export interface CapacitySequenceRow {
  id: string;
  workOrderId: string;
  workOrderNumber: string;
  product: MrpProductRef;
  workCenter: MrpProductRef;
  operationName: string;
  status: CapacityWorkOrderStatus;
  stepOrder: number;
  plannedStartAt: string | null;
  plannedEndAt: string | null;
  workOrderStartDate: string | null;
  workOrderEndDate: string | null;
  plannedQty: number;
  estimatedHours: number;
  queueRank: number;
}

export interface CapacityPlanningResult {
  summary: {
    horizonDays: number;
    workCenterCount: number;
    calendarDays: number;
    shiftCount: number;
    downtimeBlockCount: number;
    maintenanceBlockCount: number;
    blockedHours: number;
    bottleneckCount: number;
    criticalBottleneckCount: number;
    queuedOperationCount: number;
  };
  calendar: CapacityCalendarRow[];
  bottlenecks: CapacityBottleneckRow[];
  sequence: CapacitySequenceRow[];
}

export type QualityFormType = 'INPUT' | 'OUTPUT';
export type QualityFormStatus = 'ready' | 'needs_review' | 'blocked';
export type QualityIssueSeverity = 'low' | 'medium' | 'high' | 'critical';
export type QualityIssueType = 'scrap' | 'under_production' | 'material_shortage' | 'paused_order';
export type QualityActionStatus = 'open' | 'in_progress' | 'done' | 'suggested';
export type QualityActionPriority = 'low' | 'medium' | 'high' | 'critical';

export interface QualityChecklistItem {
  key: string;
  label: string;
  passed: boolean;
  detail: string;
}

export interface QualityFormRow {
  id: string;
  type: QualityFormType;
  status: QualityFormStatus;
  workOrderId: string;
  workOrderNumber: string;
  product: MrpProductRef;
  plannedQty: number;
  producedQty: number;
  completionPct: number;
  checklist: QualityChecklistItem[];
}

export interface QualityNonconformityRow {
  id: string;
  type: QualityIssueType;
  severity: QualityIssueSeverity;
  workOrderId: string;
  workOrderNumber: string;
  product: MrpProductRef;
  title: string;
  detail: string;
  quantityImpact: number;
  detectedAt: string;
}

export interface QualityCorrectiveActionRow {
  id: string;
  source: 'task' | 'suggested';
  status: QualityActionStatus;
  priority: QualityActionPriority;
  workOrderId: string;
  workOrderNumber: string;
  title: string;
  detail: string | null;
  dueAt: string | null;
}

export interface QualityControlResult {
  summary: {
    horizonDays: number;
    inputFormCount: number;
    outputFormCount: number;
    blockedFormCount: number;
    nonconformityCount: number;
    criticalIssueCount: number;
    correctiveActionCount: number;
  };
  inputForms: QualityFormRow[];
  outputForms: QualityFormRow[];
  nonconformities: QualityNonconformityRow[];
  correctiveActions: QualityCorrectiveActionRow[];
}

export interface AdvancedProductionSummary {
  horizonDays: number;
  openWorkOrderCount: number;
  capacityRiskCount: number;
  qualityRiskCount: number;
  maintenanceActionCount: number;
  scrapRatePct: number;
  operationCostVariancePct: number;
}

export interface AdvancedCapacityPlanRow {
  workCenter: MrpProductRef;
  capacityHours: number;
  allocatedHours: number;
  queuedHours: number;
  utilizationPct: number;
  shiftCount: number;
  recommendation: string;
}

export interface AdvancedQualitySignalRow {
  workOrderId: string;
  workOrderNumber: string;
  product: MrpProductRef;
  signal: 'scrap' | 'under_production' | 'material_shortage' | 'paused_order';
  severity: 'low' | 'medium' | 'high' | 'critical';
  detail: string;
}

export interface AdvancedMaintenanceRow {
  workCenter: MrpProductRef;
  openTaskCount: number;
  utilizationPct: number;
  priority: 'low' | 'medium' | 'high' | 'critical';
  recommendation: string;
}

export interface AdvancedScrapRow {
  workOrderId: string;
  workOrderNumber: string;
  product: MrpProductRef;
  plannedQty: number;
  producedQty: number;
  scrapQty: number;
  scrapRatePct: number;
  scrapCost: number;
  reason: string | null;
}

export interface AdvancedShiftRow {
  workCenter: MrpProductRef;
  date: string;
  capacityHours: number;
  shiftCount: number;
  hoursPerShift: number;
  utilizationPct: number;
}

export interface AdvancedOperationCostRow {
  operationId: string;
  workOrderId: string;
  workOrderNumber: string;
  operationName: string;
  workCenter: MrpProductRef;
  plannedHours: number;
  actualHours: number;
  laborCost: number;
  overheadCost: number;
  totalCost: number;
  variancePct: number;
}

export interface AdvancedProductionResult {
  generatedAt: string;
  summary: AdvancedProductionSummary;
  capacityPlan: AdvancedCapacityPlanRow[];
  qualitySignals: AdvancedQualitySignalRow[];
  maintenancePlan: AdvancedMaintenanceRow[];
  scrapAnalysis: AdvancedScrapRow[];
  shiftPlan: AdvancedShiftRow[];
  operationCosts: AdvancedOperationCostRow[];
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

export const getAdvancedProduction = (params?: { horizonDays?: number }) =>
  apiClient.get<{ data: AdvancedProductionResult }>('/api/production/advanced', { params }).then((r) => r.data.data);

// ─────────────────────────────────────────────
// BOMs
// ─────────────────────────────────────────────

export const getBOMs = (params?: { page?: number; limit?: number }) =>
  apiClient.get<{ data: BOM[]; meta: { total: number; page: number; pageSize: number; totalPages: number } }>('/api/production/boms', { params }).then((r) => r.data);

export const getBOM = (id: string) =>
  apiClient.get<{ data: BOM }>(`/api/production/boms/${id}`).then((r) => r.data.data);

export const getBOMEngineering = (id: string) =>
  apiClient.get<{ data: ProductionEngineeringResult }>(`/api/production/boms/${id}/engineering`).then((r) => r.data.data);

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

// MRP Planning
export const getMrpPlanning = (params?: { horizonDays?: number }) =>
  apiClient.get<{ data: MrpPlanningResult }>('/api/production/mrp', { params }).then((r) => r.data.data);

export const getCapacityPlanning = (params?: { horizonDays?: number }) =>
  apiClient.get<{ data: CapacityPlanningResult }>('/api/production/capacity-planning', { params }).then((r) => r.data.data);

export const getQualityControl = (params?: { horizonDays?: number }) =>
  apiClient.get<{ data: QualityControlResult }>('/api/production/quality-control', { params }).then((r) => r.data.data);
