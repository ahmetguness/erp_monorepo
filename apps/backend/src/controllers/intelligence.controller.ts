import { Context } from 'hono';
import { AiRequestStatus, AiRequestType, PermissionAction } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { ForbiddenError, NotFoundError } from '../errors';
import { IntelligenceService, type PermissionView } from '../services/intelligence.service.js';
import { requireTenantId, requireUserId } from '../utils/context.js';
import { listAiRequestLogs } from '../services/ai-governance.service';

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

async function requirePermissions(c: Context): Promise<{ tenantId: string; permissions: PermissionView } | Response> {
  const tenantId = requireTenantId(c);
  const userId = requireUserId(c);
  const permissions = await getPermissionView(tenantId, userId);
  if (!permissions) {
    return c.json(new ForbiddenError("Bu tenant'a erisiminiz yok.").toJSON(), 403);
  }
  return { tenantId, permissions };
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
    const userId = requireUserId(c);
    const tenantUser = await prisma.tenantUser.findFirst({
      where: { tenantId: context.tenantId, userId, isActive: true },
      select: { isOwner: true },
    });
    if (!tenantUser?.isOwner) {
      return c.json(new ForbiddenError('AI denetim loglarini sadece tenant owner gorebilir.').toJSON(), 403);
    }

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
};
