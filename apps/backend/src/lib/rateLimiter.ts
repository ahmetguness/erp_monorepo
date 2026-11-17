import Redis from 'ioredis';
import { RELEASE_PROTOCOL } from '@repo/types/release';
import { logger } from './logger.js';

const isProduction = process.env.NODE_ENV === 'production';
const redisUrl = process.env.REDIS_URL;

// Production'da REDIS zorunludur.
if (isProduction && !redisUrl) {
  throw new Error('REDIS_URL ortam değişkeni production ortamında zorunludur.');
}

const redis = redisUrl ? new Redis(redisUrl, { connectTimeout: 2_000, commandTimeout: 2_000, maxRetriesPerRequest: 0 }) : null;
let lastRedisWarning = 0;
redis?.on('error', () => {
  if (Date.now() - lastRedisWarning >= 30_000) {
    lastRedisWarning = Date.now();
    logger.warn('[RateLimiter] Redis connection unavailable; protected requests remain fail-closed.');
  }
});

export async function probeRedis(): Promise<void> {
  if (!redis) throw new Error('Redis is not configured.');
  if (await redis.ping() !== 'PONG') throw new Error('Redis readiness failed.');
}
export function closeRateLimiter(): void { redis?.disconnect(); }

/** Heartbeats are isolated by environment and consumer protocol, never by tenant data. */
export async function workerHeartbeat(action: 'touch' | 'remove' | 'check', id = ''): Promise<void> {
  if (!redis) throw new Error('Redis is not configured.');
  const key = `axon:workers:${process.env.DEPLOYMENT_ENV ?? 'development'}:v${RELEASE_PROTOCOL.eventSchema}`;
  const cutoff = Date.now() - 45_000;
  if (action === 'touch') {
    await redis.zadd(key, Date.now(), id);
    await redis.zremrangebyscore(key, '-inf', cutoff);
    await redis.expire(key, 90);
  } else if (action === 'remove') await redis.zrem(key, id);
  else if (await redis.zcount(key, cutoff, '+inf') === 0) throw new Error('No healthy workers.');
}

// Geriye dönük uyumluluk ve dev ortamı için basit in-memory fallback.
const inMemoryStore = new Map<string, { count: number; resetAt: number }>();

export const rateLimiter = {
  /**
   * Belirtilen anahtar (key) için rate limit kontrolü yapar.
   * Limiti aştıysa true, aşmadıysa false döner.
   * @param key Kontrol edilecek anahtar (örn: IP adresi, user ID)
   * @param limit Limit (izin verilen işlem sayısı)
   * @param windowMs Süre penceresi (milisaniye cinsinden)
   * @returns {Promise<boolean>} Limiti aştıysa true
   */
  async check(key: string, limit: number, windowMs: number): Promise<boolean> {
    if (redis) {
      const current = await redis.incr(key);
      if (current === 1) {
        await redis.pexpire(key, windowMs);
      }
      return current > limit;
    }

    // --- In-Memory Fallback ---
    const now = Date.now();
    
    // Cleanup expired entries periodically (simplistic approach for in-memory)
    if (Math.random() < 0.05) {
      for (const [k, v] of inMemoryStore.entries()) {
        if (now > v.resetAt) {
          inMemoryStore.delete(k);
        }
      }
    }

    const entry = inMemoryStore.get(key);
    if (!entry || now > entry.resetAt) {
      inMemoryStore.set(key, { count: 1, resetAt: now + windowMs });
      return false; // Limit aşılmadı
    }

    entry.count++;
    return entry.count > limit;
  },

  /**
   * Belirtilen anahtarın mevcut pencerede blok seviyesine ulaşıp ulaşmadığını
   * sayaç artırmadan kontrol eder.
   */
  async isBlocked(key: string, limit: number): Promise<boolean> {
    if (redis) {
      const current = await redis.get(key);
      return current !== null && Number(current) >= limit;
    }

    const now = Date.now();
    const entry = inMemoryStore.get(key);
    if (!entry) return false;
    if (now > entry.resetAt) {
      inMemoryStore.delete(key);
      return false;
    }
    return entry.count >= limit;
  },

  /**
   * Limiti sıfırlar (başarılı login sonrası vb. durumlarda çağrılabilir).
   * @param key Sıfırlanacak anahtar
   */
  async reset(key: string): Promise<void> {
    if (redis) {
      await redis.del(key);
    } else {
      inMemoryStore.delete(key);
    }
  }
};
