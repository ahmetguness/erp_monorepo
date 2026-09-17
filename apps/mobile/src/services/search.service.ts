import { z } from 'zod';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { apiClient } from '../lib/api-client';

// ─────────────────────────────────────────────
// FAZ 17: Global Spotlight Search Schemas & Types
// ─────────────────────────────────────────────

export const SearchResultTypeEnum = z.enum([
  'product',
  'contact',
  'invoice',
  'sales_quote',
  'sales_order',
  'purchase_order',
  'payment',
  'stock_movement',
  'mail',
  'employee',
  'service_request',
  'document',
  'task',
  'action',
]);
export type SearchResultType = z.infer<typeof SearchResultTypeEnum>;

export const GlobalSearchResultSchema = z.object({
  id: z.string(),
  type: SearchResultTypeEnum,
  kind: z.enum(['record', 'action']).default('record'),
  module: z.string().default(''),
  title: z.string(),
  subtitle: z.string().nullable().optional(),
  href: z.string().default(''),
  status: z.string().nullable().optional(),
  date: z.string().nullable().optional(),
  amount: z.string().nullable().optional(),
  meta: z
    .array(
      z.object({
        label: z.string(),
        value: z.string(),
      })
    )
    .default([]),
});
export type GlobalSearchResult = z.infer<typeof GlobalSearchResultSchema>;

export const GlobalSearchResponseSchema = z.object({
  data: z.array(GlobalSearchResultSchema),
  meta: z
    .object({
      query: z.string().default(''),
      total: z.coerce.number().default(0),
    })
    .optional(),
});

export type SearchCategoryFilter =
  | 'ALL'
  | 'CONTACT'
  | 'PRODUCT'
  | 'ORDER'
  | 'FINANCE'
  | 'OPERATION';

export interface SearchCategoryMeta {
  key: SearchCategoryFilter;
  label: string;
  icon: string;
  color: string;
}

export const SEARCH_CATEGORIES: SearchCategoryMeta[] = [
  { key: 'ALL', label: 'Tümü', icon: 'apps-outline', color: '#2563eb' },
  { key: 'CONTACT', label: 'Cari & Müşteri', icon: 'people-outline', color: '#10b981' },
  { key: 'PRODUCT', label: 'Ürün & Stok', icon: 'cube-outline', color: '#f59e0b' },
  { key: 'ORDER', label: 'Sipariş & Teklif', icon: 'cart-outline', color: '#3b82f6' },
  { key: 'FINANCE', label: 'Fatura & Ödeme', icon: 'receipt-outline', color: '#8b5cf6' },
  { key: 'OPERATION', label: 'Servis & İş Emri', icon: 'construct-outline', color: '#ec4899' },
];

/**
 * Filter results by active category
 */
export function filterResultsByCategory(
  results: GlobalSearchResult[],
  category: SearchCategoryFilter
): GlobalSearchResult[] {
  if (category === 'ALL') return results;

  switch (category) {
    case 'CONTACT':
      return results.filter((r) => r.type === 'contact' || r.type === 'employee');
    case 'PRODUCT':
      return results.filter((r) => r.type === 'product' || r.type === 'stock_movement');
    case 'ORDER':
      return results.filter(
        (r) =>
          r.type === 'sales_order' ||
          r.type === 'sales_quote' ||
          r.type === 'purchase_order'
      );
    case 'FINANCE':
      return results.filter(
        (r) => r.type === 'invoice' || r.type === 'payment' || r.type === 'document'
      );
    case 'OPERATION':
      return results.filter(
        (r) =>
          r.type === 'service_request' ||
          r.type === 'task' ||
          r.type === 'action' ||
          r.module === 'production'
      );
    default:
      return results;
  }
}

// ─────────────────────────────────────────────
// Recent Search History Storage
// ─────────────────────────────────────────────

const RECENT_SEARCHES_KEY = '@axon_recent_searches_v1';
const MAX_RECENT_SEARCHES = 8;

export async function getRecentSearches(): Promise<string[]> {
  try {
    const raw = await AsyncStorage.getItem(RECENT_SEARCHES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function saveRecentSearch(query: string): Promise<string[]> {
  const clean = query.trim();
  if (!clean || clean.length < 2) return getRecentSearches();

  try {
    const existing = await getRecentSearches();
    const filtered = existing.filter((item) => item.toLowerCase() !== clean.toLowerCase());
    const updated = [clean, ...filtered].slice(0, MAX_RECENT_SEARCHES);
    await AsyncStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(updated));
    return updated;
  } catch {
    return [];
  }
}

export async function removeRecentSearch(query: string): Promise<string[]> {
  try {
    const existing = await getRecentSearches();
    const updated = existing.filter((item) => item.toLowerCase() !== query.toLowerCase());
    await AsyncStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(updated));
    return updated;
  } catch {
    return [];
  }
}

export async function clearRecentSearches(): Promise<void> {
  try {
    await AsyncStorage.removeItem(RECENT_SEARCHES_KEY);
  } catch {
    // ignore
  }
}

// ─────────────────────────────────────────────
// API Client Search Function
// ─────────────────────────────────────────────

/**
 * 17.1: Perform multi-entity global spotlight search across ERP
 */
export async function performGlobalSearch(
  query: string,
  limit = 20
): Promise<{
  results: GlobalSearchResult[];
  total: number;
}> {
  const clean = query.trim();
  if (!clean) return { results: [], total: 0 };

  try {
    const res = await apiClient.get('/api/search', {
      params: { q: clean, limit },
    });

    const parsed = GlobalSearchResponseSchema.safeParse(res.data);
    if (parsed.success) {
      return {
        results: parsed.data.data,
        total: parsed.data.meta?.total ?? parsed.data.data.length,
      };
    }

    const rawList = Array.isArray(res.data?.data) ? res.data.data : [];
    return {
      results: rawList,
      total: res.data?.meta?.total ?? rawList.length,
    };
  } catch (err) {
    console.warn('[performGlobalSearch] API search error:', err);
    return { results: [], total: 0 };
  }
}
