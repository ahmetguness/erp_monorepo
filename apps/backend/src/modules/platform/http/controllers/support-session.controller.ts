import type { Context } from 'hono';
import { requireParam } from '../../../../utils/context.js';
import { assertTenantOwner, decideSupportSession, listSupportSessions } from '../../support-sessions/support-session.service.js';
import { supportDecisionSchema } from '../../support-sessions/support-session.schemas.js';

export const SupportSessionController = {
  async list(c: Context): Promise<Response> {
    await assertTenantOwner(c.get('tenantId'), c.get('userId'));
    return c.json({ data: await listSupportSessions(c.get('tenantId')) });
  },
  async decide(c: Context): Promise<Response> {
    const input = supportDecisionSchema.safeParse(await c.req.json<unknown>().catch(() => null));
    if (!input.success) return c.json({ error: 'Geçersiz destek kararı.' }, 400);
    await decideSupportSession(c.get('tenantId'), requireParam(c, 'id'), c.get('userId'), input.data.action);
    return c.json({ data: { success: true } });
  },
};
