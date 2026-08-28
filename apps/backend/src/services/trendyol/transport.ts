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

import { logger } from '../../lib/logger';
import { decrypt } from '../../utils/encryption.js';
import { isMarketplaceMockChannelEnabled } from '../../config/env';
import { observedFetch } from '../../modules/shared/index.js';

// ─────────────────────────────────────────────

import type { TrendyolCredentials, TrendyolAddress, TrendyolOrderLine, TrendyolOrder, TrendyolOrdersResponse, TrendyolVariant, TrendyolProduct, TrendyolProductsResponse, TrendyolProductAttributeInput, TrendyolProductImageInput, TrendyolProductItemInput, TrendyolProductDeleteItem, TrendyolLookupOption, TrendyolCategoryAttributeValue, TrendyolCategoryAttribute, TrendyolPriceInventoryItem, TrendyolBatchResponse, TrendyolBatchStatus, BatchSummary, TrendyolSupplierAddress } from './types.js';

// Constants
// ─────────────────────────────────────────────

function isTrendyolMockEnabled(): boolean {
  return isMarketplaceMockChannelEnabled('trendyol');
}

function isKnownMockCredentials(creds: TrendyolCredentials): boolean {
  if (process.env.NODE_ENV === 'production') return false;

  return (
    creds.sellerId === '12345' &&
    creds.apiKey === 'test-key' &&
    creds.apiSecret === 'test-secret'
  ) || (
    creds.sellerId === 'STORE-001' &&
    creds.apiKey === 'demo-api-key-12345' &&
    creds.apiSecret === 'demo-secret-67890'
  );
}

function getBaseUrl(creds: TrendyolCredentials): string {
  if (isTrendyolMockEnabled() || isKnownMockCredentials(creds)) {
    return 'http://localhost:3099';
  }

  return 'https://apigw.trendyol.com';
}

const INTEGRATOR = 'AxonERP';
const DEFAULT_TIMEOUT_MS = 15_000;
const MAX_RETRIES = 3;
const RATE_WINDOW_MS = 10_000;
const RATE_LIMIT = 48; // 50/10s — 2 buffer
const MASK = '***';

// ─────────────────────────────────────────────
// Types — Credentials
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
type RedisClient = { incr(k: string): Promise<number>; expire(k: string, s: number): Promise<number>; on(event: string, cb: (err: Error) => void): void };
let _redisClient: RedisClient | null = null;

function getRedisClient(): RedisClient | null {
  if (!process.env.REDIS_URL) return null;
  if (_redisClient) return _redisClient;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Redis = require('ioredis') as new (url: string) => RedisClient;
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

export async function trendyolFetch<T>(
  creds: TrendyolCredentials,
  path: string,
  options: RequestInit & { timeoutMs?: number } = {},
): Promise<T> {
  const url = `${getBaseUrl(creds)}${path}`;
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
      const res = await observedFetch(url, {
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

export function readRateLimitSnapshot(): { remaining: number; resetAt: string } {
  const now = Date.now();
  let maxCount = 0;
  let latestReset = now;
  for (const bucket of rateBuckets.values()) {
    if (now - bucket.windowStart < RATE_WINDOW_MS) {
      maxCount = Math.max(maxCount, bucket.count);
      latestReset = Math.max(latestReset, bucket.windowStart + RATE_WINDOW_MS);
    }
  }
  return { remaining: Math.max(0, RATE_LIMIT - maxCount), resetAt: new Date(latestReset).toISOString() };
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
