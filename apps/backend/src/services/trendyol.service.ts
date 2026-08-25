import { decrypt } from '../utils/encryption.js';
import { logger } from '../lib/logger.js';
import type { TrendyolCredentials, TrendyolAddress, TrendyolOrderLine, TrendyolOrder, TrendyolOrdersResponse, TrendyolVariant, TrendyolProduct, TrendyolProductsResponse, TrendyolProductAttributeInput, TrendyolProductImageInput, TrendyolProductItemInput, TrendyolProductDeleteItem, TrendyolLookupOption, TrendyolCategoryAttributeValue, TrendyolCategoryAttribute, TrendyolCategoriesResponse, TrendyolBrandsResponse, TrendyolCategoryAttributesResponse, TrendyolCargoProvidersResponse, TrendyolPriceInventoryItem, TrendyolBatchResponse, TrendyolBatchStatus, BatchSummary, TrendyolSupplierAddress } from './trendyol/types.js';
import { readRateLimitSnapshot, sleep, trendyolFetch, TrendyolApiError } from './trendyol/transport.js';
export type * from './trendyol/types.js';
export { TrendyolApiError, maskCredentials, maskSensitiveString } from './trendyol/transport.js';

export const TrendyolService = {

  async testConnection(creds: TrendyolCredentials): Promise<{ success: boolean; message: string }> {
    try {
      await this.getAddresses(creds);
      return { success: true, message: 'Trendyol bağlantısı başarılı.' };
    } catch (err) {
      if (err instanceof TrendyolApiError && err.statusCode === 401) {
        return {
          success: false,
          message: 'Trendyol kimlik bilgileri geçersiz. Satıcı ID, API Key ve API Secret bilgilerini kontrol edin.',
        };
      }
      return { success: false, message: err instanceof Error ? err.message : String(err) };
    }
  },

  async getAddresses(creds: TrendyolCredentials): Promise<{ supplierAddresses: TrendyolSupplierAddress[] }> {
    return trendyolFetch<{ supplierAddresses: TrendyolSupplierAddress[] }>(
      creds, `/integration/sellers/${creds.sellerId}/addresses`,
    );
  },

  async searchCategories(creds: TrendyolCredentials, query?: string): Promise<TrendyolLookupOption[]> {
    const response = await trendyolFetch<TrendyolCategoriesResponse>(creds, '/integration/product/product-categories');
    const needle = query?.trim().toLowerCase();
    const flattened = flattenCategories(response.categories ?? []);
    return needle ? flattened.filter((item) => item.name.toLowerCase().includes(needle)).slice(0, 50) : flattened.slice(0, 50);
  },

  async searchBrands(creds: TrendyolCredentials, query: string): Promise<TrendyolLookupOption[]> {
    const qs = new URLSearchParams({ name: query.trim() });
    const response = await trendyolFetch<TrendyolBrandsResponse>(creds, `/integration/product/brands/by-name?${qs}`);
    return (response.brands ?? []).map((brand) => ({ id: brand.id, name: brand.name })).slice(0, 50);
  },

  async getCategoryAttributes(creds: TrendyolCredentials, categoryId: number): Promise<TrendyolCategoryAttribute[]> {
    const response = await trendyolFetch<TrendyolCategoryAttributesResponse>(
      creds,
      `/integration/product/product-categories/${categoryId}/attributes`,
    );
    return (response.categoryAttributes ?? []).map((item) => ({
      id: item.attribute.id,
      name: item.attribute.name,
      required: item.required ?? false,
      allowCustom: item.allowCustom ?? false,
      values: (item.attributeValues ?? []).map((value) => ({ id: value.id, name: value.name })),
    }));
  },

  async getCargoProviders(creds: TrendyolCredentials): Promise<TrendyolLookupOption[]> {
    const response = await trendyolFetch<TrendyolCargoProvidersResponse>(creds, '/integration/shipment-providers');
    const providers = response.shipmentProviders ?? response.cargoCompanies ?? [];
    return providers
      .map((provider) => {
        const id = typeof provider.id === 'number'
          ? provider.id
          : typeof provider.code === 'number'
            ? provider.code
            : Number(provider.code);
        return Number.isFinite(id) ? { id, name: provider.name } : null;
      })
      .filter((provider): provider is TrendyolLookupOption => provider !== null);
  },

  // ── Orders ────────────────────────────────────

  async getOrders(
    creds: TrendyolCredentials,
    params: {
      startDate?: number; endDate?: number; status?: string;
      page?: number; size?: number;
      orderByField?: 'PackageLastModifiedDate' | 'CreatedDate';
      orderByDirection?: 'ASC' | 'DESC';
      orderNumber?: string; shipmentPackageIds?: number[];
    } = {},
  ): Promise<TrendyolOrdersResponse> {
    const qs = new URLSearchParams({
      page: String(params.page ?? 0),
      size: String(Math.min(params.size ?? 50, 200)),
      orderByField: params.orderByField ?? 'PackageLastModifiedDate',
      orderByDirection: params.orderByDirection ?? 'DESC',
    });
    if (params.startDate) qs.set('startDate', String(params.startDate));
    if (params.endDate) qs.set('endDate', String(params.endDate));
    if (params.status) qs.set('status', params.status);
    if (params.orderNumber) qs.set('orderNumber', params.orderNumber);
    if (params.shipmentPackageIds?.length) qs.set('shipmentPackageIds', params.shipmentPackageIds.join(','));
    return trendyolFetch<TrendyolOrdersResponse>(
      creds, `/integration/order/sellers/${creds.sellerId}/orders?${qs}`,
    );
  },

  async getAllOrdersInRange(
    creds: TrendyolCredentials, startDate: number, endDate: number, status?: string,
  ): Promise<TrendyolOrder[]> {
    const twoWeeksMs = 14 * 24 * 60 * 60 * 1000;
    if (endDate - startDate > twoWeeksMs) throw new Error('Trendyol API maksimum 2 haftalık tarih aralığını destekler.');
    const all: TrendyolOrder[] = [];
    let page = 0, totalPages = 1;
    while (page < totalPages) {
      const res = await this.getOrders(creds, { startDate, endDate, status, page, size: 200 });
      all.push(...res.content);
      totalPages = res.totalPages;
      page++;
      if (page < totalPages) await sleep(200);
    }
    return all;
  },

  async getRecentOrders(creds: TrendyolCredentials, hoursBack = 24, status?: string): Promise<TrendyolOrder[]> {
    const end = Date.now();
    const start = end - Math.min(hoursBack, 336) * 3_600_000;
    return this.getAllOrdersInRange(creds, start, end, status);
  },

  /**
   * Paginate through all orders in a date range (page-based, max 2 weeks).
   * Calls onPage for each page; stops when onPage returns false or pages exhausted.
   * Note: Trendyol does not expose a true cursor/stream endpoint for orders —
   * this uses standard page/totalPages pagination which is sufficient for
   * small-to-medium volume stores.
   */
  async paginateOrders(
    creds: TrendyolCredentials,
    params: { startDate: number; endDate: number; status?: string; pageSize?: number },
    onPage: (orders: TrendyolOrder[], pageIndex: number) => Promise<boolean | void>,
  ): Promise<{ totalFetched: number; pages: number }> {
    const twoWeeksMs = 14 * 24 * 60 * 60 * 1000;
    if (params.endDate - params.startDate > twoWeeksMs) {
      throw new Error('paginateOrders: maksimum 2 haftalık tarih aralığı desteklenir.');
    }
    const size = Math.min(params.pageSize ?? 200, 200);
    let page = 0, totalPages = 1, totalFetched = 0;

    while (page < totalPages) {
      const res = await this.getOrders(creds, {
        startDate: params.startDate, endDate: params.endDate,
        status: params.status, page, size,
        orderByField: 'PackageLastModifiedDate', orderByDirection: 'ASC',
      });
      totalPages = res.totalPages;
      totalFetched += res.content.length;

      const shouldContinue = await onPage(res.content, page);
      if (shouldContinue === false) break;

      page++;
      if (page < totalPages) await sleep(150); // rate limit buffer
    }

    return { totalFetched, pages: page };
  },

  // ── Products ──────────────────────────────────

  async getProducts(
    creds: TrendyolCredentials,
    params: {
      page?: number; size?: number; barcode?: string;
      startDate?: number; endDate?: number;
      dateQueryType?: 'VARIANT_CREATED_DATE' | 'VARIANT_MODIFIED_DATE' | 'CONTENT_MODIFIED_DATE';
      stockCode?: string; productMainId?: string;
      status?: 'archived' | 'blacklisted' | 'locked' | 'onSale' | 'notOnSale';
      nextPageToken?: string; orderByDirection?: 'ASC' | 'DESC';
    } = {},
  ): Promise<TrendyolProductsResponse> {
    const qs = new URLSearchParams({
      page: String(params.page ?? 0),
      size: String(Math.min(params.size ?? 50, 100)),
    });
    if (params.barcode) qs.set('barcode', params.barcode);
    if (params.startDate) qs.set('startDate', String(params.startDate));
    if (params.endDate) qs.set('endDate', String(params.endDate));
    if (params.dateQueryType) qs.set('dateQueryType', params.dateQueryType);
    if (params.stockCode) qs.set('stockCode', params.stockCode);
    if (params.productMainId) qs.set('productMainId', params.productMainId);
    if (params.status) qs.set('status', params.status);
    if (params.nextPageToken) qs.set('nextPageToken', params.nextPageToken);
    if (params.orderByDirection) qs.set('orderByDirection', params.orderByDirection);
    return trendyolFetch<TrendyolProductsResponse>(
      creds, `/integration/product/sellers/${creds.sellerId}/products?${qs}`,
    );
  },

  async createProducts(
    creds: TrendyolCredentials,
    items: TrendyolProductItemInput[],
  ): Promise<TrendyolBatchResponse> {
    validateProductItems(items);
    return trendyolFetch<TrendyolBatchResponse>(
      creds,
      `/integration/product/sellers/${creds.sellerId}/products`,
      { method: 'POST', body: JSON.stringify({ items }) },
    );
  },

  async updateProducts(
    creds: TrendyolCredentials,
    items: TrendyolProductItemInput[],
  ): Promise<TrendyolBatchResponse> {
    validateProductItems(items);
    return trendyolFetch<TrendyolBatchResponse>(
      creds,
      `/integration/product/sellers/${creds.sellerId}/products`,
      { method: 'PUT', body: JSON.stringify({ items }) },
    );
  },

  async deleteProducts(
    creds: TrendyolCredentials,
    items: TrendyolProductDeleteItem[],
  ): Promise<TrendyolBatchResponse> {
    if (items.length === 0) throw new Error('En az 1 ürün gereklidir.');
    if (items.length > 1000) throw new Error('Maksimum 1000 ürün silinebilir.');
    for (const item of items) {
      if (!item.barcode.trim()) throw new Error('Silme için barkod zorunludur.');
    }
    return trendyolFetch<TrendyolBatchResponse>(
      creds,
      `/integration/product/sellers/${creds.sellerId}/products`,
      { method: 'DELETE', body: JSON.stringify({ items }) },
    );
  },

  // ── Stock & Price ─────────────────────────────

  async updatePriceAndInventory(
    creds: TrendyolCredentials, items: TrendyolPriceInventoryItem[],
  ): Promise<TrendyolBatchResponse> {
    if (items.length === 0) throw new Error('En az 1 ürün gereklidir.');
    if (items.length > 1000) throw new Error('Maksimum 1000 ürün güncellenebilir.');
    for (const item of items) {
      if (item.listPrice < item.salePrice) {
        throw new Error(`Barkod ${item.barcode}: listPrice (${item.listPrice}) < salePrice (${item.salePrice})`);
      }
    }
    return trendyolFetch<TrendyolBatchResponse>(
      creds,
      `/integration/inventory/sellers/${creds.sellerId}/products/price-and-inventory`,
      { method: 'POST', body: JSON.stringify({ items }) },
    );
  },

  async getBatchRequestResult(creds: TrendyolCredentials, batchRequestId: string): Promise<TrendyolBatchStatus> {
    return trendyolFetch<TrendyolBatchStatus>(
      creds,
      `/integration/product/sellers/${creds.sellerId}/products/batch-requests/${batchRequestId}`,
    );
  },

  async waitForBatch(
    creds: TrendyolCredentials, batchRequestId: string,
    opts: { pollIntervalMs?: number; maxWaitMs?: number } = {},
  ): Promise<BatchSummary> {
    const pollMs = opts.pollIntervalMs ?? 3_000;
    const deadline = Date.now() + (opts.maxWaitMs ?? 60_000);
    let result: TrendyolBatchStatus;
    do {
      result = await this.getBatchRequestResult(creds, batchRequestId);
      if (result.status !== 'IN_PROGRESS') return summarizeBatch(result);
      await sleep(pollMs);
    } while (Date.now() < deadline);
    return summarizeBatch(await this.getBatchRequestResult(creds, batchRequestId));
  },

  // ── Cargo ─────────────────────────────────────

  async updateTrackingNumber(
    creds: TrendyolCredentials, packageId: number, trackingNumber: string, cargoProviderCode: string,
  ): Promise<void> {
    await trendyolFetch<void>(
      creds,
      `/integration/order/sellers/${creds.sellerId}/shipment-packages/${packageId}/tracking-details`,
      { method: 'PUT', body: JSON.stringify({ trackingNumber, cargoProviderCode }) },
    );
  },

  async cancelPackage(
    creds: TrendyolCredentials, packageId: number, lines: Array<{ lineId: number; quantity: number }>,
  ): Promise<void> {
    await trendyolFetch<void>(
      creds,
      `/integration/order/sellers/${creds.sellerId}/shipment-packages/${packageId}/items/unsupplied`,
      { method: 'PUT', body: JSON.stringify({ lines }) },
    );
  },

  async updatePackageStatus(
    creds: TrendyolCredentials, packageId: number, status: 'Picking' | 'Invoiced',
    params?: { trackingNumber?: string; cargoProviderCode?: string },
  ): Promise<void> {
    await trendyolFetch<void>(
      creds,
      `/integration/order/sellers/${creds.sellerId}/shipment-packages/${packageId}`,
      { method: 'PUT', body: JSON.stringify({ status, ...params }) },
    );
  },

  getApiLimitRemaining(): { remaining: number; resetAt: string } {
    return readRateLimitSnapshot();
  },
};

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────



