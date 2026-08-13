import { AsyncLocalStorage } from 'async_hooks';
import type { MiddlewareHandler } from 'hono';

interface TenantIsolationContext {
  bypassReason: string | null;
}

const tenantIsolationContext = new AsyncLocalStorage<TenantIsolationContext>();

export function runWithTenantIsolationBypass<T>(reason: string, callback: () => Promise<T>): Promise<T> {
  return tenantIsolationContext.run({ bypassReason: reason }, callback);
}

export function getTenantIsolationBypassReason(): string | null {
  return tenantIsolationContext.getStore()?.bypassReason ?? null;
}

export function tenantIsolationBypass(reason: string): MiddlewareHandler {
  return async (_c, next) => runWithTenantIsolationBypass(reason, next);
}
