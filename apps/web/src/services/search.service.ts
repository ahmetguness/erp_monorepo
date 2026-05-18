import { z } from 'zod';
import { apiClient } from '@/lib/api-client';
import { safeParse } from '@/lib/safe-parse';

export const GlobalSearchResultSchema = z.object({
  id: z.string(),
  type: z.enum(['product', 'contact', 'invoice', 'sales_order', 'purchase_order', 'payment', 'stock_movement']),
  module: z.string(),
  title: z.string(),
  subtitle: z.string().nullable(),
  href: z.string(),
});

const GlobalSearchResponseSchema = z.object({
  data: z.array(GlobalSearchResultSchema),
  meta: z.object({ query: z.string(), total: z.coerce.number() }),
});

export type GlobalSearchResult = z.infer<typeof GlobalSearchResultSchema>;

export async function searchGlobal(query: string, limit = 8): Promise<GlobalSearchResult[]> {
  const res = await apiClient.get('/api/search', { params: { q: query, limit } });
  return safeParse(GlobalSearchResponseSchema, res.data, 'searchGlobal').data;
}