function flattenCategories(categories: NonNullable<TrendyolCategoriesResponse['categories']>): TrendyolLookupOption[] {
  const result: TrendyolLookupOption[] = [];
  for (const category of categories) {
    result.push({ id: category.id, name: category.name });
    if (category.subCategories?.length) {
      result.push(...flattenCategories(category.subCategories));
    }
  }
  return result;
}

function validateProductItems(items: TrendyolProductItemInput[]): void {
  if (items.length === 0) throw new Error('En az 1 ürün gereklidir.');
  if (items.length > 1000) throw new Error('Maksimum 1000 ürün gönderilebilir.');

  for (const item of items) {
    if (!item.barcode.trim()) throw new Error('Barkod zorunludur.');
    if (!item.title.trim()) throw new Error(`Barkod ${item.barcode}: başlık zorunludur.`);
    if (!item.productMainId.trim()) throw new Error(`Barkod ${item.barcode}: productMainId zorunludur.`);
    if (!item.stockCode.trim()) throw new Error(`Barkod ${item.barcode}: stockCode zorunludur.`);
    if (!Number.isInteger(item.brandId) || item.brandId <= 0) throw new Error(`Barkod ${item.barcode}: brandId geçersiz.`);
    if (!Number.isInteger(item.categoryId) || item.categoryId <= 0) throw new Error(`Barkod ${item.barcode}: categoryId geçersiz.`);
    if (item.listPrice < item.salePrice) {
      throw new Error(`Barkod ${item.barcode}: listPrice (${item.listPrice}) < salePrice (${item.salePrice})`);
    }
  }
}

