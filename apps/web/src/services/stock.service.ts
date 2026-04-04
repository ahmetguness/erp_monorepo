import { z } from 'zod';
import { apiClient } from '@/lib/api-client';
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
  _count: z.object({ stockLevels: z.number() }).optional(),
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
  quantity: z.number(),
  updatedAt: z.string(),
  product: z.object({
    id: z.string(), code: z.string(), name: z.string(), minStockLevel: z.number(),
    unit: z.object({ code: z.string() }).optional(),
  }).optional(),
  warehouse: z.object({ id: z.string(), name: z.string(), code: z.string() }).optional(),
});

export const StockMovementSchema = z.object({
  id: z.string(),
  tenantId: z.string(),
  productId: z.string(),
  type: z.enum(['IN', 'OUT', 'TRANSFER', 'ADJUSTMENT', 'RETURN', 'OPENING']),
  quantity: z.number(),
  unitCost: z.number().nullable(),
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
  _count: z.object({ items: z.number() }).optional(),
});

export const StockCountItemSchema = z.object({
  id: z.string(),
  tenantId: z.string(),
  stockCountId: z.string(),
  productId: z.string(),
  locationId: z.string().nullable(),
  expectedQty: z.number(),
  countedQty: z.number(),
  difference: z.number(),
  product: z.object({ id: z.string(), code: z.string(), name: z.string() }).optional(),
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
  unitCost?: number; notes?: string;
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
  return WarehouseListSchema.parse(res.data).data;
}

export async function getWarehouseById(id: string): Promise<Warehouse> {
  const res = await apiClient.get(`/api/warehouses/${id}`);
  return SingleResponseSchema(WarehouseSchema).parse(res.data).data;
}

export async function createWarehouse(data: CreateWarehouseDTO): Promise<Warehouse> {
  const res = await apiClient.post('/api/warehouses', data);
  return SingleResponseSchema(WarehouseSchema).parse(res.data).data;
}

export async function updateWarehouse(id: string, data: Partial<CreateWarehouseDTO> & { isActive?: boolean }): Promise<Warehouse> {
  const res = await apiClient.patch(`/api/warehouses/${id}`, data);
  return SingleResponseSchema(WarehouseSchema).parse(res.data).data;
}

export async function transferStock(data: TransferStockDTO) {
  const res = await apiClient.post('/api/warehouses/transfer', data);
  return res.data;
}

export async function getLocations(warehouseId: string): Promise<WarehouseLocation[]> {
  const res = await apiClient.get(`/api/warehouses/${warehouseId}/locations`);
  return LocationListSchema.parse(res.data).data;
}

export async function createLocation(warehouseId: string, data: CreateLocationDTO): Promise<WarehouseLocation> {
  const res = await apiClient.post(`/api/warehouses/${warehouseId}/locations`, data);
  return SingleResponseSchema(LocationSchema).parse(res.data).data;
}

// ─────────────────────────────────────────────
// Stock service
// ─────────────────────────────────────────────

const StockLevelListSchema = SingleResponseSchema(z.array(StockLevelSchema));
const StockMovementListSchema = PaginatedResponseSchema(StockMovementSchema);
const StockCountListSchema = SingleResponseSchema(z.array(StockCountSchema));

export async function getStockLevels(params: StockLevelParams): Promise<StockLevel[]> {
  const res = await apiClient.get('/api/stock/levels', { params });
  return StockLevelListSchema.parse(res.data).data;
}

export async function getStockMovements(params: StockMovementParams) {
  const res = await apiClient.get('/api/stock/movements', { params });
  return StockMovementListSchema.parse(res.data);
}

export async function createManualMovement(data: CreateManualMovementDTO) {
  const res = await apiClient.post('/api/stock/movements', data);
  return res.data;
}

export async function getStockCounts(): Promise<StockCount[]> {
  const res = await apiClient.get('/api/stock/counts');
  return StockCountListSchema.parse(res.data).data;
}

export async function getStockCountById(id: string) {
  const res = await apiClient.get(`/api/stock/counts/${id}`);
  return SingleResponseSchema(StockCountSchema.extend({
    items: z.array(StockCountItemSchema).optional(),
  })).parse(res.data).data;
}

export async function createStockCount(data: CreateStockCountDTO) {
  const res = await apiClient.post('/api/stock/counts', data);
  return res.data;
}

export async function finalizeStockCount(id: string, applyAdjustments: boolean) {
  const res = await apiClient.post(`/api/stock/counts/${id}/finalize`, { applyAdjustments });
  return res.data;
}
