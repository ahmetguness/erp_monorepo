/**
 * Trendyol Partner API — Production-grade Integration Service
 *
 * Improvements applied:
 *  1. waitRateLimit — throws replaced with async wait
 *  2. waitRateLimit called before every retry attempt
 *  3. computeBackoff() — single backoff/Retry-After function
 *  4. maskResponseBody() — response body log masking
 *  5. summarizeBatch() — item.status-based (SUCCESS vs others)
 *  6. normalizeOrderStatus() — canonical status map
 *  7. Duplicate payload guard moved to worker (DB layer)
 *  8. All sync runs through TrendyolWorker queue
 *  9. paginateOrders() — page-based order pagination (renamed from streamOrders)
 * 10. Redis-based rate limiter when REDIS_URL is set
 */

import { logger } from '../lib/logger';

// ─────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────

const BASE_URL = process.env.TRENDYOL_MOCK === 'true'
  ? 'http://localhost:3099'
  : 'https://apigw.trendyol.com';
const INTEGRATOR = 'AxonERP';
const DEFAULT_TIMEOUT_MS = 15_000;
const MAX_RETRIES = 3;
const RATE_WINDOW_MS = 10_000;
const RATE_LIMIT = 48; // 50/10s — 2 buffer
const MASK = '***';

// ─────────────────────────────────────────────
// Types — Credentials
// ─────────────────────────────────────────────

export interface TrendyolCredentials {
  sellerId: string;
  apiKey: string;
  apiSecret: string;
  /** Default: 'TR' */
  storeFrontCode?: string;
}

// ── Orders ────────────────────────────────────

export interface TrendyolAddress {
  id: number;
  firstName: string;
  lastName: string;
  company: string;
  address1: string;
  address2: string;
  city: string;
  cityCode: number;
  district: string;
  districtId: number;
  postalCode: string;
  countryCode: string;
  neighborhoodId: number;
  neighborhood: string;
  phone: string | null;
  fullAddress: string;
  fullName: string;
  taxOffice?: string;
  taxNumber?: string;
}

export interface TrendyolOrderLine {
  lineId: number;
  quantity: number;
  salesCampaignId: number;
  productSize: string;
  stockCode: string;
  productName: string;
  contentId: number;
  productOrigin: string;
  sellerId: number;
  lineGrossAmount: number;
  lineTotalDiscount: number;
  lineSellerDiscount: number;
  lineTyDiscount: number;
  discountDetails: Array<{ lineItemPrice: number; lineItemSellerDiscount: number; lineItemTyDiscount: number }>;
  currencyCode: string;
  productColor: string;
  vatRate: number;
  barcode: string;
  orderLineItemStatusName: string;
  lineUnitPrice: number;
  productCategoryId: number;
  commission: number;
  cancelledBy: string;
  cancelReason: string;
  cancelReasonCode: number;
}

export interface TrendyolOrder {
  shipmentPackageId: number;
  orderNumber: string;
  status: string;
  shipmentPackageStatus: string;
  orderDate: number;
  lastModifiedDate: number;
  activationDate: number;
  estimatedDeliveryStartDate: number;
  estimatedDeliveryEndDate: number;
  agreedDeliveryDate: number | null;
  originShipmentDate: number | null;
  packageGrossAmount: number;
  packageSellerDiscount: number;
  packageTyDiscount: number;
  packageTotalDiscount: number;
  packageTotalPrice: number;
  currencyCode: string;
  taxNumber: string | null;
  identityNumber: string | null;
  customerFirstName: string;
  customerLastName: string;
  customerEmail: string;
  customerId: number;
  supplierId: number;
  shipmentAddress: TrendyolAddress;
  invoiceAddress: TrendyolAddress | null;
  lines: TrendyolOrderLine[];
  cargoTrackingNumber: number | null;
  cargoTrackingLink: string | null;
  cargoSenderNumber: string | null;
  cargoProviderName: string | null;
  deliveryType: string;
  deliveryAddressType: string;
  fastDelivery: boolean;
  fastDeliveryType: string | null;
  commercial: boolean;
  micro: boolean;
  isCod: boolean;
  warehouseId: number;
  invoiceLink: string | null;
  packageHistories: Array<{ createdDate: number; status: string }>;
  createdBy: 'order-creation' | 'cancel' | 'split' | 'transfer';
  originPackageIds: number[] | null;
  giftBoxRequested: boolean;
  containsDangerousProduct: boolean;
  cargoDeci: number;
  shipmentNumber: number;
}