/**
 * Item-status-based batch summary.
 * Counts each distinct item.status value and collects failures.
 */
function summarizeBatch(result: TrendyolBatchStatus): BatchSummary {
  const byStatus: Record<string, number> = {};
  const failures: BatchSummary['failures'] = [];

  for (const item of result.items) {
    byStatus[item.status] = (byStatus[item.status] ?? 0) + 1;
    if (item.status !== 'SUCCESS' && item.failureReasons.length > 0) {
      failures.push({
        barcode: String((item.requestItem as Record<string, unknown>).barcode ?? '?'),
        status: item.status,
        reasons: item.failureReasons,
      });
    }
  }

  const succeeded = byStatus['SUCCESS'] ?? (result.itemCount - result.failedItemCount);

  return {
    batchRequestId: result.batchRequestId,
    status: result.status,
    total: result.itemCount,
    succeeded,
    failed: result.failedItemCount,
    byStatus,
    failures,
  };
}

/**
 * Canonical Trendyol status → ERP MarketplaceOrderStatus.
 * Normalized: lowercase input, trimmed.
 */
export function mapTrendyolOrderStatus(
  raw: string,
): 'PENDING' | 'PROCESSING' | 'SHIPPED' | 'DELIVERED' | 'CANCELLED' | 'RETURNED' | 'REFUNDED' {
  // Normalize: trim + lowercase for comparison
  const s = raw.trim();
  const map: Record<string, 'PENDING' | 'PROCESSING' | 'SHIPPED' | 'DELIVERED' | 'CANCELLED' | 'RETURNED' | 'REFUNDED'> = {
    Awaiting: 'PENDING',
    Created: 'PENDING',
    Picking: 'PROCESSING',
    Invoiced: 'PROCESSING',
    Shipped: 'SHIPPED',
    AtCollectionPoint: 'SHIPPED',
    Delivered: 'DELIVERED',
    Cancelled: 'CANCELLED',
    UnSupplied: 'CANCELLED',
    UnPacked: 'CANCELLED',
    UnDelivered: 'RETURNED',
    Returned: 'RETURNED',
    Repack: 'RETURNED',
    Refunded: 'REFUNDED',
  };
  // Exact match first
  if (map[s]) return map[s];
  // Case-insensitive fallback
  const lower = s.toLowerCase();
  for (const [k, v] of Object.entries(map)) {
    if (k.toLowerCase() === lower) return v;
  }
  logger.warn(`[Trendyol] Unknown order status: "${s}" — defaulting to PENDING`);
  return 'PENDING';
}

export function buildTrendyolCredentials(integration: {
  apiKey: string | null; apiSecret: string | null; storeId: string | null;
}): TrendyolCredentials {
  if (!integration.apiKey || !integration.apiSecret || !integration.storeId) {
    throw new Error('Trendyol: apiKey, apiSecret ve storeId (Seller ID) zorunludur.');
  }
  return {
    sellerId: integration.storeId,
    apiKey: decrypt(integration.apiKey),
    apiSecret: decrypt(integration.apiSecret),
    storeFrontCode: 'TR',
  };
}
