import {
  AdminChangeRequestStatus, AdminChangeRequestType, AuditAction, EntityType, Prisma,
} from '@prisma/client';
import { isAdminPermission, type AdminChangeRequest, type AdminPermission } from '@repo/types';
import { prisma } from '../../../lib/prisma.js';
import { createAuditLog } from '../../../utils/audit.js';
import { modulesForPrismaPlan } from '../../../utils/tenant-modules.js';
import { PlanChangeExperienceService } from '../../../services/plan-change-experience.service.js';
import { BaseError } from '../../../errors/index.js';
import {
  featureOverrideDeletePayloadSchema, featureOverridePayloadSchema, planFeaturePayloadSchema, tenantPlanPayloadSchema, tenantStatusPayloadSchema,
} from './admin-change-request.schemas.js';

type TransactionClient = Prisma.TransactionClient;
type RequestWithActors = Prisma.AdminChangeRequestGetPayload<{
  include: { requestedBy: { select: { id: true; name: true; email: true } }; decidedBy: { select: { id: true; name: true; email: true } } };
}>;

export class AdminChangeRequestError extends BaseError {
  constructor(message: string, statusCode: 400 | 403 | 404 | 409) {
    super(message, statusCode, 'ADMIN_CHANGE_REQUEST_ERROR');
  }
}

export interface SubmitChangeInput {
  type: AdminChangeRequestType;
  targetId: string;
  targetLabel: string;
  requiredPermission: AdminPermission;
  payload: Prisma.InputJsonObject;
  previousValues: Prisma.InputJsonObject | null;
  affectedTenantCount: number;
  affectedUserCount: number;
  requestedById: string;
}

const actorSelect = { id: true, name: true, email: true } as const;
const requestInclude = { requestedBy: { select: actorSelect }, decidedBy: { select: actorSelect } } as const;

function toContract(request: RequestWithActors): AdminChangeRequest {
  const payload = request.payload;
  const previousValues = request.previousValues;
  if (!payload || Array.isArray(payload) || typeof payload !== 'object') throw new Error('Geçersiz değişiklik payload kaydı.');
  if (previousValues !== null && (Array.isArray(previousValues) || typeof previousValues !== 'object')) throw new Error('Geçersiz önceki değer kaydı.');
  if (!isAdminPermission(request.requiredPermission)) throw new Error('Geçersiz onay yetkisi kaydı.');
  return {
    id: request.id, type: request.type, status: request.status, targetId: request.targetId,
    targetLabel: request.targetLabel, requiredPermission: request.requiredPermission,
    payload: { ...payload }, previousValues: previousValues ? { ...previousValues } : null,
    affectedTenantCount: request.affectedTenantCount, affectedUserCount: request.affectedUserCount,
    requestedBy: request.requestedBy, decidedBy: request.decidedBy, decisionNote: request.decisionNote,
    createdAt: request.createdAt.toISOString(), decidedAt: request.decidedAt?.toISOString() ?? null,
    appliedAt: request.appliedAt?.toISOString() ?? null,
  };
}

export async function submitAdminChange(input: SubmitChangeInput): Promise<AdminChangeRequest> {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.adminChangeRequest.findFirst({
      where: { type: input.type, targetId: input.targetId, status: AdminChangeRequestStatus.PENDING },
      include: requestInclude,
    });
    if (existing) {
      if (existing.requestedById === input.requestedById) return toContract(existing);
      throw new AdminChangeRequestError('Bu hedef için başka bir admin tarafından oluşturulmuş bekleyen talep var.', 409);
    }
    const created = await tx.adminChangeRequest.create({
      data: {
        type: input.type, targetId: input.targetId, targetLabel: input.targetLabel,
        requiredPermission: input.requiredPermission, payload: input.payload,
        previousValues: input.previousValues ?? Prisma.JsonNull,
        affectedTenantCount: input.affectedTenantCount, affectedUserCount: input.affectedUserCount,
        requestedById: input.requestedById,
      },
      include: requestInclude,
    });
    return toContract(created);
  });
}

export async function listAdminChanges(status?: AdminChangeRequestStatus): Promise<AdminChangeRequest[]> {
  const requests = await prisma.adminChangeRequest.findMany({
    where: status ? { status } : {}, include: requestInclude, orderBy: { createdAt: 'desc' }, take: 200,
  });
  return requests.map(toContract);
}

