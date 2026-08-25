import { AuditAction,EntityType } from '@prisma/client';
import { Context } from 'hono';
import { ValidationError } from '../../../../../errors/index.js';
import { prisma } from '../../../../../lib/prisma.js';
import { getValidatedBody } from '../../../../../middleware/validateBody.js';
import {
businessRuleBodySchema,
moduleSettingBodySchema,
tenantSettingBodySchema,
} from '../../../../../schemas/request-body.schemas.js';
import {
DefaultPolicyEngineService
} from '../../../../../services/default-policy-engine.service.js';
import { createAuditLog,getRequestMeta } from '../../../../../utils/audit.js';
import { requireTenantId,requireUserId } from '../../../../../utils/context.js';
import { businessRulesService,INTERNAL_TENANT_SETTING_KEYS,isInternalTenantSettingKey,readDefaultPolicyUpdates,readJsonObject } from './shared.js';

export const generalSettingsController = {
  async defaultPolicySnapshot(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const snapshot = await new DefaultPolicyEngineService(prisma).snapshot(tenantId);
    return c.json({ data: snapshot });
  },
  async updateDefaultPolicies(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const userId = requireUserId(c);
    const body = await readJsonObject(c);
    const updates = readDefaultPolicyUpdates(body);
    const snapshot = await new DefaultPolicyEngineService(prisma).updateMany(tenantId, updates);

    await createAuditLog(prisma, {
      tenantId,
      userId,
      module: 'settings',
      entityType: EntityType.OTHER,
      entityId: 'default_policy_engine',
      action: AuditAction.UPDATE,
      newValues: { updatedKeys: updates.map((update) => update.storageKey) },
      ...getRequestMeta(c),
    });

    return c.json({ data: snapshot });
  },

  // ── Tenant Settings ──────────────────────────
  async listTenantSettings(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);

    const settings = await prisma.tenantSetting.findMany({
      where: {
        tenantId,
        key: { notIn: [...INTERNAL_TENANT_SETTING_KEYS] },
      },
      orderBy: { key: 'asc' },
    });
    return c.json({ data: settings });
  },
  async upsertTenantSetting(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);

    const body = getValidatedBody(c, tenantSettingBodySchema);
    if (!body.key || body.value === undefined) {
      return c.json(new ValidationError('key ve value zorunludur.').toJSON(), 400);
    }
    if (isInternalTenantSettingKey(body.key)) {
      return c.json(new ValidationError('Bu ayar sistem tarafindan yonetilir.').toJSON(), 400);
    }

    const setting = await prisma.tenantSetting.upsert({
      where: { tenantId_key: { tenantId, key: body.key } },
      create: { tenantId, key: body.key, value: body.value },
      update: { value: body.value },
    });

    return c.json({ data: setting });
  },
  async deleteTenantSetting(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const key = c.req.param('key');
    if (isInternalTenantSettingKey(key)) {
      return c.json(new ValidationError('Bu ayar sistem tarafindan yonetilir.').toJSON(), 400);
    }

    await prisma.tenantSetting.deleteMany({ where: { tenantId, key } });
    return c.json({ data: { success: true } });
  },
  async listBusinessRules(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const rules = await businessRulesService.list(tenantId);
    return c.json({ data: rules });
  },
  async upsertBusinessRule(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const body = getValidatedBody(c, businessRuleBodySchema);
    if (!body.key || body.value === undefined) {
      return c.json(new ValidationError('key ve value zorunludur.').toJSON(), 400);
    }

    const rule = await businessRulesService.upsert(tenantId, body.key, body.value);
    return c.json({ data: rule });
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

    const body = getValidatedBody(c, moduleSettingBodySchema);
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
} as const;
