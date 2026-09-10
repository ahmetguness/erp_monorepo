import type { Context } from 'hono';
import { requireParam } from '../../../../../utils/context.js';
import { getTenantLifecycle, requestTenantLifecycle, decideTenantLifecycle } from '../../../tenant-lifecycle/tenant-lifecycle.service.js';
import { lifecycleDecisionSchema, lifecycleInputSchema } from '../../../tenant-lifecycle/tenant-lifecycle.schemas.js';
import { createLifecycleExport } from '../../../tenant-lifecycle/tenant-lifecycle-export.service.js';

export const AdminTenantLifecycleController = {
  async get(c: Context): Promise<Response> {
    c.header('Cache-Control', 'no-store');
    return c.json({ data: await getTenantLifecycle(requireParam(c, 'id')) });
  },
  async request(c: Context): Promise<Response> {
    const input = lifecycleInputSchema.safeParse(await c.req.json<unknown>().catch(() => null));
    if (!input.success) return c.json({ error: 'Geçerli hedef, gerekçe, etki ve ticket bilgileri zorunlu.' }, 400);
    await requestTenantLifecycle(requireParam(c, 'id'), c.get('adminId'), input.data);
    return c.json({ data: { success: true } }, 202);
  },
  async decide(c: Context): Promise<Response> {
    const input = lifecycleDecisionSchema.safeParse(await c.req.json<unknown>().catch(() => null));
    if (!input.success) return c.json({ error: 'Geçersiz karar.' }, 400);
    await decideTenantLifecycle(requireParam(c, 'id'), requireParam(c, 'requestId'), c.get('adminId'), input.data.decision);
    return c.json({ data: { success: true } });
  },
  async export(c: Context): Promise<Response> {
    c.header('Cache-Control', 'no-store');
    return c.json({ data: await createLifecycleExport(requireParam(c, 'id'), c.get('adminId')) });
  },
};