export interface TrendyolOrdersResponse {
  page: number;
  size: number;
  totalPages: number;
  totalElements: number;
  content: TrendyolOrder[];
}

// ── Products (v2) ─────────────────────────────

export interface TrendyolVariant {
  variantId: number;
  supplierId: number;
  barcode: string;
  attributes: Array<{ attributeId: number; attributeName: string; attributeValueId?: number; attributeValue: string }>;
  productUrl: string;
  onSale: boolean;
  stock: { quantity?: number; lastModifiedDate: number | null };
  price: { salePrice: number; listPrice: number };
  stockCode: string;
  vatRate: number;
  sellerCreatedDate: number;
  sellerModifiedDate: number;
  locked: boolean;
  lockReason: string | null;
  archived: boolean;
  blacklisted: boolean;
}

export interface TrendyolProduct {
  contentId: number;
  productMainId: string;
  brand: { id: number; name: string };
  category: { id: number; name: string };
  creationDate: number;
  lastModifiedDate: number;
  title: string;
  description: string;
  images: Array<{ url: string }>;
  attributes: Array<{ attributeId: number; attributeName: string; attributeValueId?: number; attributeValue: string }>;
  variants: TrendyolVariant[];
}

export interface TrendyolProductsResponse {
  page: number;
  size: number;
  totalPages: number;
  totalElements: number;
  nextPageToken: string | null;
  content: TrendyolProduct[];
}

// ── Stock & Price ─────────────────────────────

export interface TrendyolPriceInventoryItem {
  barcode: string;
  quantity: number;
  salePrice: number;
  listPrice: number;
}

export interface TrendyolBatchResponse {
  batchRequestId: string;
}

export interface TrendyolBatchStatus {
  batchRequestId: string;
  status: 'IN_PROGRESS' | 'COMPLETED' | 'FAILED';
  creationDate: number;
  lastModification: number;
  sourceType: string;
  itemCount: number;
  failedItemCount: number;
  items: Array<{ requestItem: Record<string, unknown>; status: string; failureReasons: string[] }>;
}

export interface BatchSummary {
  batchRequestId: string;
  status: TrendyolBatchStatus['status'];
  total: number;
  succeeded: number;
  failed: number;
  /** Per-status breakdown: { SUCCESS: 10, FAILED: 2, ... } */
  byStatus: Record<string, number>;
  failures: Array<{ barcode: string; status: string; reasons: string[] }>;
}

// ── Addresses ─────────────────────────────────

export interface TrendyolSupplierAddress {
  id: number;
  addressType: string;
  country: string;
  city: string;
  cityCode: number;
  district: string;
  districtId: number;
  postCode: string;
  address: string;
  neighborhoodId: number;
  neighborhood: string;
  floor: string;
  doorNumber: string;
  isDefault: boolean;
  fullAddress: string;
}

// ─────────────────────────────────────────────
// Error
// ─────────────────────────────────────────────

export class TrendyolApiError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
    public readonly endpoint: string,
  ) {
    super(message);
    this.name = 'TrendyolApiError';
  }
  get isRateLimit() { return this.statusCode === 429; }
  get isServerError() { return this.statusCode >= 500; }
  get isRetryable() { return this.isRateLimit || this.isServerError; }
}

// ─────────────────────────────────────────────
// Log masking
// ─────────────────────────────────────────────

export function maskCredentials(creds: TrendyolCredentials): Record<string, string> {
  return {
    sellerId: creds.sellerId,
    apiKey: creds.apiKey.slice(0, 4) + MASK,
    apiSecret: MASK,
    storeFrontCode: creds.storeFrontCode ?? 'TR',
  };
}

export function maskSensitiveString(value: string): string {
  if (!value) return value;
  if (value.includes('@')) {
    const [local, domain] = value.split('@');
    return `${local.slice(0, 2)}${MASK}@${domain}`;
  }
  return MASK + value.slice(-4);
}

