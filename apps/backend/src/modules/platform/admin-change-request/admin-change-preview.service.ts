import { AdminChangeRequestType } from '@prisma/client';
import type { ChangePreview, ChangePreviewField } from '@repo/types';
import { NotFoundError } from '../../../errors/index.js';
import { prisma } from '../../../lib/prisma.js';
import { modulesForPrismaPlan } from '../../../utils/tenant-modules.js';
import type { PreviewRequest } from './admin-change-request.schemas.js';
import { isCriticalTenantPlanChange, isCriticalTenantStatusChange } from './admin-change-request.policy.js';
import { assertLegacyTenantTransition } from '../tenant-lifecycle/tenant-lifecycle.policy.js';

function change(field: string, label: string, before: unknown, after: unknown): ChangePreviewField {
  return { field, label, before, after };
}

async function tenantImpact(tenantId: string): Promise<number> {
  return prisma.tenantUser.count({ where: { tenantId, isActive: true } });
}

export async function previewAdminChange(input: PreviewRequest): Promise<ChangePreview> {
  switch (input.type) {
    case AdminChangeRequestType.TENANT_PLAN_UPDATE: {
      const tenant = await prisma.tenant.findFirst({ where: { id: input.payload.tenantId, deletedAt: null } });
      if (!tenant) throw new NotFoundError('Tenant', input.payload.tenantId);
      const nextModules = modulesForPrismaPlan(input.payload.plan);
      const removedModules = tenant.modules.filter((module) => !nextModules.includes(module));
      return {
        type: input.type, targetId: tenant.id, targetLabel: tenant.companyName,
        changes: [change('plan', 'Plan', tenant.plan, input.payload.plan), change('modules', 'Modüller', tenant.modules, nextModules)],
        affectedTenantCount: 1, affectedUserCount: await tenantImpact(tenant.id),
        warnings: removedModules.length > 0 ? [`Erişimi kapanacak modüller: ${removedModules.join(', ')}`] : [],
        requiresApproval: isCriticalTenantPlanChange(tenant.plan, input.payload.plan),
      };
    }
    case AdminChangeRequestType.TENANT_STATUS_UPDATE: {
      const tenant = await prisma.tenant.findFirst({ where: { id: input.payload.tenantId, deletedAt: null } });
      if (!tenant) throw new NotFoundError('Tenant', input.payload.tenantId);
      assertLegacyTenantTransition(tenant.status, input.payload.status);
      return {
        type: input.type, targetId: tenant.id, targetLabel: tenant.companyName,
        changes: [change('status', 'Durum', tenant.status, input.payload.status)],
        affectedTenantCount: 1, affectedUserCount: await tenantImpact(tenant.id),
        warnings: input.payload.status === 'SUSPENDED' || input.payload.status === 'CANCELLED' ? ['Tenant kullanıcılarının erişimi kesilecektir.'] : [],
        requiresApproval: isCriticalTenantStatusChange(input.payload.status),
      };
    }
    case AdminChangeRequestType.PLAN_FEATURE_UPDATE: {
      const current = await prisma.planFeature.findUnique({ where: { plan_key: { plan: input.payload.plan, key: input.payload.key } } });
      const tenants = await prisma.tenant.findMany({ where: { plan: input.payload.plan, deletedAt: null }, select: { id: true } });
      const affectedUserCount = await prisma.tenantUser.count({ where: { tenantId: { in: tenants.map(({ id }) => id) }, isActive: true } });
      const fields: ChangePreviewField[] = [
        change('value', 'Değer', current?.value ?? null, input.payload.value),
        change('isEnabled', 'Aktiflik', current?.isEnabled ?? null, input.payload.isEnabled),
        change('type', 'Tür', current?.type ?? null, input.payload.type),
      ].filter((item) => item.before !== item.after);
      return {
        type: input.type, targetId: `${input.payload.plan}:${input.payload.key}`, targetLabel: `${input.payload.plan} / ${input.payload.key}`,
        changes: fields, affectedTenantCount: tenants.length, affectedUserCount,
        warnings: input.payload.isEnabled ? [] : ['Bu özelliğe bağlı ekran ve işlemler erişilemez olabilir.'], requiresApproval: true,
      };
    }
    case AdminChangeRequestType.FEATURE_OVERRIDE_UPSERT: {
      const tenant = await prisma.tenant.findFirst({ where: { id: input.payload.tenantId, deletedAt: null }, select: { id: true, companyName: true } });
      if (!tenant) throw new NotFoundError('Tenant', input.payload.tenantId);
      const current = await prisma.tenantFeatureOverride.findUnique({ where: { tenantId_featureKey: { tenantId: tenant.id, featureKey: input.payload.featureKey } } });
      return {
        type: input.type, targetId: `${tenant.id}:${input.payload.featureKey}`, targetLabel: `${tenant.companyName} / ${input.payload.featureKey}`,
        changes: [change('value', 'Değer', current?.value ?? null, input.payload.value), change('isEnabled', 'Aktiflik', current?.isEnabled ?? null, input.payload.isEnabled)],
        affectedTenantCount: 1, affectedUserCount: await tenantImpact(tenant.id), warnings: ['Bu override süresiz olarak geçerli olacaktır.'], requiresApproval: true,
      };
    }
    case AdminChangeRequestType.FEATURE_OVERRIDE_DELETE: {
      const current = await prisma.tenantFeatureOverride.findUnique({ where: { id: input.payload.overrideId }, include: { tenant: { select: { companyName: true } } } });
      if (!current) throw new NotFoundError('Feature override', input.payload.overrideId);
      return {
        type: input.type, targetId: `${current.tenantId}:${current.featureKey}`, targetLabel: `${current.tenant.companyName} / ${current.featureKey}`,
        changes: [change('override', 'Kalıcı override', { value: current.value, isEnabled: current.isEnabled }, null)],
        affectedTenantCount: 1, affectedUserCount: await tenantImpact(current.tenantId), warnings: ['Tenant plan varsayılanlarına geri dönecektir.'], requiresApproval: true,
      };
    }
    case AdminChangeRequestType.FEATURE_ROLLOUT_ACTIVATE: {
      const rollout = await prisma.featureRollout.findUnique({ where: { id: input.payload.rolloutId } });
      if (!rollout) throw new NotFoundError('Feature rollout', input.payload.rolloutId);
      return {
        type: input.type,
        targetId: rollout.id,
        targetLabel: `${rollout.plan} / ${rollout.featureKey} / v${rollout.version}`,
        changes: [change('status', 'Durum', rollout.status, 'ACTIVE')],
        affectedTenantCount: rollout.targetTenantIds.length,
        affectedUserCount: 0,
        warnings: ['Aktivasyon hedef tenantların çalışma zamanındaki feature çözümünü değiştirecektir.'],
        requiresApproval: true,
      };
    }
  }
}
