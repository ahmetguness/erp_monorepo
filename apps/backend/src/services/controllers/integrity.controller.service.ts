import { Context } from 'hono';
import { prisma } from '../../lib/prisma.js';
import { requireTenantId, requireUserId, requireParam } from '../../utils/context.js';
import { IntegrityAutomationService } from '../integrity-automation.service.js';

const integrityService = new IntegrityAutomationService(prisma);

export const IntegrityController = {
  async runScan(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const body = await c.req.json<{ autoFix?: boolean }>().catch(() => ({ autoFix: true }));

    const data = await integrityService.runIntegrityCheck(tenantId, { autoFix: body.autoFix ?? true });
    return c.json({ data });
  },

  async resolveException(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const userId = requireUserId(c);
    const id = requireParam(c, 'id');
    const body = await c.req.json<{ notes?: string }>().catch(() => ({ notes: '' }));

    const result = await integrityService.resolveExceptionItem(tenantId, userId, id, body.notes || 'Manuel İnceleme Tamamlandı.');
    return c.json({ data: result });
  },
};
