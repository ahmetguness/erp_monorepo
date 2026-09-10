import { Context, Next } from 'hono';
import { deleteCookie, getCookie } from 'hono/cookie';
import jwt from 'jsonwebtoken';
import type { JwtPayload as JsonWebTokenPayload } from 'jsonwebtoken';
import { ForbiddenError } from '../errors';
import { prisma } from '../lib/prisma';
import { touchSecuritySession } from '../services/security-hardening.service.js';
import { isSecureCookieEnabled } from '../lib/cookie-config.js';
import { getTrustedClientIp, isIpv4InCidr } from '../utils/request-ip.js';
import { runWithTenantScope } from '../lib/tenant-isolation-context.js';
import { resolveAccessContext } from '../modules/identity/index.js';
import { recordAuthorizationResolution } from '../services/observability.service.js';
import { setAccessContext } from './access-context.js';
import { runSupportRequest } from './support-request.js';

const JWT_SECRET = process.env.JWT_SECRET as string;
if (!JWT_SECRET) throw new Error('JWT_SECRET ortam değişkeni tanımlı değil. Uygulama başlatılamaz.');

interface JwtPayload {
  userId: string;
  tenantId: string;
  sessionId?: string;
}

function isJwtPayload(value: string | JsonWebTokenPayload): value is JwtPayload {
  return typeof value !== 'string' &&
    typeof value.userId === 'string' &&
    typeof value.tenantId === 'string';
}

/**
 * JWT doğrulama middleware'i.
 * Authorization header'dan token okur, doğrular ve userId + tenantId'yi context'e set eder.
 * tenantId her zaman JWT payload'dan alınır — header override yapılamaz.
 */
export async function requireAuth(c: Context, next: Next) {
  if (c.req.header('X-Support-Session') !== undefined || c.req.header('X-Support-Tenant') !== undefined) {
    return runSupportRequest(c, next, authenticateTenantRequest);
  }
  const auth = c.req.header('Authorization');
  const cookieToken = getCookie(c, 'axon_token');
  const token = auth?.startsWith('Bearer ') ? auth.slice(7) : cookieToken;

  if (!token) {
    return c.json(new ForbiddenError('Yetkilendirme gerekli.').toJSON(), 401);
  }

  let payload: JwtPayload;
  try {
    const verifiedPayload = jwt.verify(token, JWT_SECRET);
    if (!isJwtPayload(verifiedPayload)) {
      throw new Error('Invalid auth payload');
    }
    payload = verifiedPayload;
  } catch {
    deleteCookie(c, 'axon_token', {
      path: '/',
      secure: isSecureCookieEnabled(),
      sameSite: 'Lax',
    });
    return c.json(new ForbiddenError('Geçersiz veya süresi dolmuş token.').toJSON(), 401);
  }

  return authenticateTenantRequest(c, next, payload);
}

async function authenticateTenantRequest(c: Context, next: Next, payload: JwtPayload): Promise<Response | void> {
  return runWithTenantScope(payload.tenantId, async () => {
    c.set('userId', payload.userId);
    c.set('tenantId', payload.tenantId);

    const startedAt = performance.now();
    const resolution = await resolveAccessContext(prisma, payload.userId, payload.tenantId);
    recordAuthorizationResolution({
      durationMs: performance.now() - startedAt,
      queryCount: resolution.queryCount,
      outcome: resolution.context ? 'allowed' : 'denied',
    });
    const accessContext = resolution.context;
    if (!accessContext) {
      return c.json(new ForbiddenError('Bu tenant\'a erisiminiz yok.').toJSON(), 403);
    }
    setAccessContext(c, accessContext);
    c.set('tenantPlan', accessContext.tenant.plan);

    if (accessContext.tenant.plan === 'ENTERPRISE' && accessContext.security.ipRestrictionEnabled) {
        const allowedIps = accessContext.security.ipWhitelist;
        if (allowedIps.length > 0) {
          const clientIp = getTrustedClientIp(c);
          const isAllowed = allowedIps.some((ipOrCidr) => {
            if (ipOrCidr.includes('/')) {
              return isIpv4InCidr(clientIp, ipOrCidr);
            }
            return clientIp === ipOrCidr;
          });

          if (!isAllowed) {
            return c.json(new ForbiddenError('IP adresiniz bu isletme icin erisime kapatilmistir.').toJSON(), 403);
          }
        }
    }

    if (payload.sessionId) {
      const sessionStatus = await touchSecuritySession(prisma, payload.tenantId, payload.sessionId);
      if (sessionStatus !== 'ACTIVE') {
        deleteCookie(c, 'axon_token', {
          path: '/',
          secure: isSecureCookieEnabled(),
          sameSite: 'Lax',
        });
        return c.json(new ForbiddenError('Geçersiz veya süresi dolmuş token.').toJSON(), 401);
      }
      c.set('sessionId', payload.sessionId);
    }

    await next();
  });
}
