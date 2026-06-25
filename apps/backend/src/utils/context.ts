import type { Context } from 'hono';
import { ForbiddenError, ValidationError } from '../errors/index.js';

export function requireTenantId(c: Context): string {
  const tenantId = c.get('tenantId') as string | undefined;
  if (!tenantId || typeof tenantId !== 'string') {
    throw new ForbiddenError('Tenant kimligi bulunamadi.');
  }
  return tenantId;
}

export function requireUserId(c: Context): string {
  const userId = c.get('userId') as string | undefined;
  if (!userId || typeof userId !== 'string') {
    throw new ForbiddenError('Kullanici kimligi bulunamadi.');
  }
  return userId;
}

export function requireParam(c: Context, name: string): string {
  const value = c.req.param(name);
  if (!value) {
    throw new ValidationError(`${name} parametresi zorunludur.`);
  }
  return value;
}