import { FeatureKey, FeatureType, type PrismaClient } from '@prisma/client';
import { STARTER_FEATURE_DEFAULTS } from '../../../types/feature.types.js';
import { parseBooleanValue } from '../../../utils/feature-parser.js';
import type { AccessContextResolution, ResolvedAccessFeature } from '../application/index.js';

const SECURITY_SETTING_KEYS = ['security.ip_restriction.enabled', 'security.ip_whitelist'] as const;

interface FeatureDefinition {
  featureKey: FeatureKey | null;
  value: string;
  isEnabled: boolean;
  type: FeatureType;
}

interface FeatureOverride {
  featureKey: FeatureKey;
  value: string;
  isEnabled: boolean;
}

export function resolveAccessFeatures(
  planFeatures: readonly FeatureDefinition[],
  overrides: readonly FeatureOverride[],
): ReadonlyMap<FeatureKey, ResolvedAccessFeature> {
  const planByKey = new Map(planFeatures.flatMap((feature) => feature.featureKey ? [[feature.featureKey, feature] as const] : []));
  const overrideByKey = new Map(overrides.map((override) => [override.featureKey, override]));
  const features = new Map<FeatureKey, ResolvedAccessFeature>();

  for (const featureKey of Object.values(FeatureKey)) {
    const planFeature = planByKey.get(featureKey);
    const override = overrideByKey.get(featureKey);
    if (override) {
      const type = planFeature?.type ?? FeatureType.BOOLEAN;
      features.set(featureKey, {
        value: override.value,
        isEnabled: override.isEnabled && (type !== FeatureType.BOOLEAN || parseBooleanValue(override.value)),
        source: 'override',
      });
      continue;
    }
    if (planFeature) {
      features.set(featureKey, {
        value: planFeature.value,
        isEnabled: planFeature.isEnabled && (planFeature.type !== FeatureType.BOOLEAN || parseBooleanValue(planFeature.value)),
        source: 'plan',
      });
      continue;
    }
    const value = STARTER_FEATURE_DEFAULTS[featureKey] ?? 'false';
    features.set(featureKey, { value, isEnabled: parseBooleanValue(value) || value !== 'false', source: 'default' });
  }

  return features;
}

export async function resolveAccessContext(
  db: PrismaClient,
  userId: string,
  tenantId: string,
  now: Date = new Date(),
): Promise<AccessContextResolution> {
  const membership = await db.tenantUser.findFirst({
    where: { tenantId, userId, isActive: true, user: { isActive: true }, tenant: { deletedAt: null } },
    select: {
      id: true, roleId: true, isOwner: true,
      roleRef: { select: { name: true, permissions: { select: { module: true, action: true } } } },
      tenant: { select: {
        plan: true, status: true, modules: true,
        tenantSettings: { where: { key: { in: [...SECURITY_SETTING_KEYS] } }, select: { key: true, value: true } },
        featureOverrides: {
          where: { OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
          select: { featureKey: true, value: true, isEnabled: true },
        },
      } },
    },
  });
  if (!membership) return { context: null, queryCount: 1 };

  const planFeatures = await db.planFeature.findMany({
    where: { plan: membership.tenant.plan, featureKey: { not: null } },
    select: { featureKey: true, value: true, isEnabled: true, type: true },
  });
  const features = resolveAccessFeatures(planFeatures, membership.tenant.featureOverrides);
  const settings = new Map(membership.tenant.tenantSettings.map((setting) => [setting.key, setting.value]));
  return { queryCount: 2, context: {
    userId, tenantId,
    tenant: { plan: membership.tenant.plan, status: membership.tenant.status, modules: membership.tenant.modules },
    membership: {
      id: membership.id, roleId: membership.roleId, roleName: membership.roleRef?.name ?? null,
      isOwner: membership.isOwner, permissions: membership.roleRef?.permissions ?? [],
    },
    features,
    security: {
      ipRestrictionEnabled: settings.get(SECURITY_SETTING_KEYS[0]) === 'true',
      ipWhitelist: (settings.get(SECURITY_SETTING_KEYS[1]) ?? '').split(',').map((value) => value.trim()).filter(Boolean),
    },
  } };
}

/** Resolves tenant capabilities for non-user principals such as scoped API keys. */
export async function resolveServiceAccessContext(
  db: PrismaClient,
  principalId: string,
  tenantId: string,
  now: Date = new Date(),
): Promise<AccessContextResolution> {
  const tenant = await db.tenant.findFirst({
    where: { id: tenantId, deletedAt: null },
    select: {
      plan: true, status: true, modules: true,
      tenantSettings: { where: { key: { in: [...SECURITY_SETTING_KEYS] } }, select: { key: true, value: true } },
      featureOverrides: {
        where: { OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
        select: { featureKey: true, value: true, isEnabled: true },
      },
    },
  });
  if (!tenant) return { context: null, queryCount: 1 };
  const planFeatures = await db.planFeature.findMany({
    where: { plan: tenant.plan, featureKey: { not: null } },
    select: { featureKey: true, value: true, isEnabled: true, type: true },
  });
  const features = resolveAccessFeatures(planFeatures, tenant.featureOverrides);
  const settings = new Map(tenant.tenantSettings.map((setting) => [setting.key, setting.value]));
  return { queryCount: 2, context: {
    userId: principalId, tenantId,
    tenant: { plan: tenant.plan, status: tenant.status, modules: tenant.modules },
    membership: { id: principalId, roleId: null, roleName: 'API Key', isOwner: false, permissions: [] },
    features,
    security: {
      ipRestrictionEnabled: settings.get(SECURITY_SETTING_KEYS[0]) === 'true',
      ipWhitelist: (settings.get(SECURITY_SETTING_KEYS[1]) ?? '').split(',').map((value) => value.trim()).filter(Boolean),
    },
  } };
}
