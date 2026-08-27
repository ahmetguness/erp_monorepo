import type { Context } from 'hono';
import type { AccessContext } from '../modules/identity/application/index.js';

const ACCESS_CONTEXT_KEY = 'accessContext';

export function setAccessContext(context: Context, accessContext: AccessContext): void {
  context.set(ACCESS_CONTEXT_KEY, accessContext);
}

export function getAccessContext(context: Context): AccessContext | null {
  const value: unknown = context.get(ACCESS_CONTEXT_KEY);
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Partial<AccessContext>;
  return typeof candidate.userId === 'string' && typeof candidate.tenantId === 'string'
    ? value as AccessContext
    : null;
}
