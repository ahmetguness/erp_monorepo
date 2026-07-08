import { z } from 'zod';
import { apiClient } from '@/lib/api-client';
import { safeParse } from '@/lib/safe-parse';
import { SingleResponseSchema, PaginatedResponseSchema } from '@/types/api.types';
import type { PaginationParams } from '@/types/api.types';

// ─────────────────────────────────────────────
// Schemas
// ─────────────────────────────────────────────

export const WarehouseSchema = z.object({
  id: z.string(),
  tenantId: z.string(),
  name: z.string(),
  code: z.string(),
  address: z.string().nullable(),
  isActive: z.boolean(),
  locations: z.array(z.object({ id: z.string(), name: z.string(), code: z.string() })).optional(),
  _count: z.object({ stockLevels: z.coerce.number() }).optional(),
  insight: z.object({
    warehouseId: z.string(),
    locationCount: z.coerce.number(),
    stockItemCount: z.coerce.number(),
    totalQuantity: z.coerce.number(),
    totalValue: z.coerce.number(),
    unlocatedStockItemCount: z.coerce.number(),
    locations: z.array(z.object({
      id: z.string(),
      code: z.string(),
      name: z.string(),
      stockItemCount: z.coerce.number(),
      totalQuantity: z.coerce.number(),
      totalValue: z.coerce.number(),
    })),
    approval: z.object({
      transferApprovalConfigured: z.boolean(),
      activeTransferFlowCount: z.coerce.number(),
      pendingTransferApprovalCount: z.coerce.number(),
    }),
  }).nullable().optional(),
});

export const LocationSchema = z.object({
  id: z.string(),
  warehouseId: z.string(),
  tenantId: z.string(),
  name: z.string(),
  code: z.string(),
  isActive: z.boolean(),
});

export const StockLevelSchema = z.object({
  id: z.string(),
  tenantId: z.string(),
  productId: z.string(),
  warehouseId: z.string(),
  locationId: z.string(),
  quantity: z.coerce.number(),
  updatedAt: z.string(),
  product: z.object({
    id: z.string(), code: z.string(), name: z.string(), minStockLevel: z.coerce.number(),
    unit: z.object({ code: z.string() }).optional(),
  }).optional(),
  warehouse: z.object({ id: z.string(), name: z.string(), code: z.string() }).optional(),
});

export const StockMovementSchema = z.object({
  id: z.string(),
  tenantId: z.string(),
  productId: z.string(),
  type: z.enum(['IN', 'OUT', 'TRANSFER', 'ADJUSTMENT', 'RETURN', 'OPENING']),
  quantity: z.coerce.number(),
  unitCost: z.coerce.number().nullable(),
  fromWarehouseId: z.string().nullable(),
  toWarehouseId: z.string().nullable(),
  notes: z.string().nullable(),
  createdAt: z.string(),
  product: z.object({ id: z.string(), code: z.string(), name: z.string() }).optional(),
  fromWarehouse: z.object({ id: z.string(), name: z.string() }).optional(),
  toWarehouse: z.object({ id: z.string(), name: z.string() }).optional(),
});

export const StockCountSchema = z.object({
  id: z.string(),
  tenantId: z.string(),
  warehouseId: z.string(),
  number: z.string(),
  date: z.string(),
  isFinalized: z.boolean(),
  finalizedAt: z.string().nullable(),
  notes: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
  warehouse: z.object({ id: z.string(), name: z.string() }).optional(),
  _count: z.object({ items: z.coerce.number() }).optional(),
});

export const StockCountItemSchema = z.object({
  id: z.string(),
  tenantId: z.string(),
  stockCountId: z.string(),
  productId: z.string(),
  locationId: z.string().nullable(),
  expectedQty: z.coerce.number(),
  countedQty: z.coerce.number(),
  difference: z.coerce.number(),
  product: z.object({ id: z.string(), code: z.string(), name: z.string() }).optional(),
});

export const StockReorderSuggestionSchema = z.object({
  productId: z.string(),
  productCode: z.string(),
  productName: z.string(),
  warehouseId: z.string(),
  warehouseCode: z.string(),
  warehouseName: z.string(),
  onHand: z.coerce.number(),
  reserved: z.coerce.number(),
  available: z.coerce.number(),
  minStockLevel: z.coerce.number(),
  suggestedQuantity: z.coerce.number(),
  estimatedDaysToStockout: z.coerce.number().nullable(),
  unitCost: z.coerce.number(),
  estimatedCost: z.coerce.number(),
});

