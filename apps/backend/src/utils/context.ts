import type { Context } from 'hono';
import { ForbiddenError } from '../errors/index.js';

/**
 * Hono context içinden tenantId değerini alır.
 * Eğer tenantId yoksa veya string değilse ForbiddenError fırlatır.
 * requireAuth middleware'i çalıştıktan sonra her zaman string olmalıdır.
 */
export function requireTenantId(c: Context): string {
  const tenantId = c.get('tenantId') as string | undefined;
  if (!tenantId || typeof tenantId !== 'string') {
    throw new ForbiddenError('Tenant kimliği bulunamadı.');
  }
  return tenantId;
}

/**
 * Hono context içinden userId değerini alır.
 * Eğer userId yoksa veya string değilse ForbiddenError fırlatır.
 */
export function requireUserId(c: Context): string {
  const userId = c.get('userId') as string | undefined;
  if (!userId || typeof userId !== 'string') {
    throw new ForbiddenError('Kullanıcı kimliği bulunamadı.');
  }
  return userId;
}
