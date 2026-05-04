import { Context } from 'hono';
import { ForbiddenError } from '../errors/index.js';

/**
 * Hono context içinden tenantId değerini alır.
 * Eğer tenantId yoksa veya string değilse ForbiddenError fırlatır.
 *
 * @param c Hono Context
 * @returns tenantId (string)
 */
export function requireTenantId(c: Context<any>): string {
  const tenantId = c.get('tenantId');
  if (!tenantId || typeof tenantId !== 'string') {
    throw new ForbiddenError('Tenant kimliği bulunamadı.');
  }
  return tenantId;
}
