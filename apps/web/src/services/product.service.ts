import { z } from 'zod';
import { apiClient } from '@/lib/api-client';
import { safeParse } from '@/lib/safe-parse';
import { SingleResponseSchema, PaginatedResponseSchema } from '@/types/api.types';
import type { PaginationParams } from '@/types/api.types';

// ─────────────────────────────────────────────
// Schemas
// ─────────────────────────────────────────────

export const ProductSchema = z.object({
  id: z.string(),
  tenantId: z.string(),
  categoryId: z.string().nullable(),
  unitId: z.string(),
  taxRateId: z.string().nullable(),
  code: z.string(),
  name: z.string(),
  barcode: z.string().nullable(),
  description: z.string().nullable(),
  imageUrl: z.string().nullable(),
  purchasePrice: z.coerce.number(),
  salesPrice: z.coerce.number(),
  minStockLevel: z.coerce.number(),
  averageCost: z.coerce.number(),
  isActive: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
  category: z.object({ id: z.string(), name: z.string() }).nullable().optional(),
  unit: z.object({ id: z.string(), name: z.string(), code: z.string() }).nullable().optional(),
  taxRate: z.object({ id: z.string(), name: z.string(), rate: z.coerce.number() }).nullable().optional(),
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

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

export type Product = z.infer<typeof ProductSchema>;
export type StockLevel = z.infer<typeof StockLevelSchema>;

// ─────────────────────────────────────────────
// DTOs
// ─────────────────────────────────────────────

export interface ProductListParams extends PaginationParams {
  search?: string;
  categoryId?: string;
  isActive?: boolean;
}

export interface CreateProductDTO {
  code: string;
  name: string;
  unitId: string;
  categoryId?: string;
  taxRateId?: string;
  barcode?: string;
  description?: string;
  purchasePrice?: number;
  salesPrice?: number;
  minStockLevel?: number;
}

export type UpdateProductDTO = Partial<CreateProductDTO> & { isActive?: boolean };

// ─────────────────────────────────────────────
// Service functions
// ─────────────────────────────────────────────

const ProductListSchema = PaginatedResponseSchema(ProductSchema);

export async function getProducts(params: ProductListParams) {
  const res = await apiClient.get('/api/products', { params });
  return safeParse(ProductListSchema, res.data, 'getProducts');
}

export async function getProductById(id: string): Promise<Product> {
  const res = await apiClient.get(`/api/products/${id}`);
  return safeParse(SingleResponseSchema(ProductSchema), res.data, 'getProductById').data;
}

export async function createProduct(data: CreateProductDTO): Promise<Product> {
  const res = await apiClient.post('/api/products', data);
  return safeParse(SingleResponseSchema(ProductSchema), res.data, 'createProduct').data;
}

export async function updateProduct(id: string, data: UpdateProductDTO): Promise<Product> {
  const res = await apiClient.patch(`/api/products/${id}`, data);
  return safeParse(SingleResponseSchema(ProductSchema), res.data, 'updateProduct').data;
}

export async function deleteProduct(id: string): Promise<void> {
  await apiClient.delete(`/api/products/${id}`);
}
