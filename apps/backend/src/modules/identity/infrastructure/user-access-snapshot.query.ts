import { AppModule, FeatureKey, FeatureType, PermissionAction, Plan, Prisma, TenantStatus, type PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { assertRawQueryTenant } from '../../../lib/tenant-isolation-context.js';

const featureSchema = z.object({ featureKey: z.nativeEnum(FeatureKey), value: z.string(), isEnabled: z.boolean() });
const snapshotSchema = z.object({
  id: z.string(), roleId: z.string().nullable(), isOwner: z.boolean(),
  roleRef: z.object({ name: z.string(), permissions: z.array(z.object({ module: z.string(), action: z.nativeEnum(PermissionAction) })) }).nullable(),
  tenant: z.object({
    plan: z.nativeEnum(Plan), status: z.nativeEnum(TenantStatus), modules: z.array(z.nativeEnum(AppModule)), trialEndsAt: z.coerce.date().nullable(),
    tenantSettings: z.array(z.object({ key: z.string(), value: z.string() })),
    featureOverrides: z.array(featureSchema),
  }),
  planFeatures: z.array(featureSchema.extend({ type: z.nativeEnum(FeatureType) })),
});

/** A fresh, tenant-scoped statement; no membership, permission or feature cache. */
export function userAccessSnapshotSQL(userId: string, tenantId: string, now: Date): Prisma.Sql {
  assertRawQueryTenant(tenantId);
  return Prisma.sql`
    SELECT tu.id, tu."roleId", tu."isOwner",
      CASE WHEN r.id IS NULL THEN NULL ELSE jsonb_build_object('name',r.name,'permissions',
        coalesce((SELECT jsonb_agg(jsonb_build_object('module',p.module,'action',p.action))
          FROM role_permissions p WHERE p."roleId"=r.id),'[]'::jsonb)) END AS "roleRef",
      jsonb_build_object('plan',t.plan,'status',t.status,'modules',t.modules,'trialEndsAt',t."trialEndsAt" AT TIME ZONE 'UTC',
        'tenantSettings',coalesce((SELECT jsonb_agg(jsonb_build_object('key',s.key,'value',s.value))
          FROM tenant_settings s WHERE s."tenantId"=tu."tenantId"
          AND s.key IN ('security.ip_restriction.enabled','security.ip_whitelist')),'[]'::jsonb),
        'featureOverrides',coalesce((SELECT jsonb_agg(jsonb_build_object('featureKey',o."featureKey",'value',o.value,'isEnabled',o."isEnabled"))
          FROM tenant_feature_overrides o WHERE o."tenantId"=tu."tenantId"
          AND (o."expiresAt" IS NULL OR o."expiresAt">${now})),'[]'::jsonb)) AS tenant,
      coalesce((SELECT jsonb_agg(jsonb_build_object('featureKey',f."featureKey",'value',f.value,'isEnabled',f."isEnabled",'type',f.type))
        FROM plan_features f WHERE f.plan=t.plan AND f."featureKey" IS NOT NULL),'[]'::jsonb) AS "planFeatures"
    FROM tenant_users tu
    JOIN users u ON u.id=tu."userId"
    JOIN tenants t ON t.id=tu."tenantId"
    LEFT JOIN roles r ON r.id=tu."roleId" AND r."tenantId"=tu."tenantId"
    WHERE tu."tenantId"=${tenantId} AND tu."userId"=${userId}
      AND tu."isActive" AND u."isActive" AND t."deletedAt" IS NULL
    LIMIT 1
  `;
}

export async function readUserAccessSnapshot(db: PrismaClient, userId: string, tenantId: string, now: Date) {
  const rows = await db.$queryRaw<unknown[]>(userAccessSnapshotSQL(userId, tenantId, now));
  return rows.length ? snapshotSchema.parse(rows[0]) : null;
}
