import { Context, Next } from 'hono';
import { logger } from '../lib/logger';

/**
 * CSRF koruması — Origin / Referer doğrulaması.
 *
 * Cookie tabanlı auth kullanıldığında, state-changing isteklerde (POST, PATCH, PUT, DELETE)
 * tarayıcının gönderdiği Origin veya Referer header'ı ALLOWED_ORIGINS listesiyle karşılaştırılır.
 *
 * Bypass koşulları:
 *  - Safe method (GET, HEAD, OPTIONS)
 *  - x-api-key header'ı olan istekler (external API — cookie kullanmaz)
 */

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

function getAllowedOrigins(): string[] {
  return (process.env.ALLOWED_ORIGINS || 'http://localhost:3000')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function isOriginAllowed(requestOrigin: string): boolean {
  const allowedOrigins = getAllowedOrigins();
  if (allowedOrigins.includes(requestOrigin)) return true;
  if (process.env.NODE_ENV !== 'production' && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(requestOrigin)) {
    return true;
  }
  return false;
}

function extractOrigin(headerValue: string): string | null {
  try {
    const url = new URL(headerValue);
    return url.origin;
  } catch {
    return null;
  }
}

export async function csrfProtection(c: Context, next: Next): Promise<Response | void> {
  // Safe methods don't change state — skip
  if (SAFE_METHODS.has(c.req.method)) {
    return next();
  }

  // External API requests use API key, not cookies — skip
  if (c.req.header('x-api-key')) {
    return next();
  }

  const origin = c.req.header('origin');
  const referer = c.req.header('referer');

  // Server-to-server requests (no Origin/Referer) are blocked for cookie-based auth.
  // If they need access, they should use x-api-key.
  const requestOrigin = origin ?? (referer ? extractOrigin(referer) : null);

  if (!requestOrigin) {
    logger.warn(`[CSRF] Blocked request without Origin/Referer: ${c.req.method} ${c.req.path}`);
    return c.json(
      { error: { code: 'CSRF_ERROR', message: 'Origin header gereklidir.' } },
      403,
    );
  }

  if (!isOriginAllowed(requestOrigin)) {
    logger.warn(`[CSRF] Blocked request from disallowed origin: ${requestOrigin} → ${c.req.method} ${c.req.path}`);
    return c.json(
      { error: { code: 'CSRF_ERROR', message: 'Bu origin\'den istek yapılamaz.' } },
      403,
    );
  }

  return next();
}
