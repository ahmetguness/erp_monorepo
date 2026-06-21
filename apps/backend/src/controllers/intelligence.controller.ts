import { Context } from 'hono';
import { AiPermissionCheckResult, AiRequestStatus, AiRequestType, AuditAction, EntityType, PermissionAction } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { ForbiddenError, NotFoundError, ValidationError } from '../errors';
import { IntelligenceService, type PermissionView } from '../services/intelligence.service.js';
import { requireTenantId, requireUserId } from '../utils/context.js';
import { createAuditLog, getRequestMeta } from '../utils/audit.js';
import { listAiRequestLogs, recordAiRequestLog } from '../services/ai-governance.service';
import {
  getAiGovernancePolicy,
  setAiGovernancePolicy,
  type AiDataSharingPolicy,
} from '../services/ai/policy.service.js';
import { getAiRedactionRegistry } from '../services/ai/redaction-registry.js';

async function getPermissionView(tenantId: string, userId: string): Promise<PermissionView | null> {
  const tenantUser = await prisma.tenantUser.findFirst({
    where: { tenantId, userId, isActive: true },
    select: {
      isOwner: true,
      roleRef: { select: { permissions: { select: { module: true, action: true } } } },
    },
  });

  if (!tenantUser) return null;
  return {
    isOwner: tenantUser.isOwner,
    modules: tenantUser.roleRef?.permissions.map((permission) => ({
      module: permission.module,
      action: permission.action,
    })) ?? [],
  };
}

function canRead(permissions: PermissionView, module: string): boolean {
  return permissions.isOwner || permissions.modules.some((permission) => permission.module === module && permission.action === PermissionAction.READ);
}

function canCreate(permissions: PermissionView, module: string): boolean {
  return permissions.isOwner || permissions.modules.some((permission) => permission.module === module && permission.action === PermissionAction.CREATE);
}

function canRecordAiActionAudit(permissions: PermissionView, module: string, actionType: string): boolean {
  if (permissions.isOwner) return true;
  if (actionType === 'mail') return canCreate(permissions, 'mail') && canRead(permissions, module);
  return canRead(permissions, module);
}

function parsePositiveInt(value: string | undefined, fallback: number, max: number): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) return fallback;
  return Math.min(parsed, max);
}

function parseAiRequestType(value: string | undefined): AiRequestType | undefined {
  if (!value) return undefined;
  return Object.values(AiRequestType).find((item) => item === value);
}

function parseAiRequestStatus(value: string | undefined): AiRequestStatus | undefined {
  if (!value) return undefined;
  return Object.values(AiRequestStatus).find((item) => item === value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseBoolean(value: unknown): boolean | null {
  return typeof value === 'boolean' ? value : null;
}

function parseDataSharingPolicy(value: unknown): AiDataSharingPolicy | null {
  if (value === 'BUSINESS_CONTEXT' || value === 'NO_ENTITY_CONTEXT') return value;
  return null;
}

function parseString(value: unknown, maxLength: number): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, maxLength) : null;
}

function parseEntityType(value: unknown): EntityType {
  if (typeof value !== 'string') return EntityType.OTHER;
  return Object.values(EntityType).find((item) => item === value) ?? EntityType.OTHER;
}

function toJsonObject(value: unknown): Record<string, unknown> | undefined {
  return isRecord(value) ? value : undefined;
}

async function requirePermissions(c: Context): Promise<{ tenantId: string; permissions: PermissionView } | Response> {
  const tenantId = requireTenantId(c);
  const userId = requireUserId(c);
  const permissions = await getPermissionView(tenantId, userId);
  if (!permissions) {
    return c.json(new ForbiddenError("Bu tenant'a erisiminiz yok.").toJSON(), 403);
  }
  return { tenantId, permissions };
}

async function requireOwner(c: Context, tenantId: string): Promise<Response | null> {
  const userId = requireUserId(c);
  const tenantUser = await prisma.tenantUser.findFirst({
    where: { tenantId, userId, isActive: true },
    select: { isOwner: true },
  });
  if (!tenantUser?.isOwner) {
    return c.json(new ForbiddenError('AI denetim ve politika ekranlarini sadece tenant owner gorebilir.').toJSON(), 403);
  }
  return null;
}

