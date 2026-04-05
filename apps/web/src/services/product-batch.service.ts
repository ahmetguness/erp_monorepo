import { z } from 'zod';
import { apiClient } from '@/lib/api-client';
import { safeParse } from '@/lib/safe-parse';
import { SingleResponseSchema, PaginatedResponseSchema } from '@/types/api.types';
import type { PaginationParams } from '@/types/api.types';

const ProductRef = z.object({ id: z.string(), code: z.string(), name: z.string() });

export const ProductBatchSchema = z.object({
  id: z.string(), tenantId: z.string(), productId: z.string(),
  batchNumber: z.string(), expiryDate: z.string().nullable(),
  manufacturedAt: z.string().nullable(), quantity: z.coerce.number(),
  notes: z.string().nullable(), createdAt: z.string(),
  product: ProductRef.optional(),
  _count: z.object({ lots: z.coerce.number() }).optional(),
});

export type ProductBatch = z.infer<typeof ProductBatchSchema>;

export interface CreateProductBatchDTO {
  productId: string; batchNumber: string;
  expiryDate?: string; manufacturedAt?: string; quantity?: number; notes?: string;
}

export interface UpdateProductBatchDTO { expiryDate?: string; manufacturedAt?: string; quantity?: number; notes?: string }

export interface ListParams extends PaginationParams { productId?: string }

export async function getProductBatches(params: ListParams) {
  const res = await apiClient.get('/api/product-batches', { params });
  return safeParse(PaginatedResponseSchema(ProductBatchSchema), res.data, 'getProductBatches');
}

export async function createProductBatch(data: CreateProductBatchDTO): Promise<ProductBatch> {
  const res = await apiClient.post('/api/product-batches', data);
  return safeParse(SingleResponseSchema(ProductBatchSchema), res.data, 'createProductBatch').data;
}

export async function updateProductBatch(id: string, data: UpdateProductBatchDTO): Promise<ProductBatch> {
  const res = await apiClient.patch(`/api/product-batches/${id}`, data);
  return safeParse(SingleResponseSchema(ProductBatchSchema), res.data, 'updateProductBatch').data;
}
