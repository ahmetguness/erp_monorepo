import {
  AdminChangeRequestStatus,
  AdminChangeRequestType,
  AuditAction,
  EntityType,
  Prisma,
} from "@prisma/client";
import {
  isAdminPermission,
  type AdminChangeRequest,
  type AdminPermission,
} from "@repo/types";
import { prisma } from "../../../lib/prisma.js";
import { createAuditLog } from "../../../utils/audit.js";
import { modulesForPrismaPlan } from "../../../utils/tenant-modules.js";
import { PlanChangeExperienceService } from "../../../services/plan-change-experience.service.js";
import { BaseError } from "../../../errors/index.js";
import { assertLegacyTenantTransition } from "../tenant-lifecycle/tenant-lifecycle.policy.js";
import { syncSubscriptionForPlan } from "../subscription-operations/subscription-operations.service.js";
import {
  featureOverrideDeletePayloadSchema,
  featureOverridePayloadSchema,
  planFeaturePayloadSchema,
  tenantPlanPayloadSchema,
  tenantStatusPayloadSchema,
} from "./admin-change-request.schemas.js";

type TransactionClient = Prisma.TransactionClient;
type RequestWithActors = Prisma.AdminChangeRequestGetPayload<{
  include: {
    requestedBy: { select: { id: true; name: true; email: true } };
    decidedBy: { select: { id: true; name: true; email: true } };
  };
}>;

export class AdminChangeRequestError extends BaseError {
  constructor(message: string, statusCode: 400 | 403 | 404 | 409) {
    super(message, statusCode, "ADMIN_CHANGE_REQUEST_ERROR");
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
  reason: string;
  ticketId?: string;
  rollbackOfId?: string;
}

const actorSelect = { id: true, name: true, email: true } as const;
const requestInclude = {
  requestedBy: { select: actorSelect },
  decidedBy: { select: actorSelect },
} as const;

function toContract(request: RequestWithActors): AdminChangeRequest {
  const payload = request.payload;
  const previousValues = request.previousValues;
  if (!payload || Array.isArray(payload) || typeof payload !== "object")
    throw new Error("Geçersiz değişiklik payload kaydı.");
  if (
    previousValues !== null &&
    (Array.isArray(previousValues) || typeof previousValues !== "object")
  )
    throw new Error("Geçersiz önceki değer kaydı.");
  if (!isAdminPermission(request.requiredPermission))
    throw new Error("Geçersiz onay yetkisi kaydı.");
  return {
    id: request.id,
    type: request.type,
    status: request.status,
    targetId: request.targetId,
    targetLabel: request.targetLabel,
    requiredPermission: request.requiredPermission,
    payload: { ...payload },
    previousValues: previousValues ? { ...previousValues } : null,
    affectedTenantCount: request.affectedTenantCount,
    affectedUserCount: request.affectedUserCount,
    requestedBy: request.requestedBy,
    decidedBy: request.decidedBy,
    decisionNote: request.decisionNote,
    reason: request.reason,
    ticketId: request.ticketId,
    rollbackOfId: request.rollbackOfId,
    canRollback:
      request.status === AdminChangeRequestStatus.APPLIED &&
      request.previousValues !== null &&
      request.type !== AdminChangeRequestType.FEATURE_OVERRIDE_DELETE,
    createdAt: request.createdAt.toISOString(),
    decidedAt: request.decidedAt?.toISOString() ?? null,
    appliedAt: request.appliedAt?.toISOString() ?? null,
  };
}

export async function submitAdminChange(
  input: SubmitChangeInput,
): Promise<AdminChangeRequest> {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.adminChangeRequest.findFirst({
      where: {
        type: input.type,
        targetId: input.targetId,
        status: AdminChangeRequestStatus.PENDING,
      },
      include: requestInclude,
    });
    if (existing) {
      if (existing.requestedById === input.requestedById)
        return toContract(existing);
      throw new AdminChangeRequestError(
        "Bu hedef için başka bir admin tarafından oluşturulmuş bekleyen talep var.",
        409,
      );
    }
    const created = await tx.adminChangeRequest.create({
      data: {
        type: input.type,
        targetId: input.targetId,
        targetLabel: input.targetLabel,
        requiredPermission: input.requiredPermission,
        payload: input.payload,
        previousValues: input.previousValues ?? Prisma.JsonNull,
        affectedTenantCount: input.affectedTenantCount,
        affectedUserCount: input.affectedUserCount,
        requestedById: input.requestedById,
        reason: input.reason,
        ticketId: input.ticketId,
        rollbackOfId: input.rollbackOfId,
      },
      include: requestInclude,
    });
    return toContract(created);
  });
}