export const AdvancedStockSuggestionSchema = StockReorderSuggestionSchema.extend({
  salesVelocity: z.object({
    daily30: z.coerce.number(),
    daily60: z.coerce.number(),
    daily90: z.coerce.number(),
    trend: z.enum(['ACCELERATING', 'STABLE', 'DECELERATING']),
  }),
  reservationCount: z.coerce.number(),
  pendingReservationQty: z.coerce.number(),
  priority: z.enum(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']),
  coverageDays: z.coerce.number().nullable(),
});

export const StockAlertItemSchema = z.object({
  productId: z.string(),
  productCode: z.string(),
  productName: z.string(),
  unitCode: z.string().nullable(),
  warehouseId: z.string().nullable(),
  warehouseName: z.string().nullable(),
  currentQuantity: z.coerce.number(),
  minStockLevel: z.coerce.number(),
  shortageQuantity: z.coerce.number(),
  dailySalesVelocity: z.coerce.number(),
  estimatedDaysToStockout: z.coerce.number().nullable(),
  reorderSuggestedQuantity: z.coerce.number(),
  reorderReason: z.enum(['MIN_STOCK', 'RUNNING_OUT', 'OUT_OF_STOCK']),
  severity: z.enum(['OUT_OF_STOCK', 'LOW', 'RUNNING_OUT']),
  href: z.string(),
});

export const StockAlertDashboardSchema = z.object({
  summary: z.object({
    alertCount: z.coerce.number(),
    outOfStockCount: z.coerce.number(),
    lowStockCount: z.coerce.number(),
    runningOutCount: z.coerce.number(),
    reorderSuggestionCount: z.coerce.number(),
    checkedProductCount: z.coerce.number(),
    singleWarehouse: z.boolean(),
    warehouseName: z.string().nullable(),
  }),
  items: z.array(StockAlertItemSchema),
});

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

export type Warehouse = z.infer<typeof WarehouseSchema>;
export type WarehouseLocation = z.infer<typeof LocationSchema>;
export type StockLevel = z.infer<typeof StockLevelSchema>;
export type StockMovement = z.infer<typeof StockMovementSchema>;
export type StockMovementType = StockMovement['type'];
export type StockCount = z.infer<typeof StockCountSchema>;
export type StockCountItem = z.infer<typeof StockCountItemSchema>;
export type StockReorderSuggestion = z.infer<typeof StockReorderSuggestionSchema>;
export type AdvancedStockSuggestion = z.infer<typeof AdvancedStockSuggestionSchema>;
export type StockAlertItem = z.infer<typeof StockAlertItemSchema>;
export type StockAlertDashboard = z.infer<typeof StockAlertDashboardSchema>;

// ─────────────────────────────────────────────
// DTOs
// ─────────────────────────────────────────────

export interface StockLevelParams { warehouseId?: string; productId?: string; belowMin?: boolean; }
export interface StockMovementParams extends PaginationParams {
  productId?: string; warehouseId?: string; type?: StockMovementType;
  dateFrom?: string; dateTo?: string;
}
export interface CreateManualMovementDTO {
  productId: string; type: StockMovementType;
  quantity: number; warehouseId: string;
  unitCost?: number; lotId?: string; batchId?: string; notes?: string;
}
export interface CreateStockCountDTO {
  warehouseId: string; date: string; notes?: string;
  items: Array<{ productId: string; locationId?: string; expectedQty: number; countedQty: number }>;
}
export interface CreateWarehouseDTO { code: string; name: string; address?: string; }
export interface CreateLocationDTO { name: string; code: string; }
export interface TransferStockDTO {
  productId: string; fromWarehouseId: string; toWarehouseId: string;
  quantity: number; notes?: string;
}

// ─────────────────────────────────────────────
// Warehouse service
// ─────────────────────────────────────────────

const WarehouseListSchema = SingleResponseSchema(z.array(WarehouseSchema));
const LocationListSchema = SingleResponseSchema(z.array(LocationSchema));

export async function getWarehouses(): Promise<Warehouse[]> {
  const res = await apiClient.get('/api/warehouses');
  return safeParse(WarehouseListSchema, res.data, 'getWarehouses').data;
}

export async function getWarehouseById(id: string): Promise<Warehouse> {
  const res = await apiClient.get(`/api/warehouses/${id}`);
  return safeParse(SingleResponseSchema(WarehouseSchema), res.data, 'getWarehouseById').data;
}

export async function createWarehouse(data: CreateWarehouseDTO): Promise<Warehouse> {
  const res = await apiClient.post('/api/warehouses', data);
  return safeParse(SingleResponseSchema(WarehouseSchema), res.data, 'createWarehouse').data;
}

export async function updateWarehouse(id: string, data: Partial<CreateWarehouseDTO> & { isActive?: boolean }): Promise<Warehouse> {
  const res = await apiClient.patch(`/api/warehouses/${id}`, data);
  return safeParse(SingleResponseSchema(WarehouseSchema), res.data, 'updateWarehouse').data;
}

export async function transferStock(data: TransferStockDTO) {
  const res = await apiClient.post('/api/warehouses/transfer', data);
  return res.data;
}

export async function getLocations(warehouseId: string): Promise<WarehouseLocation[]> {
  const res = await apiClient.get(`/api/warehouses/${warehouseId}/locations`);
  return safeParse(LocationListSchema, res.data, 'getLocations').data;
}

export async function createLocation(warehouseId: string, data: CreateLocationDTO): Promise<WarehouseLocation> {
  const res = await apiClient.post(`/api/warehouses/${warehouseId}/locations`, data);
  return safeParse(SingleResponseSchema(LocationSchema), res.data, 'createLocation').data;
}

export async function deleteLocation(warehouseId: string, locationId: string): Promise<void> {
  await apiClient.delete(`/api/warehouses/${warehouseId}/locations/${locationId}`);
}

// ─────────────────────────────────────────────
// Stock service
// ─────────────────────────────────────────────

const StockLevelListSchema = SingleResponseSchema(z.array(StockLevelSchema));
const StockMovementListSchema = PaginatedResponseSchema(StockMovementSchema);
const StockMovementCreateSchema = SingleResponseSchema(StockMovementSchema).extend({
  meta: z.object({ warnings: z.array(z.string()) }).optional(),
});
const StockCountListSchema = SingleResponseSchema(z.array(StockCountSchema));
const StockReorderSuggestionListSchema = SingleResponseSchema(z.array(StockReorderSuggestionSchema));
const AdvancedStockSuggestionListSchema = SingleResponseSchema(z.array(AdvancedStockSuggestionSchema));
const StockAlertDashboardResponseSchema = SingleResponseSchema(StockAlertDashboardSchema);

export async function getStockLevels(params: StockLevelParams): Promise<StockLevel[]> {
  const res = await apiClient.get('/api/stock/levels', { params });
  return safeParse(StockLevelListSchema, res.data, 'getStockLevels').data;
}

export async function getStockReorderSuggestions(): Promise<StockReorderSuggestion[]> {
  const res = await apiClient.get('/api/stock/reorder-suggestions');
  return safeParse(StockReorderSuggestionListSchema, res.data, 'getStockReorderSuggestions').data;
}

export async function getAdvancedStockSuggestions(): Promise<AdvancedStockSuggestion[]> {
  const res = await apiClient.get('/api/stock/advanced-suggestions');
  return safeParse(AdvancedStockSuggestionListSchema, res.data, 'getAdvancedStockSuggestions').data;
}

export async function getStockAlerts(limit = 8): Promise<StockAlertDashboard> {
  const res = await apiClient.get('/api/stock/alerts', { params: { limit } });
  return safeParse(StockAlertDashboardResponseSchema, res.data, 'getStockAlerts').data;
}

export async function getStockMovements(params: StockMovementParams) {
  const res = await apiClient.get('/api/stock/movements', { params });
  return safeParse(StockMovementListSchema, res.data, 'getStockMovements');
}

export async function createManualMovement(data: CreateManualMovementDTO): Promise<z.infer<typeof StockMovementCreateSchema>> {
  const res = await apiClient.post('/api/stock/movements', data);
  return safeParse(StockMovementCreateSchema, res.data, 'createManualMovement');
}

export async function getStockCounts(): Promise<StockCount[]> {
  const res = await apiClient.get('/api/stock/counts');
  return safeParse(StockCountListSchema, res.data, 'getStockCounts').data;
}

export async function getStockCountById(id: string) {
  const res = await apiClient.get(`/api/stock/counts/${id}`);
  return safeParse(SingleResponseSchema(StockCountSchema.extend({
    items: z.array(StockCountItemSchema).optional(),
  })), res.data, 'getStockCountById').data;
}

export async function createStockCount(data: CreateStockCountDTO) {
  const res = await apiClient.post('/api/stock/counts', data);
  return res.data;
}

export async function finalizeStockCount(id: string, applyAdjustments: boolean) {
  const res = await apiClient.post(`/api/stock/counts/${id}/finalize`, { applyAdjustments });
  return res.data;
}