/**
 * Mask sensitive fields in a response body string before logging.
 * Redacts: phone, email, identityNumber, taxNumber, apiKey, apiSecret.
 */
function maskResponseBody(body: string): string {
  return body
    .replace(/"phone"\s*:\s*"[^"]+"/g, '"phone":"***"')
    .replace(/"email"\s*:\s*"[^"]+"/g, '"email":"***"')
    .replace(/"identityNumber"\s*:\s*"[^"]+"/g, '"identityNumber":"***"')
    .replace(/"taxNumber"\s*:\s*"[^"]+"/g, '"taxNumber":"***"')
    .replace(/"apiKey"\s*:\s*"[^"]+"/g, '"apiKey":"***"')
    .replace(/"apiSecret"\s*:\s*"[^"]+"/g, '"apiSecret":"***"');
}

// ─────────────────────────────────────────────
// Rate Limiter — in-process (single process)
// Falls back to Redis when REDIS_URL is set (multi-process safe).
// ─────────────────────────────────────────────

interface RateBucket { count: number; windowStart: number }
const rateBuckets = new Map<string, RateBucket>();

// Redis singleton — created once, reused across all calls
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _redisClient: any = null;

function getRedisClient(): { incr(k: string): Promise<number>; expire(k: string, s: number): Promise<number> } | null {
  if (!process.env.REDIS_URL) return null;
  if (_redisClient) return _redisClient;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Redis = require('ioredis') as new (url: string) => typeof _redisClient;
    _redisClient = new Redis(process.env.REDIS_URL);
    _redisClient.on('error', (err: Error) => {
      logger.warn(`[Trendyol] Redis error: ${err.message} — falling back to in-process rate limiter`);
      _redisClient = null; // reset so next call retries
    });
    return _redisClient;
  } catch {
    return null;
  }
}

/**
 * Wait until there is capacity in the rate window.
 * Unlike the old checkRateLimit (which threw), this async-waits.
 */
async function waitRateLimit(endpoint: string): Promise<void> {
  if (process.env.REDIS_URL) {
    await waitRateLimitRedis(endpoint);
    return;
  }
  await waitRateLimitInProcess(endpoint);
}

async function waitRateLimitInProcess(endpoint: string): Promise<void> {
  const key = endpoint.split('?')[0];
  const now = Date.now();
  let bucket = rateBuckets.get(key);

  if (!bucket || now - bucket.windowStart >= RATE_WINDOW_MS) {
    bucket = { count: 0, windowStart: now };
    rateBuckets.set(key, bucket);
  }

  if (bucket.count >= RATE_LIMIT) {
    const waitMs = RATE_WINDOW_MS - (now - bucket.windowStart) + 50;
    logger.warn(`[Trendyol] Rate limit reached for ${key}, waiting ${waitMs}ms`);
    await sleep(waitMs);
    bucket.count = 0;
    bucket.windowStart = Date.now();
  }

  bucket.count++;
}

/**
 * Redis-based rate limiter using INCR + EXPIRE (sliding window approximation).
 * Uses module-level singleton client — no new connection per call.
 */
async function waitRateLimitRedis(endpoint: string): Promise<void> {
  const redis = getRedisClient();
  if (!redis) {
    // Redis unavailable — fall back to in-process
    await waitRateLimitInProcess(endpoint);
    return;
  }
  try {
    const key = `trendyol:rl:${endpoint.split('?')[0]}`;
    const count = await redis.incr(key);
    if (count === 1) await redis.expire(key, Math.ceil(RATE_WINDOW_MS / 1000));
    if (count > RATE_LIMIT) {
      const waitMs = RATE_WINDOW_MS + 50;
      logger.warn(`[Trendyol] Redis rate limit for ${key}, waiting ${waitMs}ms`);
      await sleep(waitMs);
    }
  } catch {
    await waitRateLimitInProcess(endpoint);
  }
}
// ─────────────────────────────────────────────
// Backoff — single function for retry delay
// ─────────────────────────────────────────────

/**
 * Compute how long to wait before the next retry attempt.
 * Respects Retry-After header (429), otherwise exponential backoff.
 */