async function entityBelongsToTenant(tenantId: string, entityType: EntityType, entityId: string): Promise<boolean> {
  switch (entityType) {
    case EntityType.INVOICE:
      return (await prisma.invoice.count({ where: { id: entityId, tenantId, deletedAt: null } })) > 0;
    case EntityType.PRODUCT:
      return (await prisma.product.count({ where: { id: entityId, tenantId, deletedAt: null } })) > 0;
    case EntityType.CATEGORY:
      return (await prisma.category.count({ where: { id: entityId, tenantId } })) > 0;
    case EntityType.CONTACT:
      return (await prisma.contact.count({ where: { id: entityId, tenantId, deletedAt: null } })) > 0;
    case EntityType.EMPLOYEE:
      return (await prisma.employee.count({ where: { id: entityId, tenantId, deletedAt: null } })) > 0;
    case EntityType.CUSTOMER_ASSET:
      return (await prisma.customerAsset.count({ where: { id: entityId, tenantId, deletedAt: null } })) > 0;
    case EntityType.SERVICE_REQUEST:
      return (await prisma.serviceRequest.count({ where: { id: entityId, tenantId, deletedAt: null } })) > 0;
    case EntityType.PURCHASE_ORDER:
      return (await prisma.purchaseOrder.count({ where: { id: entityId, tenantId, deletedAt: null } })) > 0;
    case EntityType.SALES_QUOTE:
      return (await prisma.salesQuote.count({ where: { id: entityId, tenantId, deletedAt: null } })) > 0;
    case EntityType.SALES_ORDER:
      return (await prisma.salesOrder.count({ where: { id: entityId, tenantId, deletedAt: null } })) > 0;
    case EntityType.WORK_ORDER:
      return (await prisma.workOrder.count({ where: { id: entityId, tenantId, deletedAt: null } })) > 0;
    case EntityType.DELIVERY_NOTE:
      return (await prisma.deliveryNote.count({ where: { id: entityId, tenantId, deletedAt: null } })) > 0;
    case EntityType.OTHER:
      return true;
  }
}