export async function listAdminChanges(
  status?: AdminChangeRequestStatus,
): Promise<AdminChangeRequest[]> {
  const requests = await prisma.adminChangeRequest.findMany({
    where: status ? { status } : {},
    include: requestInclude,
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  return requests.map(toContract);
}

async function applyChange(
  tx: TransactionClient,
  request: RequestWithActors,
  approverId: string,
  auditRequestId?: string | null,
): Promise<void> {
  const auditBase = {
    module: "admin-approval",
    entityType: EntityType.OTHER,
    action: AuditAction.UPDATE,
    adminId: approverId,
    reason: request.reason,
    ticketId: request.ticketId,
    requestId: auditRequestId,
    approvalId: request.id,
    rollbackOfId: request.rollbackOfId,
  } as const;
  switch (request.type) {
    case AdminChangeRequestType.TENANT_PLAN_UPDATE: {
      const payload = tenantPlanPayloadSchema.parse(request.payload);
      const current = await tx.tenant.findUniqueOrThrow({
        where: { id: payload.tenantId },
        select: { plan: true },
      });
      const previousPlan =
        request.previousValues &&
        typeof request.previousValues === "object" &&
        !Array.isArray(request.previousValues)
          ? request.previousValues.plan
          : null;
      if (current.plan !== previousPlan)
        throw new AdminChangeRequestError(
          "Tenant planı talep oluşturulduktan sonra değişmiş.",
          409,
        );
      await tx.tenant.update({
        where: { id: payload.tenantId },
        data: {
          plan: payload.plan,
          modules: modulesForPrismaPlan(payload.plan),
          planChangedAt: new Date(),
        },
      });
      await syncSubscriptionForPlan(tx, payload.tenantId, payload.plan);
      await createAuditLog(tx, {
        ...auditBase,
        tenantId: payload.tenantId,
        entityId: payload.tenantId,
        oldValues: request.previousValues ?? undefined,
        newValues: payload,
      });
      await new PlanChangeExperienceService(tx).handlePlanChanged({
        tenantId: payload.tenantId,
        oldPlan: current.plan,
        newPlan: payload.plan,
        changedByUserId: null,
      });
      return;
    }
    case AdminChangeRequestType.TENANT_STATUS_UPDATE: {
      const payload = tenantStatusPayloadSchema.parse(request.payload);
      const current = await tx.tenant.findUniqueOrThrow({
        where: { id: payload.tenantId },
        select: { status: true, lifecycleVersion: true },
      });
      if (!request.rollbackOfId)
        assertLegacyTenantTransition(current.status, payload.status);
      const previousStatus =
        request.previousValues &&
        typeof request.previousValues === "object" &&
        !Array.isArray(request.previousValues)
          ? request.previousValues.status
          : null;
      if (current.status !== previousStatus)
        throw new AdminChangeRequestError(
          "Tenant durumu talep oluşturulduktan sonra değişmiş.",
          409,
        );
      const previousVersion =
        request.previousValues &&
        typeof request.previousValues === "object" &&
        !Array.isArray(request.previousValues)
          ? request.previousValues.lifecycleVersion
          : null;
      if (
        typeof previousVersion === "number" &&
        current.lifecycleVersion !== previousVersion
      ) {
        throw new AdminChangeRequestError(
          "Tenant yaşam döngüsü talep oluşturulduktan sonra değişmiş.",
          409,
        );
      }
      await tx.tenant.update({
        where: { id: payload.tenantId },
        data: { status: payload.status, lifecycleVersion: { increment: 1 } },
      });
      await createAuditLog(tx, {
        ...auditBase,
        tenantId: payload.tenantId,
        entityId: payload.tenantId,
        oldValues: request.previousValues ?? undefined,
        newValues: payload,
      });
      await notifyOwners(
        tx,
        payload.tenantId,
        "Tenant durumunuz onaylı admin işlemiyle değiştirildi",
        `Durum: ${current.status} → ${payload.status}`,
      );
      return;
    }
    case AdminChangeRequestType.PLAN_FEATURE_UPDATE: {
      const payload = planFeaturePayloadSchema.parse(request.payload);
      const feature = await tx.planFeature.upsert({
        where: { plan_key: { plan: payload.plan, key: payload.key } },
        create: payload,
        update: payload,
      });
      const tenants = await tx.tenant.findMany({
        where: { plan: payload.plan, deletedAt: null },
        select: { id: true },
      });
      for (const tenant of tenants)
        await createAuditLog(tx, {
          ...auditBase,
          tenantId: tenant.id,
          entityId: feature.id,
          oldValues: request.previousValues ?? undefined,
          newValues: payload,
        });
      return;
    }
    case AdminChangeRequestType.FEATURE_OVERRIDE_UPSERT: {
      const payload = featureOverridePayloadSchema.parse(request.payload);
      const override = await tx.tenantFeatureOverride.upsert({
        where: {
          tenantId_featureKey: {
            tenantId: payload.tenantId,
            featureKey: payload.featureKey,
          },
        },
        create: { ...payload, expiresAt: null },
        update: { ...payload, expiresAt: null },
      });
      await createAuditLog(tx, {
        ...auditBase,
        tenantId: payload.tenantId,
        entityId: override.id,
        oldValues: request.previousValues ?? undefined,
        newValues: payload,
      });
      await notifyOwners(
        tx,
        payload.tenantId,
        "Tenant özellik ayarınız onaylı admin işlemiyle değiştirildi",
        `Özellik: ${payload.featureKey}`,
      );
      return;
    }
    case AdminChangeRequestType.FEATURE_OVERRIDE_DELETE: {
      const payload = featureOverrideDeletePayloadSchema.parse(request.payload);
      const override = await tx.tenantFeatureOverride.findUnique({
        where: { id: payload.overrideId },
      });
      if (
        !override ||
        override.tenantId !== payload.tenantId ||
        override.featureKey !== payload.featureKey
      ) {
        throw new AdminChangeRequestError(
          "Kalıcı override talep oluşturulduktan sonra değişmiş veya kaldırılmış.",
          409,
        );
      }
      const deleted = await tx.tenantFeatureOverride.deleteMany({
        where: {
          id: payload.overrideId,
          tenantId: payload.tenantId,
          featureKey: payload.featureKey,
        },
      });
      if (deleted.count !== 1) {
        throw new AdminChangeRequestError(
          "Kalıcı override eşzamanlı olarak değişmiş veya kaldırılmış.",
          409,
        );
      }
      await createAuditLog(tx, {
        ...auditBase,
        tenantId: payload.tenantId,
        entityId: payload.overrideId,
        oldValues: request.previousValues ?? undefined,
        newValues: { deleted: true, featureKey: payload.featureKey },
      });
      await notifyOwners(
        tx,
        payload.tenantId,
        "Tenant özellik ayarınız onaylı admin işlemiyle kaldırıldı",
        `Özellik: ${payload.featureKey}`,
      );
      return;
    }
  }
}

async function notifyOwners(
  tx: TransactionClient,
  tenantId: string,
  title: string,
  message: string,
): Promise<void> {
  const owners = await tx.tenantUser.findMany({
    where: { tenantId, isOwner: true, isActive: true },
    select: { userId: true },
  });
  if (owners.length === 0) return;
  await tx.notification.createMany({
    data: owners.map(({ userId }) => ({
      tenantId,
      userId,
      title,
      message,
      module: "admin",
      entityType: EntityType.OTHER,
      entityId: tenantId,
    })),
  });
}

function rollbackPayload(request: RequestWithActors): Prisma.InputJsonObject {
  if (
    !request.previousValues ||
    Array.isArray(request.previousValues) ||
    typeof request.previousValues !== "object"
  ) {
    throw new AdminChangeRequestError(
      "Bu değişiklik güvenli biçimde geri alınamaz.",
      409,
    );
  }
  if (
    !request.payload ||
    Array.isArray(request.payload) ||
    typeof request.payload !== "object"
  ) {
    throw new AdminChangeRequestError("Değişiklik verisi geçersiz.", 409);
  }
  switch (request.type) {
    case AdminChangeRequestType.TENANT_PLAN_UPDATE:
      return {
        tenantId: String(request.payload.tenantId),
        plan: String(request.previousValues.plan),
      };
    case AdminChangeRequestType.TENANT_STATUS_UPDATE:
      return {
        tenantId: String(request.payload.tenantId),
        status: String(request.previousValues.status),
      };
    case AdminChangeRequestType.PLAN_FEATURE_UPDATE:
      return { ...request.previousValues };
    case AdminChangeRequestType.FEATURE_OVERRIDE_UPSERT:
      return {
        ...request.previousValues,
        tenantId: String(request.payload.tenantId),
        featureKey: String(request.payload.featureKey),
      };
    case AdminChangeRequestType.FEATURE_OVERRIDE_DELETE:
      throw new AdminChangeRequestError(
        "Silinen override otomatik geri alınamaz.",
        409,
      );
  }
}

export async function rollbackAdminChange(
  id: string,
  adminId: string,
  permissions: readonly AdminPermission[],
  reason: string,
  ticketId?: string,
  auditRequestId?: string | null,
): Promise<AdminChangeRequest> {
  return prisma.$transaction(
    async (tx) => {
      const original = await tx.adminChangeRequest.findUnique({
        where: { id },
        include: requestInclude,
      });
      if (!original)
        throw new AdminChangeRequestError("Değişiklik talebi bulunamadı.", 404);
      if (original.status !== AdminChangeRequestStatus.APPLIED)
        throw new AdminChangeRequestError(
          "Yalnızca uygulanmış değişiklikler geri alınabilir.",
          409,
        );
      if (
        !isAdminPermission(original.requiredPermission) ||
        !permissions.includes(original.requiredPermission)
      ) {
        throw new AdminChangeRequestError(
          "Bu değişikliği geri alma yetkiniz bulunmuyor.",
          403,
        );
      }
      const payload = rollbackPayload(original);
      let rollbackPayloadValues:
        | Prisma.InputJsonValue
        | typeof Prisma.JsonNull =
        original.payload &&
        !Array.isArray(original.payload) &&
        typeof original.payload === "object"
          ? { ...original.payload }
          : Prisma.JsonNull;
      if (original.type === AdminChangeRequestType.TENANT_STATUS_UPDATE) {
        const tenantId = String(payload.tenantId);
        const current = await tx.tenant.findUnique({
          where: { id: tenantId },
          select: { status: true, lifecycleVersion: true },
        });
        if (!current)
          throw new AdminChangeRequestError("Tenant bulunamadı.", 404);
        rollbackPayloadValues = {
          status: current.status,
          lifecycleVersion: current.lifecycleVersion,
        };
      }
      const rollback: RequestWithActors = await tx.adminChangeRequest.create({
        data: {
          type: original.type,
          status: AdminChangeRequestStatus.APPROVED,
          targetId: original.targetId,
          targetLabel: original.targetLabel,
          requiredPermission: original.requiredPermission,
          payload,
          previousValues: rollbackPayloadValues,
          affectedTenantCount: original.affectedTenantCount,
          affectedUserCount: original.affectedUserCount,
          requestedById: adminId,
          decidedById: adminId,
          decisionNote: "Güvenli geri alma",
          reason,
          ticketId,
          rollbackOfId: original.id,
          decidedAt: new Date(),
        },
        include: requestInclude,
      });
      await applyChange(tx, rollback, adminId, auditRequestId);
      const appliedRollback = await tx.adminChangeRequest.update({
        where: { id: rollback.id },
        data: {
          status: AdminChangeRequestStatus.APPLIED,
          appliedAt: new Date(),
        },
        include: requestInclude,
      });
      await tx.adminChangeRequest.update({
        where: { id: original.id },
        data: { status: AdminChangeRequestStatus.ROLLED_BACK },
      });
      return toContract(appliedRollback);
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}

export async function approveAdminChange(
  id: string,
  approverId: string,
  permissions: readonly AdminPermission[],
  note?: string,
  auditRequestId?: string | null,
): Promise<AdminChangeRequest> {
  return prisma.$transaction(
    async (tx) => {
      const request = await tx.adminChangeRequest.findUnique({
        where: { id },
        include: requestInclude,
      });
      if (!request)
        throw new AdminChangeRequestError("Değişiklik talebi bulunamadı.", 404);
      if (request.status !== AdminChangeRequestStatus.PENDING)
        throw new AdminChangeRequestError(
          "Yalnızca bekleyen talepler onaylanabilir.",
          409,
        );
      if (request.requestedById === approverId)
        throw new AdminChangeRequestError(
          "Talebi oluşturan admin kendi talebini onaylayamaz.",
          403,
        );
      if (
        !isAdminPermission(request.requiredPermission) ||
        !permissions.includes(request.requiredPermission)
      ) {
        throw new AdminChangeRequestError(
          "Bu talebi onaylama yetkiniz bulunmuyor.",
          403,
        );
      }
      const claimed = await tx.adminChangeRequest.updateMany({
        where: { id, status: AdminChangeRequestStatus.PENDING },
        data: {
          status: AdminChangeRequestStatus.APPROVED,
          decidedById: approverId,
          decisionNote: note,
          decidedAt: new Date(),
        },
      });
      if (claimed.count !== 1)
        throw new AdminChangeRequestError(
          "Talep başka bir admin tarafından işleme alındı.",
          409,
        );
      await applyChange(tx, request, approverId, auditRequestId);
      const applied = await tx.adminChangeRequest.update({
        where: { id },
        data: {
          status: AdminChangeRequestStatus.APPLIED,
          decidedById: approverId,
          decisionNote: note,
          decidedAt: new Date(),
          appliedAt: new Date(),
        },
        include: requestInclude,
      });
      return toContract(applied);
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}

export async function rejectAdminChange(
  id: string,
  approverId: string,
  permissions: readonly AdminPermission[],
  note?: string,
): Promise<AdminChangeRequest> {
  return prisma.$transaction(
    async (tx) => {
      const request = await tx.adminChangeRequest.findUnique({
        where: { id },
        include: requestInclude,
      });
      if (!request)
        throw new AdminChangeRequestError("Değişiklik talebi bulunamadı.", 404);
      if (request.status !== AdminChangeRequestStatus.PENDING)
        throw new AdminChangeRequestError(
          "Yalnızca bekleyen talepler reddedilebilir.",
          409,
        );
      if (request.requestedById === approverId)
        throw new AdminChangeRequestError(
          "Talebi oluşturan admin kendi talebini reddedemez.",
          403,
        );
      if (
        !isAdminPermission(request.requiredPermission) ||
        !permissions.includes(request.requiredPermission) ||
        !permissions.includes("change-request.reject")
      ) {
        throw new AdminChangeRequestError(
          "Bu talebi reddetme yetkiniz bulunmuyor.",
          403,
        );
      }
      const rejected = await tx.adminChangeRequest.update({
        where: { id },
        data: {
          status: AdminChangeRequestStatus.REJECTED,
          decidedById: approverId,
          decisionNote: note,
          decidedAt: new Date(),
        },
        include: requestInclude,
      });
      return toContract(rejected);
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}
