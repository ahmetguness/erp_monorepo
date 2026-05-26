import { Context, Next } from 'hono';
import { rateLimiter } from '../lib/rateLimiter';

const DEFAULT_LIMIT = 300;
const DEFAULT_WINDOW_MS = 60_000;
const WRITE_LIMIT = 120;
const WRITE_WINDOW_MS = 60_000;
const EXCLUDED_PATH_PREFIXES = ['/health'];

function readPositiveInt(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function getClientIp(c: Context): string {
  const forwarded = c.req.header('x-forwarded-for')?.split(',')[0]?.trim();
  return forwarded || c.req.header('x-real-ip')?.trim() || 'unknown';
}

function isWriteMethod(method: string): boolean {
  return method === 'POST' || method === 'PUT' || method === 'PATCH' || method === 'DELETE';
}

export async function globalRateLimit(c: Context, next: Next): Promise<Response | void> {
  if (EXCLUDED_PATH_PREFIXES.some((prefix) => c.req.path.startsWith(prefix))) {
    await next();
    return;
  }

  const ip = getClientIp(c);
  const pathGroup = c.req.path.startsWith('/api/public') ? 'public' : c.req.path.startsWith('/api/admin') ? 'admin' : 'api';
  const limit = readPositiveInt(process.env.GLOBAL_RATE_LIMIT_PER_MINUTE, DEFAULT_LIMIT);
  const exceeded = await rateLimiter.check(`global:${pathGroup}:${ip}`, limit, DEFAULT_WINDOW_MS);
  if (exceeded) {
    return c.json({ error: { code: 'RATE_LIMITED', message: 'Cok fazla istek. Lutfen biraz sonra tekrar deneyin.' } }, 429);
  }

  if (isWriteMethod(c.req.method)) {
    const writeLimit = readPositiveInt(process.env.GLOBAL_WRITE_RATE_LIMIT_PER_MINUTE, WRITE_LIMIT);
    const writeExceeded = await rateLimiter.check(`global_write:${pathGroup}:${ip}`, writeLimit, WRITE_WINDOW_MS);
    if (writeExceeded) {
      return c.json({ error: { code: 'RATE_LIMITED', message: 'Cok fazla yazma istegi. Lutfen biraz sonra tekrar deneyin.' } }, 429);
    }
  }

  await next();
}
