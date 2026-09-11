import { AuditAction, EntityType, FeatureKey, Prisma } from "@prisma/client";
import type {
  FeatureEnvironment,
  FeatureRollout,
  FeatureRolloutStage,
  FeatureRolloutStatus,
} from "@repo/types";
import { BaseError } from "../../../errors/index.js";
import { prisma } from "../../../lib/prisma.js";
import { createAuditLog } from "../../../utils/audit.js";
import type { z } from "zod";
import type { createFeatureRolloutSchema } from "./feature-rollout.schemas.js";

export class FeatureRolloutError extends BaseError {
  constructor(message: string, status: 400 | 404 | 409 = 409) {
    super(message, status, "FEATURE_ROLLOUT_ERROR");
  }
}

const environments = new Set<FeatureEnvironment>([
  "DEVELOPMENT",
  "STAGING",
  "PRODUCTION",
]);
const stages = new Set<FeatureRolloutStage>([
  "DEVELOPMENT",
  "INTERNAL",
  "PILOT",
  "PERCENTAGE",
  "GENERAL",
]);
const statuses = new Set<FeatureRolloutStatus>([
  "DRAFT",
  "PENDING_APPROVAL",
  "ACTIVE",
  "PAUSED",
  "COMPLETED",
  "ROLLED_BACK",
]);
const checked = <T extends string>(
  value: string,
  values: ReadonlySet<T>,
  label: string,
): T => {
  if (!values.has(value as T))
    throw new FeatureRolloutError(`${label} değeri bozuk.`);
  return value as T;
};
const mapRollout = (
  row: Prisma.FeatureRolloutGetPayload<Record<string, never>>,
): FeatureRollout => ({
  id: row.id,
  plan: row.plan,
  featureKey: row.featureKey,
  version: row.version,
  environment: checked(row.environment, environments, "Ortam"),
  stage: checked(row.stage, stages, "Aşama"),
  status: checked(row.status, statuses, "Durum"),
  value: row.value,
  isEnabled: row.isEnabled,
  rolloutPercentage: row.rolloutPercentage,
  targetTenantIds: row.targetTenantIds,
  dependencies: row.dependencies.map((key) =>
    checked(key, new Set(Object.values(FeatureKey)), "Bağımlılık"),
  ),
  conflicts: row.conflicts.map((key) =>
    checked(key, new Set(Object.values(FeatureKey)), "Çakışma"),
  ),
  startsAt: row.startsAt.toISOString(),
  endsAt: row.endsAt?.toISOString() ?? null,
  errorThresholdPct: row.errorThresholdPct.toNumber(),
  observedErrorRatePct: row.observedErrorRatePct?.toNumber() ?? null,
  killSwitch: row.killSwitch,
  reason: row.reason,
  createdById: row.createdById,
  activatedById: row.activatedById,
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
});

export async function listFeatureRollouts(): Promise<FeatureRollout[]> {
  const now = new Date();
  await prisma.featureRollout.updateMany({
    where: { status: "ACTIVE", endsAt: { lte: now } },
    data: { status: "COMPLETED" },
  });
  return (
    await prisma.featureRollout.findMany({ orderBy: [{ createdAt: "desc" }] })
  ).map(mapRollout);
}

export async function createFeatureRollout(
  adminId: string,
  input: z.infer<typeof createFeatureRolloutSchema>,
): Promise<FeatureRollout> {
  if (input.endsAt && input.endsAt <= input.startsAt)
    throw new FeatureRolloutError(
      "Bitiş tarihi başlangıçtan sonra olmalıdır.",
      400,
    );
  if (
    input.dependencies.includes(input.featureKey) ||
    input.conflicts.includes(input.featureKey)
  )
    throw new FeatureRolloutError(
      "Feature kendisine bağımlı veya kendisiyle çakışan olamaz.",
      400,
    );
  if (input.dependencies.some((key) => input.conflicts.includes(key)))
    throw new FeatureRolloutError(
      "Aynı feature bağımlılık ve çakışma listesinde olamaz.",
      400,
    );
  if (input.stage === "GENERAL" && input.rolloutPercentage !== 100)
    throw new FeatureRolloutError(
      "Genel kullanım aşaması yüzde 100 olmalıdır.",
      400,
    );
  if (
    ["INTERNAL", "PILOT"].includes(input.stage) &&
    input.targetTenantIds.length === 0
  )
    throw new FeatureRolloutError(
      "Hedefli aşamada en az bir tenant seçilmelidir.",
      400,
    );
  const targetTenantIds = [...new Set(input.targetTenantIds)];
  if (targetTenantIds.length > 0) {
    const validTargets = await prisma.tenant.count({
      where: { id: { in: targetTenantIds }, plan: input.plan, deletedAt: null },
    });
    if (validTargets !== targetTenantIds.length)
      throw new FeatureRolloutError(
        "Hedef tenantlardan biri bulunamadı veya seçilen planda değil.",
        400,
      );
  }
  const version =
    (
      await prisma.featureRollout.aggregate({
        where: {
          plan: input.plan,
          featureKey: input.featureKey,
          environment: input.environment,
        },
        _max: { version: true },
      })
    )._max.version ?? 0;
  return mapRollout(
    await prisma.featureRollout.create({
      data: {
        ...input,
        targetTenantIds,
        endsAt: input.endsAt ?? null,
        version: version + 1,
        createdById: adminId,
      },
    }),
  );
}

