import { z } from 'zod';
import { apiClient } from '../lib/api-client';
import { SingleResponseSchema } from '../types/api.types';

// ─────────────────────────────────────────────
// FAZ 4: Inventory & Warehouse Schemas
// ─────────────────────────────────────────────

export const LocationSchema = z.object({
  id: z.string(),
  warehouseId: z.string().optional(),
  code: z.string(),
  name: z.string(),
  aisle: z.string().nullable().optional(),
  shelf: z.string().nullable().optional(),
});

export const WarehouseSchema = z.object({
  id: z.string(),
  code: z.string(),
  name: z.string(),
  address: z.string().nullable().optional(),
  isActive: z.boolean().default(true),
  locations: z.array(LocationSchema).optional(),
});

export const ProductLookupSchema = z.object({
  id: z.string(),
  code: z.string(),
  name: z.string(),
  barcode: z.string().nullable().optional(),
  salesPrice: z.coerce.number().default(0),
  purchasePrice: z.coerce.number().default(0),
  minStockLevel: z.coerce.number().default(0),
  maxStockLevel: z.coerce.number().nullable().optional(),
  isActive: z.boolean().default(true),
  category: z.object({ id: z.string(), name: z.string() }).nullable().optional(),
  unit: z.object({ id: z.string(), name: z.string(), code: z.string() }).nullable().optional(),
  taxRate: z.object({ id: z.string(), name: z.string(), rate: z.coerce.number() }).nullable().optional(),
});

export const StockLevelSchema = z.object({
  id: z.string().optional(),
  productId: z.string(),
  warehouseId: z.string(),
  locationId: z.string().nullable().optional(),
  quantity: z.coerce.number().default(0),
  reservedQuantity: z.coerce.number().default(0),
  availableQuantity: z.coerce.number().optional(),
  warehouse: z.object({ id: z.string(), name: z.string(), code: z.string().optional() }).optional(),
  product: z
    .object({
      id: z.string(),
      code: z.string(),
      name: z.string(),
      barcode: z.string().nullable().optional(),
    })
    .optional(),
});

export const StockCountItemSchema = z.object({
  id: z.string().optional(),
  productId: z.string(),
  locationId: z.string().nullable().optional(),
  expectedQty: z.coerce.number().default(0),
  countedQty: z.coerce.number().default(0),
  difference: z.coerce.number().default(0),
  product: z.object({ id: z.string(), code: z.string(), name: z.string() }).optional(),
});

export const StockCountSchema = z.object({
  id: z.string(),
  number: z.string(),
  warehouseId: z.string(),
  date: z.string(),
  notes: z.string().nullable().optional(),
  isFinalized: z.boolean().default(false),
  warehouse: z.object({ id: z.string(), name: z.string() }).optional(),
  items: z.array(StockCountItemSchema).optional(),
});

export const DeliveryNoteItemSchema = z.object({
  id: z.string().optional(),
  productId: z.string(),
  orderedQty: z.coerce.number().optional(),
  deliveredQty: z.coerce.number().optional(),
  quantity: z.coerce.number().optional(),
  description: z.string().nullable().optional(),
  unitPrice: z.coerce.number().optional(),
  product: z
    .object({
      id: z.string(),
      code: z.string(),
      name: z.string(),
      barcode: z.string().nullable().optional(),
    })
    .optional(),
});

export const DeliveryNoteSchema = z.object({
  id: z.string(),
  number: z.string(),
  type: z.string().default('INCOMING'),
  status: z.string().default('DRAFT'),
  date: z.string().optional(),
  issueDate: z.string().optional(),
  contact: z.object({ id: z.string(), name: z.string() }).nullable().optional(),
  warehouse: z.object({ id: z.string(), name: z.string(), code: z.string().optional() }).nullable().optional(),
  items: z.array(DeliveryNoteItemSchema).optional(),
});

export const LotSerialSchema = z.object({
  id: z.string(),
  productId: z.string(),
  type: z.enum(['LOT', 'SERIAL']).default('SERIAL'),
  code: z.string(),
  expirationDate: z.string().nullable().optional(),
  quantity: z.coerce.number().default(1),
});

