import type { Context } from 'hono';
import type { TenantStatus } from '@prisma/client';
import { TenantInactiveError } from '../errors';

export const TENANT_INACTIVE_HTTP_STATUS = 403 as const;

export interface TenantStatusView {
  status: TenantStatus;
}

export function isTenantOperational(status: TenantStatus): boolean {
  return status === 'ACTIVE' || status === 'TRIAL';
}

export function getTenantStatusError(tenant: TenantStatusView): TenantInactiveError | null {
  return isTenantOperational(tenant.status) ? null : new TenantInactiveError(tenant.status);
}

export function rejectInactiveTenant(c: Context, tenant: TenantStatusView): Response | null {
  const error = getTenantStatusError(tenant);
  return error ? c.json(error.toJSON(), TENANT_INACTIVE_HTTP_STATUS) : null;
}
