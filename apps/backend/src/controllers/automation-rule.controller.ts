import { Context } from 'hono';
import { AuditAction, AutomationAction, AutomationTrigger, EntityType } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { NotFoundError, ValidationError } from '../errors';
import { AutomationRuleService } from '../services/automation-rule.service.js';
import { requireTenantId, requireUserId, requireParam } from '../utils/context.js';
import { createAuditLog, getRequestMeta } from '../utils/audit.js';
import { toInputJson } from '../utils/json.js';

const TRIGGERS: readonly AutomationTrigger[] = Object.values(AutomationTrigger);
const ACTIONS: readonly AutomationAction[] = Object.values(AutomationAction);

function isTrigger(value: unknown): value is AutomationTrigger {
  return typeof value === 'string' && TRIGGERS.includes(value as AutomationTrigger);
}

function isAction(value: unknown): value is AutomationAction {
  return typeof value === 'string' && ACTIONS.includes(value as AutomationAction);
}

function readString(body: Record<string, unknown>, key: string): string | undefined {
  const value = body[key];
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function readBoolean(body: Record<string, unknown>, key: string): boolean | undefined {
  const value = body[key];
  return typeof value === 'boolean' ? value : undefined;
}

async function readBody(c: Context): Promise<Record<string, unknown>> {
  const body = await c.req.json<unknown>().catch(() => null);
  if (typeof body !== 'object' || body === null || Array.isArray(body)) return {};
  return Object.fromEntries(Object.entries(body));
}

export const AutomationRuleController = {
  async list(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const rules = await prisma.automationRule.findMany({
      where: { tenantId, deletedAt: null },
      orderBy: [{ isActive: 'desc' }, { createdAt: 'desc' }],
    });
    return c.json({ data: rules });
  },

  async create(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const userId = requireUserId(c);
    const body = await readBody(c);
    const name = readString(body, 'name');
    const module = readString(body, 'module');
    const trigger = body.trigger;
    const action = body.action;

    if (!name || !module || !isTrigger(trigger) || !isAction(action)) {
      return c.json(new ValidationError('name, module, trigger ve action zorunludur.').toJSON(), 400);
    }

    const rule = await prisma.automationRule.create({
      data: {
        tenantId,
        name,
        module,
        trigger,
        action,
        description: readString(body, 'description') ?? null,
        conditions: toInputJson(body.conditions),
        actionConfig: toInputJson(body.actionConfig),
        isActive: readBoolean(body, 'isActive') ?? true,
        createdById: userId,
      },
    });

    await createAuditLog(prisma, {
      tenantId,
      userId,
      module: 'automation',
      entityType: EntityType.OTHER,
      entityId: rule.id,
      action: AuditAction.CREATE,
      newValues: { id: rule.id, name: rule.name, trigger: rule.trigger, ruleAction: rule.action },
      ...getRequestMeta(c),
    });

    return c.json({ data: rule }, 201);
  },

  async update(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const userId = requireUserId(c);
    const id = requireParam(c, 'id');
    const existing = await prisma.automationRule.findFirst({ where: { id, tenantId, deletedAt: null } });
    if (!existing) return c.json(new NotFoundError('Otomasyon kurali', id).toJSON(), 404);

    const body = await readBody(c);
    const trigger = body.trigger;
    const actionValue = body.action;
    if (trigger !== undefined && !isTrigger(trigger)) return c.json(new ValidationError('Gecersiz trigger.').toJSON(), 400);
    if (actionValue !== undefined && !isAction(actionValue)) return c.json(new ValidationError('Gecersiz action.').toJSON(), 400);

    const updated = await prisma.automationRule.update({
      where: { id },
      data: {
        ...(readString(body, 'name') !== undefined && { name: readString(body, 'name') }),
        ...(readString(body, 'description') !== undefined && { description: readString(body, 'description') }),
        ...(readString(body, 'module') !== undefined && { module: readString(body, 'module') }),
        ...(trigger !== undefined && { trigger }),
        ...(actionValue !== undefined && { action: actionValue }),
        ...(body.conditions !== undefined && { conditions: toInputJson(body.conditions) }),
        ...(body.actionConfig !== undefined && { actionConfig: toInputJson(body.actionConfig) }),
        ...(readBoolean(body, 'isActive') !== undefined && { isActive: readBoolean(body, 'isActive') }),
        updatedById: userId,
      },
    });

    await createAuditLog(prisma, {
      tenantId,
      userId,
      module: 'automation',
      entityType: EntityType.OTHER,
      entityId: id,
      action: AuditAction.UPDATE,
      oldValues: { id: existing.id, name: existing.name, trigger: existing.trigger, ruleAction: existing.action, isActive: existing.isActive },
      newValues: { id: updated.id, name: updated.name, trigger: updated.trigger, ruleAction: updated.action, isActive: updated.isActive },
      ...getRequestMeta(c),
    });

    return c.json({ data: updated });
  },

  async run(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const id = requireParam(c, 'id');
    const rule = await prisma.automationRule.findFirst({ where: { id, tenantId, deletedAt: null } });
    if (!rule) return c.json(new NotFoundError('Otomasyon kurali', id).toJSON(), 404);
    const result = await AutomationRuleService.runRule(rule);
    return c.json({ data: result });
  },

  async runActive(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const result = await AutomationRuleService.runActiveRules(tenantId);
    return c.json({ data: result });
  },

  async remove(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const userId = requireUserId(c);
    const id = requireParam(c, 'id');
    const existing = await prisma.automationRule.findFirst({ where: { id, tenantId, deletedAt: null } });
    if (!existing) return c.json(new NotFoundError('Otomasyon kurali', id).toJSON(), 404);
    await prisma.automationRule.update({ where: { id }, data: { deletedAt: new Date(), isActive: false, updatedById: userId } });
    return c.json({ data: { success: true } });
  },
};