export const WarehouseListResponseSchema = z.object({
  data: z.array(WarehouseSchema),
});

export const ProductListResponseSchema = z.object({
  data: z.array(ProductLookupSchema),
  meta: z
    .object({
      total: z.number().default(0),
      page: z.number().default(1),
      pageSize: z.number().default(20),
      totalPages: z.number().default(1),
    })
    .optional(),
});

export const StockLevelListResponseSchema = z.object({
  data: z.array(StockLevelSchema),
});

export const StockCountListResponseSchema = z.object({
  data: z.array(StockCountSchema),
});

export const DeliveryNoteListResponseSchema = z.object({
  data: z.array(DeliveryNoteSchema),
});

export const LotSerialListResponseSchema = z.object({
  data: z.array(LotSerialSchema),
});

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

export type Warehouse = z.infer<typeof WarehouseSchema>;
export type Location = z.infer<typeof LocationSchema>;
export type ProductLookup = z.infer<typeof ProductLookupSchema>;
export type StockLevel = z.infer<typeof StockLevelSchema>;
export type StockCount = z.infer<typeof StockCountSchema>;
export type StockCountItem = z.infer<typeof StockCountItemSchema>;
export type DeliveryNote = z.infer<typeof DeliveryNoteSchema>;
export type DeliveryNoteItem = z.infer<typeof DeliveryNoteItemSchema>;
export type LotSerial = z.infer<typeof LotSerialSchema>;

export interface CreateStockCountDTO {
  warehouseId: string;
  date: string;
  notes?: string;
  items: Array<{
    productId: string;
    locationId?: string;
    expectedQty: number;
    countedQty: number;
  }>;
}

export interface TransferStockDTO {
  productId: string;
  fromWarehouseId: string;
  toWarehouseId: string;
  quantity: number;
  fromLocationId?: string;
  toLocationId?: string;
  notes?: string;
}

export interface CreateLotSerialDTO {
  productId: string;
  type: 'LOT' | 'SERIAL';
  code: string;
  expirationDate?: string;
  quantity?: number;
}

// ─────────────────────────────────────────────
// Service Functions
// ─────────────────────────────────────────────

/**
 * 4.1 & 4.4: List active warehouses and their locations
 */
export async function getWarehouses(): Promise<Warehouse[]> {
  const res = await apiClient.get('/api/warehouses');
  const parsed = WarehouseListResponseSchema.safeParse(res.data);
  if (parsed.success) {
    return parsed.data.data;
  }
  return Array.isArray(res.data?.data) ? res.data.data : [];
}

export async function getWarehouseLocations(warehouseId: string): Promise<Location[]> {
  const res = await apiClient.get(`/api/warehouses/${warehouseId}/locations`);
  return Array.isArray(res.data?.data) ? res.data.data : [];
}

/**
 * 4.2: Instant product lookup by barcode, SKU or name
 */
export async function lookupProductByBarcode(
  query: string
): Promise<{ product: ProductLookup | null; stockLevels: StockLevel[] }> {
  const cleanQuery = query.trim();
  if (!cleanQuery) return { product: null, stockLevels: [] };

  // 1. Search product
  const prodRes = await apiClient.get('/api/products', {
    params: { search: cleanQuery, limit: 5 },
  });

  const parsed = ProductListResponseSchema.safeParse(prodRes.data);
  const products = parsed.success ? parsed.data.data : prodRes.data?.data || [];
  if (!products || products.length === 0) {
    return { product: null, stockLevels: [] };
  }

  // Exact barcode match takes priority, otherwise first match
  const matched =
    products.find((p: ProductLookup) => p.barcode?.toLowerCase() === cleanQuery.toLowerCase()) ||
    products[0];

  // 2. Fetch stock levels across all warehouses for this product
  let stockLevels: StockLevel[] = [];
  try {
    const stockRes = await apiClient.get('/api/stock/levels', {
      params: { productId: matched.id },
    });
    const parsedStock = StockLevelListResponseSchema.safeParse(stockRes.data);
    stockLevels = parsedStock.success ? parsedStock.data.data : stockRes.data?.data || [];
  } catch {
    // Non-fatal, return product without stock levels
  }

  return { product: matched, stockLevels };
}