function computeBackoff(attempt: number, retryAfterHeader: string | null): number {
  if (retryAfterHeader) {
    const seconds = parseInt(retryAfterHeader, 10);
    if (!isNaN(seconds) && seconds > 0) return seconds * 1000;
  }
  // Exponential: 1s, 2s, 4s (capped at 8s)
  return Math.min(1000 * Math.pow(2, attempt - 1), 8_000);
}

// ─────────────────────────────────────────────
// HTTP Client
// ─────────────────────────────────────────────

function buildHeaders(creds: TrendyolCredentials): Record<string, string> {
  const token = Buffer.from(`${creds.apiKey}:${creds.apiSecret}`).toString('base64');
  return {
    'Authorization': `Basic ${token}`,
    'Content-Type': 'application/json',
    'User-Agent': `${creds.sellerId} - ${INTEGRATOR}`,
    'storeFrontCode': creds.storeFrontCode ?? 'TR',
  };
}

async function trendyolFetch<T>(
  creds: TrendyolCredentials,
  path: string,
  options: RequestInit & { timeoutMs?: number } = {},
): Promise<T> {
  const url = `${BASE_URL}${path}`;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const headers = buildHeaders(creds);

  let lastError: TrendyolApiError | null = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    // 1. Wait for rate limit capacity BEFORE every attempt (including first)
    await waitRateLimit(path);

    // 2. Backoff delay for retries
    if (attempt > 0) {
      const backoffMs = computeBackoff(attempt, null);
      logger.warn(`[Trendyol] Retry ${attempt}/${MAX_RETRIES} for ${path} in ${backoffMs}ms`);
      await sleep(backoffMs);
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetch(url, {
        ...options,
        headers: { ...headers, ...(options.headers as Record<string, string> ?? {}) },
        signal: controller.signal,
      });

      clearTimeout(timer);

      if (!res.ok) {
        const rawBody = await res.text().catch(() => '');
        const maskedBody = maskResponseBody(rawBody.slice(0, 300));
        const err = new TrendyolApiError(
          `HTTP ${res.status} ${res.statusText}: ${maskedBody}`,
          res.status,
          path,
        );

        if (err.isRetryable && attempt < MAX_RETRIES) {
          lastError = err;
          // Use Retry-After header for backoff computation on next iteration
          const retryAfter = res.headers.get('Retry-After');
          if (retryAfter) {
            const waitMs = computeBackoff(attempt + 1, retryAfter);
            logger.warn(`[Trendyol] ${res.status} — waiting ${waitMs}ms (Retry-After: ${retryAfter})`);
            await sleep(waitMs);
          }
          continue;
        }

        logger.error(`[Trendyol] ${err.message} — seller: ${maskCredentials(creds).sellerId}`);
        throw err;
      }

      if (res.status === 204) return {} as T;
      return res.json() as Promise<T>;

    } catch (err) {
      clearTimeout(timer);
      if (err instanceof TrendyolApiError) throw err;

      const isTimeout = (err as Error).name === 'AbortError';
      const msg = isTimeout ? `Timeout after ${timeoutMs}ms` : `Network error: ${(err as Error).message}`;
      lastError = new TrendyolApiError(msg, isTimeout ? 408 : 0, path);

      if (attempt < MAX_RETRIES) continue;
      throw lastError;
    }
  }

  throw lastError ?? new TrendyolApiError('Max retries exceeded', 0, path);
}

// ─────────────────────────────────────────────
// Trendyol Service
// ─────────────────────────────────────────────

export const TrendyolService = {

  async testConnection(creds: TrendyolCredentials): Promise<{ success: boolean; message: string }> {
    try {
      await this.getAddresses(creds);
      return { success: true, message: 'Trendyol bağlantısı başarılı.' };
    } catch (err) {
      return { success: false, message: err instanceof Error ? err.message : String(err) };
    }
  },

  async getAddresses(creds: TrendyolCredentials): Promise<{ supplierAddresses: TrendyolSupplierAddress[] }> {
    return trendyolFetch<{ supplierAddresses: TrendyolSupplierAddress[] }>(
      creds, `/integration/sellers/${creds.sellerId}/addresses`,
    );
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
};

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
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
    apiKey: integration.apiKey,
    apiSecret: integration.apiSecret,
    storeFrontCode: 'TR',
  };
}