async function applyChange(tx: TransactionClient, request: RequestWithActors, approverId: string): Promise<void> {
  const auditBase = { module: 'admin-approval', entityType: EntityType.OTHER, action: AuditAction.UPDATE, userId: approverId } as const;
  switch (request.type) {
    case AdminChangeRequestType.TENANT_PLAN_UPDATE: {
      const payload = tenantPlanPayloadSchema.parse(request.payload);
      const current = await tx.tenant.findUniqueOrThrow({ where: { id: payload.tenantId }, select: { plan: true } });
      const previousPlan = request.previousValues && typeof request.previousValues === 'object' && !Array.isArray(request.previousValues)
        ? request.previousValues.plan : null;
      if (current.plan !== previousPlan) throw new AdminChangeRequestError('Tenant planı talep oluşturulduktan sonra değişmiş.', 409);
      await tx.tenant.update({ where: { id: payload.tenantId }, data: { plan: payload.plan, modules: modulesForPrismaPlan(payload.plan), planChangedAt: new Date() } });
      await createAuditLog(tx, { ...auditBase, tenantId: payload.tenantId, entityId: payload.tenantId, oldValues: request.previousValues ?? undefined, newValues: payload });
      await new PlanChangeExperienceService(tx).handlePlanChanged({ tenantId: payload.tenantId, oldPlan: current.plan, newPlan: payload.plan, changedByUserId: null });
      return;
    }
    case AdminChangeRequestType.TENANT_STATUS_UPDATE: {
      const payload = tenantStatusPayloadSchema.parse(request.payload);
      const current = await tx.tenant.findUniqueOrThrow({ where: { id: payload.tenantId }, select: { status: true } });
      const previousStatus = request.previousValues && typeof request.previousValues === 'object' && !Array.isArray(request.previousValues)
        ? request.previousValues.status : null;
      if (current.status !== previousStatus) throw new AdminChangeRequestError('Tenant durumu talep oluşturulduktan sonra değişmiş.', 409);
      await tx.tenant.update({ where: { id: payload.tenantId }, data: { status: payload.status } });
      await createAuditLog(tx, { ...auditBase, tenantId: payload.tenantId, entityId: payload.tenantId, oldValues: request.previousValues ?? undefined, newValues: payload });
      await notifyOwners(tx, payload.tenantId, 'Tenant durumunuz onaylı admin işlemiyle değiştirildi', `Durum: ${current.status} → ${payload.status}`);
      return;
    }
    case AdminChangeRequestType.PLAN_FEATURE_UPDATE: {
      const payload = planFeaturePayloadSchema.parse(request.payload);
      const feature = await tx.planFeature.upsert({
        where: { plan_key: { plan: payload.plan, key: payload.key } },
        create: payload, update: payload,
      });
      const tenants = await tx.tenant.findMany({ where: { plan: payload.plan, deletedAt: null }, select: { id: true } });
      for (const tenant of tenants) await createAuditLog(tx, { ...auditBase, tenantId: tenant.id, entityId: feature.id, oldValues: request.previousValues ?? undefined, newValues: payload });
      return;
    }
    case AdminChangeRequestType.FEATURE_OVERRIDE_UPSERT: {
      const payload = featureOverridePayloadSchema.parse(request.payload);
      const override = await tx.tenantFeatureOverride.upsert({
        where: { tenantId_featureKey: { tenantId: payload.tenantId, featureKey: payload.featureKey } },
        create: { ...payload, expiresAt: null }, update: { ...payload, expiresAt: null },
      });
      await createAuditLog(tx, { ...auditBase, tenantId: payload.tenantId, entityId: override.id, oldValues: request.previousValues ?? undefined, newValues: payload });
      await notifyOwners(tx, payload.tenantId, 'Tenant özellik ayarınız onaylı admin işlemiyle değiştirildi', `Özellik: ${payload.featureKey}`);
      return;
    }
    case AdminChangeRequestType.FEATURE_OVERRIDE_DELETE: {
      const payload = featureOverrideDeletePayloadSchema.parse(request.payload);
      const override = await tx.tenantFeatureOverride.findUnique({ where: { id: payload.overrideId } });
      if (!override || override.tenantId !== payload.tenantId || override.featureKey !== payload.featureKey) {
        throw new AdminChangeRequestError('Kalıcı override talep oluşturulduktan sonra değişmiş veya kaldırılmış.', 409);
      }
      await tx.tenantFeatureOverride.delete({ where: { id: payload.overrideId } });
      await createAuditLog(tx, { ...auditBase, tenantId: payload.tenantId, entityId: payload.overrideId, oldValues: request.previousValues ?? undefined, newValues: { deleted: true, featureKey: payload.featureKey } });
      await notifyOwners(tx, payload.tenantId, 'Tenant özellik ayarınız onaylı admin işlemiyle kaldırıldı', `Özellik: ${payload.featureKey}`);
      return;
    }
  }
}