/**
 * Fetch stock levels for a specific warehouse
 */
export async function getWarehouseStockLevels(warehouseId: string): Promise<StockLevel[]> {
  const res = await apiClient.get('/api/stock/levels', {
    params: { warehouseId },
  });
  const parsed = StockLevelListResponseSchema.safeParse(res.data);
  return parsed.success ? parsed.data.data : res.data?.data || [];
}

/**
 * 4.3: Hızlı Stok Sayımı
 */
export async function getStockCounts(): Promise<StockCount[]> {
  const res = await apiClient.get('/api/stock/counts');
  const parsed = StockCountListResponseSchema.safeParse(res.data);
  return parsed.success ? parsed.data.data : res.data?.data || [];
}

export async function getStockCountById(id: string): Promise<StockCount> {
  const res = await apiClient.get(`/api/stock/counts/${id}`);
  return SingleResponseSchema(StockCountSchema).parse(res.data).data;
}

export async function createStockCount(payload: CreateStockCountDTO): Promise<StockCount> {
  const cleanPayload = {
    warehouseId: payload.warehouseId,
    date: payload.date,
    notes: payload.notes || undefined,
    items: payload.items.map((i) => ({
      productId: i.productId,
      ...(i.locationId ? { locationId: i.locationId } : {}),
      expectedQty: Math.max(0, Math.round(i.expectedQty)),
      countedQty: Math.max(0, Math.round(i.countedQty)),
    })),
  };
  const res = await apiClient.post('/api/stock/counts', cleanPayload);
  return SingleResponseSchema(StockCountSchema).parse(res.data).data;
}

export async function finalizeStockCount(
  id: string,
  applyAdjustments = true,
  approvalReason?: string
): Promise<{ success: boolean; countId: string }> {
  const res = await apiClient.post(`/api/stock/counts/${id}/finalize`, {
    applyAdjustments,
    ...(approvalReason ? { approvalReason } : {}),
  });
  return res.data?.data || { success: true, countId: id };
}

/**
 * 4.4: Depolar Arası Hızlı Transfer
 */
export async function executeStockTransfer(payload: TransferStockDTO): Promise<any> {
  const res = await apiClient.post('/api/warehouses/transfer', payload);
  return res.data?.data;
}

/**
 * 4.5: Mal Kabul & Sevkiyat (İrsaliye Doğrulama)
 */
export async function getDeliveryNotes(params?: {
  type?: 'INCOMING' | 'OUTGOING';
  status?: string;
}): Promise<DeliveryNote[]> {
  const res = await apiClient.get('/api/delivery-notes', { params });
  const parsed = DeliveryNoteListResponseSchema.safeParse(res.data);
  return parsed.success ? parsed.data.data : res.data?.data || [];
}

export async function getDeliveryNoteById(id: string): Promise<DeliveryNote> {
  const res = await apiClient.get(`/api/delivery-notes/${id}`);
  return SingleResponseSchema(DeliveryNoteSchema).parse(res.data).data;
}

export async function updateDeliveryNoteStatus(
  id: string,
  status: 'APPROVED' | 'SHIPPED' | 'DELIVERED' | 'CANCELLED'
): Promise<DeliveryNote> {
  const res = await apiClient.patch(`/api/delivery-notes/${id}/status`, { status });
  return SingleResponseSchema(DeliveryNoteSchema).parse(res.data).data;
}

/**
 * 4.6: Lot ve Seri Numarası Eşleştirme
 */
export async function getLotSerials(productId?: string): Promise<LotSerial[]> {
  const res = await apiClient.get('/api/lot-serials', {
    params: productId ? { productId } : undefined,
  });
  const parsed = LotSerialListResponseSchema.safeParse(res.data);
  return parsed.success ? parsed.data.data : res.data?.data || [];
}

export async function createLotSerial(payload: CreateLotSerialDTO): Promise<LotSerial> {
  const res = await apiClient.post('/api/lot-serials', payload);
  return SingleResponseSchema(LotSerialSchema).parse(res.data).data;
}
