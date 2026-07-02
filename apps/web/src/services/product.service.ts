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

export const ProductQuickImportNormalizedRowSchema = z.object({
  code: z.string(),
  name: z.string(),
  unitCode: z.string(),
  barcode: z.string().nullable(),
  salesPrice: z.coerce.number(),
  purchasePrice: z.coerce.number(),
  minStockLevel: z.coerce.number(),
  categoryName: z.string().nullable(),
  taxRateName: z.string().nullable(),
  description: z.string().nullable(),
  isActive: z.boolean(),
});

export const ProductQuickImportPreviewRowSchema = z.object({
  rowNumber: z.coerce.number(),
  values: z.record(z.string(), z.string()),
  normalized: ProductQuickImportNormalizedRowSchema.nullable(),
  valid: z.boolean(),
  errors: z.array(z.string()),
  warnings: z.array(z.string()),
});

export const ProductQuickImportSummarySchema = z.object({
  totalRows: z.coerce.number(),
  validRows: z.coerce.number(),
  invalidRows: z.coerce.number(),
  importableRows: z.coerce.number(),
  currentProductCount: z.coerce.number(),
  maxProducts: z.coerce.number().nullable(),
  remainingSlots: z.coerce.number().nullable(),
});

export const ProductQuickImportChecklistItemSchema = z.object({
  key: z.string(),
  label: z.string(),
  ok: z.boolean(),
  detail: z.string(),
});

export const ProductQuickImportPreviewSchema = z.object({
  headers: z.array(z.string()),
  rows: z.array(ProductQuickImportPreviewRowSchema),
  errors: z.array(z.string()),
  checklist: z.array(ProductQuickImportChecklistItemSchema),
  summary: ProductQuickImportSummarySchema,
});

export const ProductQuickImportCommitResultSchema = z.object({
  createdCount: z.coerce.number(),
  skippedCount: z.coerce.number(),
  summary: ProductQuickImportSummarySchema,
});

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

export type Product = z.infer<typeof ProductSchema>;
export type StockLevel = z.infer<typeof StockLevelSchema>;
export type ProductQuickImportPreview = z.infer<typeof ProductQuickImportPreviewSchema>;
export type ProductQuickImportCommitResult = z.infer<typeof ProductQuickImportCommitResultSchema>;

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

export interface ProductQuickImportInput {
  csv: string;
  partialImport?: boolean;
}

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

export async function downloadProductQuickImportTemplate(): Promise<Blob> {
  const res = await apiClient.get<Blob>('/api/products/quick-import/template', { responseType: 'blob' });
  return res.data;
}

export async function previewProductQuickImport(input: ProductQuickImportInput): Promise<ProductQuickImportPreview> {
  const res = await apiClient.post('/api/products/quick-import/preview', {
    csv: input.csv,
    partialImport: input.partialImport ?? false,
  });
  return safeParse(SingleResponseSchema(ProductQuickImportPreviewSchema), res.data, 'previewProductQuickImport').data;
}

export async function commitProductQuickImport(input: ProductQuickImportInput): Promise<ProductQuickImportCommitResult> {
  const res = await apiClient.post('/api/products/quick-import/commit', {
    csv: input.csv,
    partialImport: input.partialImport ?? false,
  });
  return safeParse(SingleResponseSchema(ProductQuickImportCommitResultSchema), res.data, 'commitProductQuickImport').data;
}
