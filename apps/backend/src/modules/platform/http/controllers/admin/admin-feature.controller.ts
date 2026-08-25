import { requireParam } from '../../../../../utils/context.js';
import { Context } from 'hono';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { setCookie, deleteCookie } from 'hono/cookie';
import { AppModule, AuditAction, EntityType, FeatureKey, FeatureType, Plan, Prisma, TenantStatus } from '@prisma/client';
import { prisma } from '../../../../../lib/prisma.js';
import { ValidationError, NotFoundError } from '../../../../../errors/index.js';
import { getPaginationParams } from '../../../../../utils/pagination.js';
import { createAuditLog, getRequestMeta } from '../../../../../utils/audit.js';
import { sendMail } from '../../../../../services/mail.service.js';
import { tenantReadyEmail } from '../../../../../services/mail-templates.service.js';
import { getObservabilitySnapshot } from '../../../../../services/observability.service.js';
import { rateLimiter } from '../../../../../lib/rateLimiter.js';
import { logger } from '../../../../../lib/logger.js';
import { getTrustedClientIp } from '../../../../../utils/request-ip.js';
import { modulesForPrismaPlan, toAppModule, VALID_MODULE_KEYS } from '../../../../../utils/tenant-modules.js';
import { PlanFeatureService } from '../../../../../services/plan-feature.service.js';
import { PlanChangeExperienceService } from '../../../../../services/plan-change-experience.service.js';
import { JWT_SECRET, ADMIN_JWT_SECRET, IS_PRODUCTION, RESOLVED_ADMIN_SECRET, ADMIN_COOKIE_NAME, ADMIN_COOKIE_MAX_AGE, ADMIN_LOGIN_LIMIT, ADMIN_LOGIN_WINDOW_MS, ADMIN_LOGIN_LOCKOUT_FAILURES, ADMIN_LOGIN_LOCKOUT_WINDOW_MS, VALID_PLANS, VALID_STATUSES, VALID_FEATURE_KEYS, VALID_FEATURE_TYPES, VALID_MODULES, planFeatureService, planChangeExperienceService, normalizeEmail, getClientIp, getAdminLoginLimitKeys, recordAdminLoginFailure, isFeatureKey, isPlan, isFeatureType, createSlug, parseNullableDate, validateModules, normalizePlanFeatureValue, getPlanFeatureAuditTenantIds, formatNotificationValue, MODULE_TRANSLATIONS, translateModules, buildChangeLine, notifyTenantOwners } from './shared.js';

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
    const updatedFeature = await planFeatureService.updatePlanFeature({
      plan,
      key,
      value: normalizedValue,
      type: body.type,
      isEnabled: body.isEnabled,
      description: body.description,
      featureKey: body.featureKey ?? null,
    });

    const auditTenantIds = await getPlanFeatureAuditTenantIds(plan);
    await Promise.all(auditTenantIds.map((tenantId) => createAuditLog(prisma, {
      tenantId,
      module: 'admin',
      entityType: EntityType.OTHER,
      entityId: updatedFeature.id,
      action: existingFeature ? AuditAction.UPDATE : AuditAction.CREATE,
      oldValues: existingFeature ? {
        plan: existingFeature.plan,
        key: existingFeature.key,
        value: existingFeature.value,
        type: existingFeature.type,
        isEnabled: existingFeature.isEnabled,
        description: existingFeature.description,
        featureKey: existingFeature.featureKey,
      } : undefined,
      newValues: {
        plan: updatedFeature.plan,
        key: updatedFeature.key,
        value: updatedFeature.value,
        type: updatedFeature.type,
        isEnabled: updatedFeature.isEnabled,
        description: updatedFeature.description,
        featureKey: updatedFeature.featureKey,
      },
      ...getRequestMeta(c),
    })));

    return c.json({ data: updatedFeature });
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
