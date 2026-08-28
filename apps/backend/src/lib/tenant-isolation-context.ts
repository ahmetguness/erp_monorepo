import { AsyncLocalStorage } from 'node:async_hooks';
import type { MiddlewareHandler } from 'hono';
import { logger } from './logger.js';

export const TENANT_ISOLATION_BYPASS_REASONS = [
  'public-api',
  'scim-provisioning',
  'bi-connector',
  'customer-portal',
  'auth-bootstrap',
  'admin-console',
  'api-key-bootstrap',
  'domain-event-outbox-worker-stale-processing',
  'domain-event-outbox-worker-due-events',
  'domain-event-outbox-worker-poison-messages',
  'domain-event-outbox-worker-atomic-claim',
  'marketplace-worker-atomic-claim',
] as const;

export type TenantIsolationBypassReason = typeof TENANT_ISOLATION_BYPASS_REASONS[number];

export type TenantIsolationContext =
  | { mode: 'tenant'; tenantId: string }
  | { mode: 'bypass'; reason: TenantIsolationBypassReason };

const tenantIsolationContext = new AsyncLocalStorage<TenantIsolationContext>();

export function runWithTenantScope<T>(tenantId: string, callback: () => Promise<T>): Promise<T> {
  if (!tenantId.trim()) throw new Error('Tenant isolation scope requires a non-empty tenantId.');
  return tenantIsolationContext.run({ mode: 'tenant', tenantId }, callback);
}

export function runWithTenantIsolationBypass<T>(
  reason: TenantIsolationBypassReason,
  callback: () => Promise<T>,
): Promise<T> {
  logger.warn('[TenantIsolation] Explicit bypass entered', { reason });
  return tenantIsolationContext.run({ mode: 'bypass', reason }, callback);
}

export function getTenantIsolationContext(): TenantIsolationContext | undefined {
  return tenantIsolationContext.getStore();
}

export function getTenantIsolationBypassReason(): TenantIsolationBypassReason | null {
  const context = getTenantIsolationContext();
  return context?.mode === 'bypass' ? context.reason : null;
}

export function tenantIsolationBypass(reason: TenantIsolationBypassReason): MiddlewareHandler {
  return async (context, next) => {
    logger.warn('[TenantIsolation] HTTP bypass entered', { reason, method: context.req.method, path: context.req.path });
    return tenantIsolationContext.run({ mode: 'bypass', reason }, next);
  };
}