async function notifyOwners(tx: TransactionClient, tenantId: string, title: string, message: string): Promise<void> {
  const owners = await tx.tenantUser.findMany({ where: { tenantId, isOwner: true, isActive: true }, select: { userId: true } });
  if (owners.length === 0) return;
  await tx.notification.createMany({ data: owners.map(({ userId }) => ({
    tenantId, userId, title, message, module: 'admin', entityType: EntityType.OTHER, entityId: tenantId,
  })) });
}

export async function approveAdminChange(id: string, approverId: string, permissions: readonly AdminPermission[], note?: string): Promise<AdminChangeRequest> {
  return prisma.$transaction(async (tx) => {
    const request = await tx.adminChangeRequest.findUnique({ where: { id }, include: requestInclude });
    if (!request) throw new AdminChangeRequestError('Değişiklik talebi bulunamadı.', 404);
    if (request.status !== AdminChangeRequestStatus.PENDING) throw new AdminChangeRequestError('Yalnızca bekleyen talepler onaylanabilir.', 409);
    if (request.requestedById === approverId) throw new AdminChangeRequestError('Talebi oluşturan admin kendi talebini onaylayamaz.', 403);
    if (!isAdminPermission(request.requiredPermission) || !permissions.includes(request.requiredPermission)) {
      throw new AdminChangeRequestError('Bu talebi onaylama yetkiniz bulunmuyor.', 403);
    }
    const claimed = await tx.adminChangeRequest.updateMany({
      where: { id, status: AdminChangeRequestStatus.PENDING },
      data: { status: AdminChangeRequestStatus.APPROVED, decidedById: approverId, decisionNote: note, decidedAt: new Date() },
    });
    if (claimed.count !== 1) throw new AdminChangeRequestError('Talep başka bir admin tarafından işleme alındı.', 409);
    await applyChange(tx, request, approverId);
    const applied = await tx.adminChangeRequest.update({
      where: { id }, data: { status: AdminChangeRequestStatus.APPLIED, decidedById: approverId, decisionNote: note, decidedAt: new Date(), appliedAt: new Date() },
      include: requestInclude,
    });
    return toContract(applied);
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function rejectAdminChange(id: string, approverId: string, permissions: readonly AdminPermission[], note?: string): Promise<AdminChangeRequest> {
  return prisma.$transaction(async (tx) => {
    const request = await tx.adminChangeRequest.findUnique({ where: { id }, include: requestInclude });
    if (!request) throw new AdminChangeRequestError('Değişiklik talebi bulunamadı.', 404);
    if (request.status !== AdminChangeRequestStatus.PENDING) throw new AdminChangeRequestError('Yalnızca bekleyen talepler reddedilebilir.', 409);
    if (request.requestedById === approverId) throw new AdminChangeRequestError('Talebi oluşturan admin kendi talebini reddedemez.', 403);
    if (!isAdminPermission(request.requiredPermission) || !permissions.includes(request.requiredPermission) || !permissions.includes('change-request.reject')) {
      throw new AdminChangeRequestError('Bu talebi reddetme yetkiniz bulunmuyor.', 403);
    }
    const rejected = await tx.adminChangeRequest.update({
      where: { id }, data: { status: AdminChangeRequestStatus.REJECTED, decidedById: approverId, decisionNote: note, decidedAt: new Date() }, include: requestInclude,
    });
    return toContract(rejected);
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}