export async function markRolloutPending(id: string): Promise<void> {
  const updated = await prisma.featureRollout.updateMany({
    where: { id, status: "DRAFT" },
    data: { status: "PENDING_APPROVAL" },
  });
  if (updated.count !== 1)
    throw new FeatureRolloutError(
      "Yalnızca taslak rollout onaya gönderilebilir.",
    );
}

export async function stopFeatureRollout(
  id: string,
  adminId: string,
  reason: string,
  killSwitch: boolean,
): Promise<FeatureRollout> {
  const row = await prisma.featureRollout.findUnique({ where: { id } });
  if (!row) throw new FeatureRolloutError("Rollout bulunamadı.", 404);
  const result = await prisma.featureRollout.update({
    where: { id },
    data: { status: "PAUSED", killSwitch, pausedAt: new Date() },
  });
  const tenants = await prisma.tenant.findMany({
    where: { plan: row.plan, deletedAt: null },
    select: { id: true },
  });
  for (const tenant of tenants)
    await createAuditLog(prisma, {
      tenantId: tenant.id,
      adminId,
      module: "FEATURE_ROLLOUT",
      entityType: EntityType.OTHER,
      entityId: id,
      action: AuditAction.UPDATE,
      reason,
      newValues: { status: "PAUSED", killSwitch },
    });
  return mapRollout(result);
}

export async function reportRolloutMetric(
  id: string,
  errorRatePct: number,
  adminId: string,
): Promise<FeatureRollout> {
  const row = await prisma.featureRollout.findUnique({ where: { id } });
  if (!row) throw new FeatureRolloutError("Rollout bulunamadı.", 404);
  if (row.status !== "ACTIVE")
    throw new FeatureRolloutError(
      "Yalnızca aktif rollout metriği güncellenebilir.",
    );
  if (new Prisma.Decimal(errorRatePct).gt(row.errorThresholdPct)) {
    const rolledBack = await prisma.$transaction(async (tx) => {
      const current = await tx.featureRollout.update({
        where: { id },
        data: {
          status: "ROLLED_BACK",
          observedErrorRatePct: errorRatePct,
          pausedAt: new Date(),
        },
      });
      const previous = await tx.featureRollout.findFirst({
        where: {
          plan: row.plan,
          featureKey: row.featureKey,
          environment: row.environment,
          version: { lt: row.version },
          status: "ROLLED_BACK",
          killSwitch: false,
        },
        orderBy: { version: "desc" },
      });
      if (previous)
        await tx.featureRollout.update({
          where: { id: previous.id },
          data: {
            status: "ACTIVE",
            activatedAt: new Date(),
            activatedById: adminId,
          },
        });
      return current;
    });
    const tenants = await prisma.tenant.findMany({
      where: { plan: row.plan, deletedAt: null },
      select: { id: true },
    });
    for (const tenant of tenants)
      await createAuditLog(prisma, {
        tenantId: tenant.id,
        adminId,
        module: "FEATURE_ROLLOUT",
        entityType: EntityType.OTHER,
        entityId: id,
        action: AuditAction.UPDATE,
        reason: `Hata oranı eşiği aşıldı: %${errorRatePct}`,
        newValues: { status: "ROLLED_BACK", observedErrorRatePct: errorRatePct },
      });
    return mapRollout(rolledBack);
  }
  return mapRollout(
    await prisma.featureRollout.update({
      where: { id },
      data: { observedErrorRatePct: errorRatePct },
    }),
  );
}
