import { prisma } from '../../../lib/prisma.js';
import { ForbiddenError } from '../../../errors/index.js';
import { assertTenantOwner } from './support-session.service.js';

export async function resolveSupportSession(tenantId: string, id: string, adminId: string, adminSessionId: string) {
  const session = await prisma.supportSession.findFirst({ where: {
    id, tenantId, adminId, adminSessionId, approvedAt: { not: null },
    revokedAt: null, expiresAt: { gt: new Date() },
    tenant: { deletedAt: null, status: { in: ['ACTIVE', 'TRIAL'] } },
  } });
  if (!session?.approvedById) throw new ForbiddenError('Destek oturumu onaysız, süresi dolmuş veya sonlandırılmış.');
  await assertTenantOwner(tenantId, session.approvedById);
  return session;
}

/** Exact route allowlist: exports, auth, settings and arbitrary actions are never exposed. */
export function supportRouteAllowed(scopes: readonly string[], method: string, path: string, writeApproved: boolean): boolean {
  if (method === 'GET') {
    if (scopes.includes('PRODUCTS') && path === '/api/products') return true;
    if (scopes.includes('CONTACTS') && path === '/api/contacts') return true;
  }
  return writeApproved && scopes.includes('CONTACTS') && method === 'PATCH' && /^\/api\/contacts\/[a-zA-Z0-9_-]+$/.test(path);
}
