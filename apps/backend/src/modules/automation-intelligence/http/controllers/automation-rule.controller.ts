import { AuditAction,AutomationAction,AutomationTrigger,EntityType } from '@prisma/client';
import { Context } from 'hono';
import { NotFoundError,ValidationError } from '../../../../errors/index.js';
import { prisma } from '../../../../lib/prisma.js';
import { AutomationRuleService } from '../../../../services/automation-rule.service.js';
import { SchedulerJobEngineService,parseSchedulerJobKey,schedulerJobDefinitions } from '../../../../services/scheduler-job-engine.service.js';
import { createAuditLog,getRequestMeta } from '../../../../utils/audit.js';
import { requireParam,requireTenantId,requireUserId } from '../../../../utils/context.js';
import { toInputJson } from '../../../../utils/json.js';
import { automationGovernancePolicyRepository,previewAutomationAssistantQuery } from '../../composition.js';
import { evaluateAutomationDecision } from '../../application/automation-governance/index.js';

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

function readJsonNumber(value: unknown, key: string): number | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const field = Object.entries(value).find(([entryKey]) => entryKey === key)?.[1];
  const parsed = Number(field);
  return Number.isFinite(parsed) ? parsed : null;
}

async function readBody(c: Context): Promise<Record<string, unknown>> {
  const body = await c.req.json<unknown>().catch(() => null);
  if (typeof body !== 'object' || body === null || Array.isArray(body)) return {};
  return Object.fromEntries(Object.entries(body));
}

export const AutomationRuleController = {
  async getGovernancePolicy(c: Context): Promise<Response> {
    const policy = await automationGovernancePolicyRepository.get(requireTenantId(c));
    return c.json({ data: policy });
  },

  async updateGovernancePolicy(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const body = await readBody(c);
    const approvalThreshold = Number(body.approvalThreshold);
    const minimumAutomaticConfidence = Number(body.minimumAutomaticConfidence);
    if (!Number.isFinite(approvalThreshold) || approvalThreshold < 0 || !Number.isFinite(minimumAutomaticConfidence) || minimumAutomaticConfidence < 0 || minimumAutomaticConfidence > 1) {
      return c.json(new ValidationError('Gecersiz otomasyon guven politikasi.').toJSON(), 400);
    }
    const policy = await automationGovernancePolicyRepository.save(tenantId, { approvalThreshold, minimumAutomaticConfidence });
    return c.json({ data: policy });
  },

  async previewAssistant(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const body = await readBody(c);
    const prompt = readString(body, 'prompt');
    if (!prompt) return c.json(new ValidationError('prompt zorunludur.').toJSON(), 400);
    const preview = await previewAutomationAssistantQuery.execute(tenantId, prompt);
    return c.json({ data: preview });
  },

  async listSchedulerJobs(c: Context): Promise<Response> {
    return c.json({ data: schedulerJobDefinitions() });
  },

  async listSchedulerRuns(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const limit = Number(c.req.query('limit') ?? 30);
    const runs = await new SchedulerJobEngineService(prisma).recentRuns(tenantId, Number.isFinite(limit) ? limit : 30);
    return c.json({ data: runs });
  },

  async runScheduler(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const userId = requireUserId(c);
    const body = await readBody(c);
    const jobKey = parseSchedulerJobKey(readString(body, 'jobKey'));
    if (!jobKey) {
      return c.json(new ValidationError('Gecersiz scheduler job anahtari.').toJSON(), 400);
    }
    const result = await new SchedulerJobEngineService(prisma).run(tenantId, jobKey, userId);
    return c.json({ data: result });
  },

  async listExecutions(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const [executions, policy] = await Promise.all([
      prisma.automationExecution.findMany({
        where: { tenantId },
        include: { rule: { select: { id: true, name: true, conditions: true } } },
        orderBy: { startedAt: 'desc' },
        take: 50,
      }),
      automationGovernancePolicyRepository.get(tenantId),
    ]);
    const data = executions.map((execution) => ({
      ...execution,
      decision: execution.trigger && execution.action
        ? evaluateAutomationDecision({
            tenantId,
            ruleId: execution.ruleId ?? execution.id,
            trigger: execution.trigger,
            action: execution.action,
            reason: execution.rule?.name ? `“${execution.rule.name}” kuralı eşleşti.` : 'Sistem otomasyonu çalıştırıldı.',
            sources: ['Otomasyon çalışma günlüğü', 'Kural koşulları', 'Tenant güven politikası'],
            confidence: 0.9,
            matchedRecords: readJsonNumber(execution.output, 'matched') ?? 0,
            estimatedMonetaryAmount: readJsonNumber(execution.rule?.conditions, 'minAmount'),
            dryRun: false,
          }, policy)
        : null,
    }));
    return c.json({ data });
  },

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
