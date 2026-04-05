import { z } from 'zod';
import { apiClient } from '@/lib/api-client';
import { safeParse } from '@/lib/safe-parse';
import { PaginatedResponseSchema } from '@/types/api.types';
import type { PaginationParams } from '@/types/api.types';

const ProductRef = z.object({ id: z.string(), code: z.string(), name: z.string() });

export const StockValuationSchema = z.object({
  id: z.string(), tenantId: z.string(), productId: z.string(), warehouseId: z.string(),
  movementId: z.string().nullable(), date: z.string(),
  qtyIn: z.coerce.number(), qtyOut: z.coerce.number(), qtyBalance: z.coerce.number(),
  unitCost: z.coerce.number(), totalValue: z.coerce.number(),
  createdAt: z.string(),
  product: ProductRef.optional(),
});

export type StockValuation = z.infer<typeof StockValuationSchema>;

export interface ListParams extends PaginationParams { productId?: string; warehouseId?: string; dateFrom?: string; dateTo?: string }

export async function getStockValuations(params: ListParams) {
  const res = await apiClient.get('/api/stock-valuations', { params });
  return safeParse(PaginatedResponseSchema(StockValuationSchema), res.data, 'getStockValuations');
}
