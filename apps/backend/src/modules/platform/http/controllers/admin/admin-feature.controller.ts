import { AdminChangeRequestType,AuditAction,EntityType,Plan } from '@prisma/client';
import { Context } from 'hono';
import { NotFoundError,ValidationError } from '../../../../../errors/index.js';
import { prisma } from '../../../../../lib/prisma.js';
import { createAuditLog,getRequestMeta } from '../../../../../utils/audit.js';
import { buildChangeLine,formatNotificationValue,isFeatureKey,isFeatureType,isPlan,normalizePlanFeatureValue,notifyTenantOwners } from './shared.js';
import { submitAdminChange } from '../../../admin-change-request/admin-change-request.service.js';

export const AdminFeatureController = {

  async listPlanFeatures(c: Context): Promise<Response> {
    const planQuery = c.req.query('plan');
    let plan: Plan | undefined;
    if (planQuery) {
      if (!isPlan(planQuery)) {
        return c.json(new ValidationError('Gecerli bir plan seciniz: STARTER, PROFESSIONAL, ENTERPRISE').toJSON(), 400);
      }
      plan = planQuery;
    }
    const features = await prisma.planFeature.findMany({
      where: plan ? { plan } : {},
      orderBy: [{ plan: 'asc' }, { key: 'asc' }],
    });
    return c.json({ data: features });
  },

  async updatePlanFeature(c: Context): Promise<Response> {
    const body = await c.req.json<{
      plan?: string;
      key?: string;
      value?: string;
      type?: string;
      isEnabled?: boolean;
      description?: string | null;
      featureKey?: string | null;
    }>().catch(() => null);

    if (!body || !body.plan || !isPlan(body.plan)) {
      return c.json(new ValidationError('Gecerli bir plan seciniz: STARTER, PROFESSIONAL, ENTERPRISE').toJSON(), 400);
    }
    if (!body.key?.trim()) {
      return c.json(new ValidationError('key zorunludur.').toJSON(), 400);
    }
    if (typeof body.value !== 'string') {
      return c.json(new ValidationError('value string olmalidir.').toJSON(), 400);
    }
    if (!body.type || !isFeatureType(body.type)) {
      return c.json(new ValidationError('Gecerli bir feature type seciniz: BOOLEAN, LIMIT, ENUM').toJSON(), 400);
    }
    if (typeof body.isEnabled !== 'boolean') {
      return c.json(new ValidationError('isEnabled boolean olmalidir.').toJSON(), 400);
    }
    if (body.featureKey !== undefined && body.featureKey !== null && !isFeatureKey(body.featureKey)) {
      return c.json(new ValidationError('Gecersiz featureKey.').toJSON(), 400);
    }

    let normalizedValue: string;
    try {
      normalizedValue = normalizePlanFeatureValue(body.type, body.value);
    } catch (error) {
      if (error instanceof ValidationError) return c.json(error.toJSON(), 400);
      throw error;
    }

    const plan = body.plan;
    const key = body.key.trim();
    const existingFeature = await prisma.planFeature.findUnique({ where: { plan_key: { plan, key } } });
    const [affectedTenantCount, affectedUserCount] = await Promise.all([
      prisma.tenant.count({ where: { plan, deletedAt: null } }),
      prisma.tenantUser.count({ where: { tenant: { plan, deletedAt: null }, isActive: true } }),
    ]);
    const changeRequest = await submitAdminChange({
      type: AdminChangeRequestType.PLAN_FEATURE_UPDATE,
      targetId: `${plan}:${key}`,
      targetLabel: `${plan} / ${key}`,
      requiredPermission: 'feature.approve',
      payload: {
        plan, key, value: normalizedValue, type: body.type, isEnabled: body.isEnabled,
        description: body.description ?? null, featureKey: body.featureKey ?? null,
      },
      previousValues: existingFeature ? {
        plan: existingFeature.plan, key: existingFeature.key, value: existingFeature.value,
        type: existingFeature.type, isEnabled: existingFeature.isEnabled,
        description: existingFeature.description, featureKey: existingFeature.featureKey,
      } : null,
      affectedTenantCount,
      affectedUserCount,
      requestedById: c.get('adminId') as string,
    });
    return c.json({ data: { requiresApproval: true, changeRequest } }, 202);

  },

  async listOverrides(c: Context): Promise<Response> {
    const tenantId = c.req.query('tenantId');
    const overrides = await prisma.tenantFeatureOverride.findMany({
      where: tenantId ? { tenantId } : {},
      include: { tenant: { select: { id: true, companyName: true, slug: true } } },
      orderBy: { createdAt: 'desc' },
    });
    return c.json({ data: overrides });
  },

  async createOverride(c: Context): Promise<Response> {
    const body = await c.req.json<{
      tenantId: string; featureKey: string; value: string;
      isEnabled?: boolean; reason?: string; expiresAt?: string;
    }>();

    if (!body.tenantId || !body.featureKey || body.value === undefined) {
      return c.json(new ValidationError('tenantId, featureKey ve value zorunludur.').toJSON(), 400);
    }

    if (!isFeatureKey(body.featureKey)) {
      return c.json(new ValidationError('Gecersiz featureKey.').toJSON(), 400);
    }

    const featureKey = body.featureKey;

    const existingOverride = await prisma.tenantFeatureOverride.findUnique({
      where: { tenantId_featureKey: { tenantId: body.tenantId, featureKey } },
    });

    if (!body.expiresAt) {
      const [tenant, affectedUserCount] = await Promise.all([
        prisma.tenant.findFirst({ where: { id: body.tenantId, deletedAt: null }, select: { companyName: true } }),
        prisma.tenantUser.count({ where: { tenantId: body.tenantId, isActive: true } }),
      ]);
      if (!tenant) return c.json(new NotFoundError('Tenant', body.tenantId).toJSON(), 404);
      const changeRequest = await submitAdminChange({
        type: AdminChangeRequestType.FEATURE_OVERRIDE_UPSERT,
        targetId: `${body.tenantId}:${featureKey}`,
        targetLabel: `${tenant.companyName} / ${featureKey}`,
        requiredPermission: 'feature.override.approve',
        payload: {
          tenantId: body.tenantId, featureKey, value: body.value,
          isEnabled: body.isEnabled ?? true, reason: body.reason ?? null,
        },
        previousValues: existingOverride ? {
          value: existingOverride.value, isEnabled: existingOverride.isEnabled,
          reason: existingOverride.reason, expiresAt: existingOverride.expiresAt?.toISOString() ?? null,
        } : null,
        affectedTenantCount: 1,
        affectedUserCount,
        requestedById: c.get('adminId') as string,
      });
      return c.json({ data: { requiresApproval: true, changeRequest } }, 202);
    }

    const override = await prisma.tenantFeatureOverride.upsert({
      where: { tenantId_featureKey: { tenantId: body.tenantId, featureKey } },
      create: {
        tenantId: body.tenantId,
        featureKey,
        value: body.value,
        isEnabled: body.isEnabled ?? true,
        reason: body.reason ?? null,
        expiresAt: body.expiresAt ? new Date(body.expiresAt) : null,
      },
      update: {
        value: body.value,
        isEnabled: body.isEnabled ?? true,
        reason: body.reason ?? null,
        expiresAt: body.expiresAt ? new Date(body.expiresAt) : null,
      },
    });

    await notifyTenantOwners(prisma, body.tenantId, 'Tenant özellik ayarınız admin tarafından değiştirildi', [
      `Özellik: ${body.featureKey}`,
      buildChangeLine('Değer', existingOverride?.value, override.value),
      buildChangeLine('Aktiflik', existingOverride?.isEnabled, override.isEnabled),
      buildChangeLine('Gerekçe', existingOverride?.reason, override.reason),
      buildChangeLine('Bitiş tarihi', existingOverride?.expiresAt, override.expiresAt),
    ].filter((line): line is string => Boolean(line)));

    return c.json({ data: override });
  },

  async deleteOverride(c: Context): Promise<Response> {
    const id = c.req.param('id');
    if (!id) return c.json(new ValidationError('id parametresi zorunludur.').toJSON(), 400);
    const override = await prisma.tenantFeatureOverride.findUnique({ where: { id } });
    if (!override) return c.json(new NotFoundError('Feature override', id).toJSON(), 404);

    if (!override.expiresAt) {
      const [tenant, affectedUserCount] = await Promise.all([
        prisma.tenant.findUnique({ where: { id: override.tenantId }, select: { companyName: true } }),
        prisma.tenantUser.count({ where: { tenantId: override.tenantId, isActive: true } }),
      ]);
      const changeRequest = await submitAdminChange({
        type: AdminChangeRequestType.FEATURE_OVERRIDE_DELETE,
        targetId: `${override.tenantId}:${override.featureKey}`,
        targetLabel: `${tenant?.companyName ?? override.tenantId} / ${override.featureKey}`,
        requiredPermission: 'feature.override.approve',
        payload: { overrideId: override.id, tenantId: override.tenantId, featureKey: override.featureKey },
        previousValues: {
          value: override.value, isEnabled: override.isEnabled, reason: override.reason,
          expiresAt: null,
        },
        affectedTenantCount: 1,
        affectedUserCount,
        requestedById: c.get('adminId') as string,
      });
      return c.json({ data: { requiresApproval: true, changeRequest } }, 202);
    }

    await prisma.tenantFeatureOverride.delete({ where: { id } });

    await createAuditLog(prisma, {
      tenantId: override.tenantId,
      module: 'admin',
      entityType: EntityType.OTHER,
      entityId: id,
      action: AuditAction.DELETE,
      oldValues: {
        featureKey: override.featureKey,
        value: override.value,
        isEnabled: override.isEnabled,
        reason: override.reason,
        expiresAt: override.expiresAt?.toISOString() ?? null,
      },
      ...getRequestMeta(c),
    });

    await notifyTenantOwners(prisma, override.tenantId, 'Tenant özelliğiniz admin tarafından kaldırıldı', [
      `Özellik: ${override.featureKey}`,
      `Kaldırılan değer: ${formatNotificationValue(override.value)}`,
    ]);
    return c.json({ data: { success: true } });
  },
};

// ─────────────────────────────────────────────
// Platform Metrics
// ─────────────────────────────────────────────
