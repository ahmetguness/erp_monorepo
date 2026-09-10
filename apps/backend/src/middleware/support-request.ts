import type { Context, Next } from 'hono';
import type { AdminPermission } from '@repo/types';
import { prisma } from '../lib/prisma.js';
import { requireAdmin, requireRecentAdminMfa } from './requireAdmin.js';
import { assertTenantOwner, resolveSupportSession, supportContactNoteSchema, supportRouteAllowed } from '../modules/platform/application/index.js';

type AuthenticateTarget = (c: Context, next: Next, target: { userId: string; tenantId: string }) => Promise<Response | void>;

/** A support ID is not a credential: the original live admin session is mandatory. */
export async function runSupportRequest(c: Context, next: Next, authenticate: AuthenticateTarget): Promise<Response | void> {
  return requireAdmin(c, async () => {
    const permissions: AdminPermission[] = c.get('adminPermissions') ?? [];
    if (!permissions.includes('support-session.manage')) {
      c.res = c.json({ error: 'Destek erişimi yetkisi gerekli.' }, 403); return;
    }
    const session = await resolveSupportSession(
      c.req.header('X-Support-Tenant') ?? '', c.req.header('X-Support-Session') ?? '',
      c.get('adminId'), c.get('adminSessionId'),
    );
    const write = !['GET', 'HEAD', 'OPTIONS'].includes(c.req.method);
    if (write && session.writeApprovedById) await assertTenantOwner(session.tenantId, session.writeApprovedById);
    const allowed = supportRouteAllowed(session.scopes, c.req.method, c.req.path, Boolean(session.writeApprovedAt && session.writeApprovedById));
    // Record the attempt before executing it; no audit persistence means no data access.
    const audit = await prisma.auditLog.create({ data: {
      tenantId: session.tenantId, adminId: session.adminId, userId: session.targetUserId,
      module: 'SUPPORT_SESSION', entityType: 'OTHER', entityId: session.id, action: 'OTHER',
      reason: session.reason, ticketId: session.ticketId,
      newValues: { event: allowed ? 'ACCESS_ATTEMPT' : 'SCOPE_DENIED', method: c.req.method, path: c.req.path },
    } });
    if (!allowed) { c.res = c.json({ error: 'Bu işlem destek oturumu kapsamı dışında veya salt okunur.' }, 403); return; }
    const execute = async () => {
      if (write && !supportContactNoteSchema.safeParse(await c.req.json<unknown>().catch(() => null)).success) {
        c.res = c.json({ error: 'Destek yazma kapsamı yalnızca cari notudur.' }, 403); return;
      }
      c.set('supportSessionId', session.id);
      c.set('supportAudit', { adminId: session.adminId, reason: session.reason, ticketId: session.ticketId });
      c.header('Cache-Control', 'no-store');
      const response = await authenticate(c, next, { userId: session.targetUserId, tenantId: session.tenantId });
      if (response) c.res = response;
    };
    let failed = false;
    try {
      if (write) {
        const response = await requireRecentAdminMfa(c, execute);
        if (response) c.res = response;
      } else await execute();
    } catch (error: unknown) {
      failed = true;
      throw error;
    } finally {
      const status = failed || c.error ? 500 : c.res.status;
      await prisma.auditLog.create({ data: {
        tenantId: session.tenantId, adminId: session.adminId, userId: session.targetUserId,
        module: 'SUPPORT_SESSION', entityType: 'OTHER', entityId: session.id, action: 'OTHER',
        reason: session.reason, ticketId: session.ticketId,
        newValues: { event: status >= 500 ? 'ACCESS_ERROR' : status >= 400 ? 'ACCESS_DENIED' : 'ACCESS_COMPLETED', attemptId: audit.id, method: c.req.method, path: c.req.path, status },
      } });
    }
  });
}
