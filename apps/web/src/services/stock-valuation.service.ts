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

export interface CreateStockValuationDTO {
  productId: string;
  warehouseId: string;
  movementId?: string;
  date: string;
  qtyIn?: number;
  qtyOut?: number;
  qtyBalance: number;
  unitCost: number;
  totalValue: number;
}

export async function getStockValuations(params: ListParams) {
  const res = await apiClient.get('/api/stock-valuations', { params });
  return safeParse(PaginatedResponseSchema(StockValuationSchema), res.data, 'getStockValuations');
}

export async function createStockValuation(data: CreateStockValuationDTO): Promise<StockValuation> {
  const res = await apiClient.post('/api/stock-valuations', data);
  return safeParse(z.object({ data: StockValuationSchema }), res.data, 'createStockValuation').data;
}
