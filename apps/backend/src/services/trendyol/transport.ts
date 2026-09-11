/**
 * Trendyol Partner API — Production-grade Integration Service
 */

import { logger } from '../../lib/logger';
import { isMarketplaceMockChannelEnabled } from '../../config/env';
import { observedFetch } from '../../modules/shared/index.js';
import type { TrendyolCredentials } from './types.js';

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

function maskResponseBody(body: string): string {
  return body
    .replace(/"phone"\s*:\s*"[^"]+"/g, '"phone":"***"')
    .replace(/"email"\s*:\s*"[^"]+"/g, '"email":"***"')
    .replace(/"identityNumber"\s*:\s*"[^"]+"/g, '"identityNumber":"***"')
    .replace(/"taxNumber"\s*:\s*"[^"]+"/g, '"taxNumber":"***"')
    .replace(/"apiKey"\s*:\s*"[^"]+"/g, '"apiKey":"***"')
    .replace(/"apiSecret"\s*:\s*"[^"]+"/g, '"apiSecret":"***"');
}

interface RateBucket { count: number; windowStart: number }
const rateBuckets = new Map<string, RateBucket>();

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
      _redisClient = null;
    });
    return _redisClient;
  } catch {
    return null;
  }
}

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

async function waitRateLimitRedis(endpoint: string): Promise<void> {
  const redis = getRedisClient();
  if (!redis) {
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

function computeBackoff(attempt: number, retryAfterHeader: string | null): number {
  if (retryAfterHeader) {
    const seconds = parseInt(retryAfterHeader, 10);
    if (!isNaN(seconds) && seconds > 0) return seconds * 1000;
  }
  return Math.min(1000 * Math.pow(2, attempt - 1), 8_000);
}

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
    await waitRateLimit(path);

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
