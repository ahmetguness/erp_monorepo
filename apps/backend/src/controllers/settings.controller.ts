import { Context } from 'hono';
import { prisma } from '../lib/prisma';
import { ForbiddenError, NotFoundError, ValidationError } from '../errors';
import { requireTenantId } from '../utils/context.js';

// ─────────────────────────────────────────────
// Settings Controller
// TenantSetting + ModuleSetting CRUD
// ─────────────────────────────────────────────

export const SettingsController = {

  // ── Tenant Settings ──────────────────────────

  async listTenantSettings(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);

    const settings = await prisma.tenantSetting.findMany({ where: { tenantId }, orderBy: { key: 'asc' } });
    return c.json({ data: settings });
  },

  async upsertTenantSetting(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);

    const body = await c.req.json<{ key: string; value: string }>();
    if (!body.key || body.value === undefined) {
      return c.json(new ValidationError('key ve value zorunludur.').toJSON(), 400);
    }

    const setting = await prisma.tenantSetting.upsert({
      where: { tenantId_key: { tenantId, key: body.key } },
      create: { tenantId, key: body.key, value: body.value },
      update: { value: body.value },
    });

    return c.json({ data: setting });
  },

  async deleteTenantSetting(c: Context): Promise<Response> {
    const tenantId = c.get('tenantId');
    const key = c.req.param('key');
    if (!tenantId) return c.json(new ForbiddenError('Tenant kimliği bulunamadı.').toJSON(), 403);

    await prisma.tenantSetting.deleteMany({ where: { tenantId, key } });
    return c.json({ data: { success: true } });
  },

  // ── Module Settings ──────────────────────────

  async listModuleSettings(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);

    const module = c.req.query('module');
    const settings = await prisma.moduleSetting.findMany({
      where: { tenantId, ...(module && { module }) },
      orderBy: [{ module: 'asc' }, { key: 'asc' }],
    });
    return c.json({ data: settings });
  },

  async upsertModuleSetting(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);

    const body = await c.req.json<{ module: string; key: string; value: string }>();
    if (!body.module || !body.key || body.value === undefined) {
      return c.json(new ValidationError('module, key ve value zorunludur.').toJSON(), 400);
    }

    const setting = await prisma.moduleSetting.upsert({
      where: { tenantId_module_key: { tenantId, module: body.module, key: body.key } },
      create: { tenantId, module: body.module, key: body.key, value: body.value },
      update: { value: body.value },
    });

    return c.json({ data: setting });
  },
};
