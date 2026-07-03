import { Context, Next } from 'hono';
import { deleteCookie, getCookie } from 'hono/cookie';
import jwt from 'jsonwebtoken';
import type { JwtPayload as JsonWebTokenPayload } from 'jsonwebtoken';
import { ForbiddenError } from '../errors';
import { prisma } from '../lib/prisma';
import { touchSecuritySession } from '../services/security-hardening.service.js';
import { getTrustedClientIp, isIpv4InCidr } from '../utils/request-ip.js';

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
  const auth = c.req.header('Authorization');
  const cookieToken = getCookie(c, 'axon_token');
  const token = auth?.startsWith('Bearer ') ? auth.slice(7) : cookieToken;

  if (!token) {
    return c.json(new ForbiddenError('Yetkilendirme gerekli.').toJSON(), 401);
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    if (!isJwtPayload(payload)) {
      throw new Error('Invalid auth payload');
    }

    c.set('userId', payload.userId);
    c.set('tenantId', payload.tenantId);

    // Enterprise Plan IP Restriction Check
    const tenant = await prisma.tenant.findUnique({
      where: { id: payload.tenantId },
      select: { plan: true },
    });

    if (tenant?.plan === 'ENTERPRISE') {
      const ipSettings = await prisma.tenantSetting.findMany({
        where: {
          tenantId: payload.tenantId,
          key: { in: ['security.ip_restriction.enabled', 'security.ip_whitelist'] },
        },
      });
      const settingsMap = new Map(ipSettings.map((s) => [s.key, s.value]));

      if (settingsMap.get('security.ip_restriction.enabled') === 'true') {
        const whitelist = settingsMap.get('security.ip_whitelist') || '';
        const allowedIps = whitelist.split(',').map((ip) => ip.trim()).filter(Boolean);
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
    }

    if (payload.sessionId) {
      const sessionStatus = await touchSecuritySession(prisma, payload.tenantId, payload.sessionId);
      if (sessionStatus !== 'ACTIVE') {
        throw new Error('Revoked auth session');
      }
      c.set('sessionId', payload.sessionId);
    }

    await next();
  } catch {
    deleteCookie(c, 'axon_token', {
      path: '/',
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'Lax',
    });
    return c.json(new ForbiddenError('Geçersiz veya süresi dolmuş token.').toJSON(), 401);
  }
}