export const IntelligenceController = {
  async recommendations(c: Context): Promise<Response> {
    const context = await requirePermissions(c);
    if (context instanceof Response) return context;
    const data = await IntelligenceService.getRecommendations(context.tenantId, context.permissions);
    return c.json({ data });
  },

  async automationTemplates(c: Context): Promise<Response> {
    const context = await requirePermissions(c);
    if (context instanceof Response) return context;
    const data = IntelligenceService.getAutomationTemplates(context.permissions);
    return c.json({ data });
  },

  async automationPreview(c: Context): Promise<Response> {
    const context = await requirePermissions(c);
    if (context instanceof Response) return context;
    const data = await IntelligenceService.previewAutomationTemplates(context.tenantId, context.permissions);
    return c.json({ data });
  },

  async sectorTemplates(c: Context): Promise<Response> {
    const data = IntelligenceService.getSectorTemplates();
    return c.json({ data });
  },

  async documentDraft(c: Context): Promise<Response> {
    const context = await requirePermissions(c);
    if (context instanceof Response) return context;
    if (!canRead(context.permissions, 'attachments')) {
      return c.json(new ForbiddenError('attachments:READ yetkisi gerekli.').toJSON(), 403);
    }

    const id = c.req.param('id')!;
    const data = await IntelligenceService.getDocumentDraft(context.tenantId, id);
    if (!data) return c.json(new NotFoundError('Dosya', id).toJSON(), 404);
    return c.json({ data });
  },

  async aiGovernanceLogs(c: Context): Promise<Response> {
    const context = await requirePermissions(c);
    if (context instanceof Response) return context;
    const ownerError = await requireOwner(c, context.tenantId);
    if (ownerError) return ownerError;

    const page = parsePositiveInt(c.req.query('page'), 1, 10_000);
    const limit = parsePositiveInt(c.req.query('limit'), 20, 100);
    const result = await listAiRequestLogs({
      contextTenantId: context.tenantId,
      page,
      limit,
      requestType: parseAiRequestType(c.req.query('requestType')),
      status: parseAiRequestStatus(c.req.query('status')),
      userId: c.req.query('userId')?.trim() || undefined,
    });
    return c.json(result);
  },

  async aiGovernancePolicy(c: Context): Promise<Response> {
    const context = await requirePermissions(c);
    if (context instanceof Response) return context;
    const ownerError = await requireOwner(c, context.tenantId);
    if (ownerError) return ownerError;

    const policy = await getAiGovernancePolicy(prisma, context.tenantId);
    return c.json({ data: { policy, redactionRegistry: getAiRedactionRegistry() } });
  },

  async updateAiGovernancePolicy(c: Context): Promise<Response> {
    const context = await requirePermissions(c);
    if (context instanceof Response) return context;
    const ownerError = await requireOwner(c, context.tenantId);
    if (ownerError) return ownerError;

    const body: unknown = await c.req.json().catch(() => null);
    if (!isRecord(body)) return c.json(new ValidationError('Gecersiz AI politika istegi.').toJSON(), 400);

    const enabled = parseBoolean(body.enabled);
    const dataSharingPolicy = parseDataSharingPolicy(body.dataSharingPolicy);
    const logPrompts = parseBoolean(body.logPrompts);
    if (enabled === null || dataSharingPolicy === null || logPrompts === null) {
      return c.json(new ValidationError('enabled, dataSharingPolicy ve logPrompts alanlari gecerlidir.').toJSON(), 400);
    }

    const policy = await setAiGovernancePolicy(prisma, context.tenantId, {
      enabled,
      dataSharingPolicy,
      logPrompts,
    });
    await createAuditLog(prisma, {
      tenantId: context.tenantId,
      userId: requireUserId(c),
      module: 'ai_governance',
      entityType: EntityType.OTHER,
      entityId: context.tenantId,
      action: AuditAction.UPDATE,
      newValues: {
        enabled: policy.enabled,
        dataSharingPolicy: policy.dataSharingPolicy,
        logPrompts: policy.logPrompts,
      },
      ...getRequestMeta(c),
    });
    return c.json({ data: { policy, redactionRegistry: getAiRedactionRegistry() } });
  },

  async recordAiActionAudit(c: Context): Promise<Response> {
    const context = await requirePermissions(c);
    if (context instanceof Response) return context;
    const userId = requireUserId(c);
    const body: unknown = await c.req.json().catch(() => null);
    if (!isRecord(body)) return c.json(new ValidationError('Gecersiz AI aksiyon audit istegi.').toJSON(), 400);

    const actionId = parseString(body.actionId, 120);
    const actionType = parseString(body.actionType, 80);
    const module = parseString(body.module, 80) ?? 'ai_governance';
    const entityId = parseString(body.entityId, 120);
    if (!actionId || !actionType || !entityId) {
      return c.json(new ValidationError('actionId, actionType ve entityId zorunludur.').toJSON(), 400);
    }

    const entityType = parseEntityType(body.entityType);
    if (!canRecordAiActionAudit(context.permissions, module, actionType)) {
      return c.json(new ForbiddenError('AI aksiyon audit kaydi icin ilgili modul yetkisi gerekli.').toJSON(), 403);
    }
    if (!(await entityBelongsToTenant(context.tenantId, entityType, entityId))) {
      return c.json(new ValidationError('AI aksiyon audit kaydi baglanacak kayit bu tenant icinde bulunamadi.').toJSON(), 400);
    }

    const status = body.status === 'FAILED' ? AiRequestStatus.FAILED : AiRequestStatus.SUCCEEDED;
    const requestMeta = getRequestMeta(c);

    await recordAiRequestLog({
      tenantId: context.tenantId,
      userId,
      requestType: AiRequestType.RECOMMENDED_ACTION,
      promptVersion: 'recommended-action:v1',
      model: 'system',
      entityType,
      entityId,
      entityContext: toJsonObject(body.entityContext) ?? { module, actionId },
      permissionCheckResult: AiPermissionCheckResult.ALLOWED,
      inputText: parseString(body.summary, 700) ?? actionType,
      outputText: parseString(body.resultSummary, 700),
      draft: toJsonObject(body.draft),
      result: {
        actionId,
        actionType,
        module,
        mutation: toJsonObject(body.mutationResult),
      },
      userApprovedAction: actionType,
      status,
      ipAddress: requestMeta.ipAddress,
      userAgent: requestMeta.userAgent,
    });

    await createAuditLog(prisma, {
      tenantId: context.tenantId,
      userId,
      module: 'ai_governance',
      entityType,
      entityId,
      action: AuditAction.UPDATE,
      newValues: {
        actionId,
        actionType,
        module,
        status,
      },
      ...requestMeta,
    });

    return c.json({ data: { recorded: true } }, 201);
  },
};
