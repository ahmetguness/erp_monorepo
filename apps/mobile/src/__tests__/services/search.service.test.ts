import { describe, it, expect, vi, beforeEach } from 'vitest';
import { apiClient } from '../../lib/api-client';
import {
  GlobalSearchResult,
  filterResultsByCategory,
  getRecentSearches,
  saveRecentSearch,
  removeRecentSearch,
  clearRecentSearches,
  performGlobalSearch,
  GlobalSearchResultSchema,
  SEARCH_CATEGORIES,
} from '../../services/search.service';

vi.mock('../../lib/api-client', () => ({
  apiClient: {
    get: vi.fn(),
  },
}));

describe('search.service (FAZ 17 Global Spotlight Search)', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await clearRecentSearches();
  });

  const sampleResults: GlobalSearchResult[] = [
    {
      id: 'c-1',
      type: 'contact',
      kind: 'record',
      module: 'contacts',
      title: 'Atlas Makina Sanayi A.Ş.',
      subtitle: 'Müşteri',
      href: '/dashboard/contacts/c-1',
      status: 'ACTIVE',
      meta: [{ label: 'Vergi No', value: '1234567890' }],
    },
    {
      id: 'emp-1',
      type: 'employee',
      kind: 'record',
      module: 'hr',
      title: 'Ahmet Yılmaz',
      subtitle: 'Saha Teknisyeni',
      href: '/dashboard/hr/employees/emp-1',
      status: 'ACTIVE',
      meta: [],
    },
    {
      id: 'p-1',
      type: 'product',
      kind: 'record',
      module: 'inventory',
      title: 'PRD-101 - Hidrolik Pompa',
      subtitle: 'Barkod: 8690123456789',
      href: '/dashboard/products/p-1',
      amount: '12.500,00 TRY',
      meta: [{ label: 'Kod', value: 'PRD-101' }],
    },
    {
      id: 'sm-1',
      type: 'stock_movement',
      kind: 'record',
      module: 'inventory',
      title: 'Giriş: 50 Adet PRD-101',
      subtitle: null,
      href: '/dashboard/inventory',
      meta: [],
    },
    {
      id: 'so-1',
      type: 'sales_order',
      kind: 'record',
      module: 'sales',
      title: 'SO-2026-0045',
      subtitle: 'Atlas Makina',
      href: '/dashboard/sales-orders/so-1',
      status: 'CONFIRMED',
      amount: '45.000,00 TRY',
      meta: [],
    },
    {
      id: 'po-1',
      type: 'purchase_order',
      kind: 'record',
      module: 'procurement',
      title: 'PO-2026-0012',
      subtitle: 'Tedarikçi A.Ş.',
      href: '/dashboard/purchase-orders/po-1',
      status: 'PENDING',
      meta: [],
    },
    {
      id: 'inv-1',
      type: 'invoice',
      kind: 'record',
      module: 'invoicing',
      title: 'GIB202600000102',
      subtitle: 'Satış Faturası',
      href: '/dashboard/invoices/inv-1',
      status: 'SENT',
      amount: '54.000,00 TRY',
      meta: [],
    },
    {
      id: 'sr-1',
      type: 'service_request',
      kind: 'record',
      module: 'service',
      title: 'SR-1002 - Pompa Bakımı',
      subtitle: 'Atlas Makina Şantiyesi',
      href: '/dashboard/service/requests/sr-1',
      status: 'SCHEDULED',
      meta: [],
    },
    {
      id: 'act-1',
      type: 'action',
      kind: 'action',
      module: 'contacts',
      title: 'Yeni Müşteri Oluştur',
      subtitle: 'Cari kartı aç',
      href: '/dashboard/contacts/new',
      meta: [],
    },
  ];

  describe('filterResultsByCategory', () => {
    it('returns all items when category is ALL', () => {
      const filtered = filterResultsByCategory(sampleResults, 'ALL');
      expect(filtered).toHaveLength(sampleResults.length);
    });

    it('filters contacts and employees when category is CONTACT', () => {
      const filtered = filterResultsByCategory(sampleResults, 'CONTACT');
      expect(filtered.map((r) => r.id)).toEqual(['c-1', 'emp-1']);
    });

    it('filters products and stock movements when category is PRODUCT', () => {
      const filtered = filterResultsByCategory(sampleResults, 'PRODUCT');
      expect(filtered.map((r) => r.id)).toEqual(['p-1', 'sm-1']);
    });

    it('filters sales orders, quotes and purchase orders when category is ORDER', () => {
      const filtered = filterResultsByCategory(sampleResults, 'ORDER');
      expect(filtered.map((r) => r.id)).toEqual(['so-1', 'po-1']);
    });

    it('filters invoices and payments when category is FINANCE', () => {
      const filtered = filterResultsByCategory(sampleResults, 'FINANCE');
      expect(filtered.map((r) => r.id)).toEqual(['inv-1']);
    });

    it('filters service requests, tasks and actions when category is OPERATION', () => {
      const filtered = filterResultsByCategory(sampleResults, 'OPERATION');
      expect(filtered.map((r) => r.id)).toEqual(['sr-1', 'act-1']);
    });
  });

  describe('Recent Searches History (AsyncStorage)', () => {
    it('saves recent search query and puts newest first', async () => {
      await saveRecentSearch('Atlas');
      let recents = await getRecentSearches();
      expect(recents).toEqual(['Atlas']);

      await saveRecentSearch('Pompa');
      recents = await getRecentSearches();
      expect(recents).toEqual(['Pompa', 'Atlas']);
    });

    it('deduplicates case-insensitively and puts existing term to the top', async () => {
      await saveRecentSearch('atlas');
      await saveRecentSearch('rulman');
      await saveRecentSearch('ATLAS');

      const recents = await getRecentSearches();
      expect(recents).toEqual(['ATLAS', 'rulman']);
    });

    it('removes a specific recent search item', async () => {
      await saveRecentSearch('rulman');
      await saveRecentSearch('somun');

      await removeRecentSearch('rulman');
      const recents = await getRecentSearches();
      expect(recents).toEqual(['somun']);
    });

    it('clears all recent searches', async () => {
      await saveRecentSearch('rulman');
      await saveRecentSearch('somun');

      await clearRecentSearches();
      const recents = await getRecentSearches();
      expect(recents).toEqual([]);
    });

    it('ignores empty or single character queries', async () => {
      await saveRecentSearch('   ');
      await saveRecentSearch('a');
      const recents = await getRecentSearches();
      expect(recents).toEqual([]);
    });
  });

  describe('performGlobalSearch API integration', () => {
    it('returns empty array when query is empty', async () => {
      const res = await performGlobalSearch('  ');
      expect(res.results).toEqual([]);
      expect(res.total).toBe(0);
      expect(apiClient.get).not.toHaveBeenCalled();
    });

    it('calls GET /api/search with query and returns parsed data', async () => {
      vi.spyOn(apiClient, 'get').mockResolvedValue({
        data: {
          data: [sampleResults[0], sampleResults[2]],
          meta: { query: 'pompa', total: 2 },
        },
      } as any);

      const res = await performGlobalSearch('pompa', 15);
      expect(apiClient.get).toHaveBeenCalledWith('/api/search', {
        params: { q: 'pompa', limit: 15 },
      });
      expect(res.results).toHaveLength(2);
      expect(res.total).toBe(2);
      expect(res.results[0].title).toBe('Atlas Makina Sanayi A.Ş.');
    });

    it('handles network error gracefully and returns empty array', async () => {
      vi.spyOn(apiClient, 'get').mockRejectedValue(new Error('Network error'));

      const res = await performGlobalSearch('test');
      expect(res.results).toEqual([]);
      expect(res.total).toBe(0);
    });
  });

  describe('GlobalSearchResultSchema validation', () => {
    it('parses valid search result with defaults', () => {
      const raw = {
        id: 'test-1',
        type: 'product',
        title: 'Test Urun',
      };
      const parsed = GlobalSearchResultSchema.safeParse(raw);
      expect(parsed.success).toBe(true);
      if (parsed.success) {
        expect(parsed.data.kind).toBe('record');
        expect(parsed.data.meta).toEqual([]);
        expect(parsed.data.href).toBe('');
      }
    });

    it('defines 6 user-friendly search categories with icons and colors', () => {
      expect(SEARCH_CATEGORIES).toHaveLength(6);
      const keys = SEARCH_CATEGORIES.map((c) => c.key);
      expect(keys).toEqual(['ALL', 'CONTACT', 'PRODUCT', 'ORDER', 'FINANCE', 'OPERATION']);
    });
  });
});
