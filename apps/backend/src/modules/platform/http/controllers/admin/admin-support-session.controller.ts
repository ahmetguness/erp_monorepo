import type { Context } from 'hono';
import { requireParam } from '../../../../../utils/context.js';
import { createSupportSessionSchema } from '../../../support-sessions/support-session.schemas.js';
import { listSupportSessions, requestSupportSession, revokeAdminSupportSession } from '../../../support-sessions/support-session.service.js';
import { prisma } from '../../../../../lib/prisma.js';

export const AdminSupportSessionController = {
  async targets(c: Context): Promise<Response> {
    const tenantId = requireParam(c, 'id');
    const users = await prisma.tenantUser.findMany({ where: {
      tenantId, isActive: true, user: { isActive: true, deletedAt: null }, tenant: { deletedAt: null },
    }, orderBy: { userId: 'asc' }, take: 200, select: { user: { select: { id: true, name: true, email: true } } } });
    return c.json({ data: users.map(row => row.user) });
  },
  async list(c: Context): Promise<Response> {
    return c.json({ data: await listSupportSessions(requireParam(c, 'id'), c.get('adminId')) });
  },
  async request(c: Context): Promise<Response> {
    const input = createSupportSessionSchema.safeParse(await c.req.json<unknown>().catch(() => null));
    if (!input.success) return c.json({ error: 'Hedef, gerekçe, talep numarası, kapsam ve 5–60 dakika süre zorunlu.' }, 400);
    await requestSupportSession(c.get('adminId'), c.get('adminSessionId'), input.data);
    return c.json({ data: { success: true } }, 201);
  },
  async revoke(c: Context): Promise<Response> {
    await revokeAdminSupportSession(requireParam(c, 'id'), requireParam(c, 'sessionId'), c.get('adminId'));
    return c.json({ data: { success: true } });
  },
};
