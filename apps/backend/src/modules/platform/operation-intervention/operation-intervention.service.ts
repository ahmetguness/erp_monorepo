import { AuditAction, EntityType } from "@prisma/client";
import type {
  OperationInterventionAction,
  OperationInterventionPreview,
  OperationItemDetail,
  OperationItemKind,
} from "@repo/types";
import { BaseError } from "../../../errors/index.js";
import { prisma } from "../../../lib/prisma.js";
import { createAuditLog } from "../../../utils/audit.js";
import { maskOperationPayload } from "./pii-masker.js";

const EVENT_MAX_ATTEMPTS = 5;
type ItemRef = { id: string; kind: OperationItemKind };
type LoadedItem = {
  id: string;
  kind: OperationItemKind;
  tenantId: string;
  name: string;
  status: string;
  attempts: number;
  maxAttempts: number;
  idempotencyKey: string;
  payload: unknown;
  context: unknown;
  lastError: string | null;
  nextRetryAt: Date | null;
  quarantinedAt: Date | null;
  quarantinedById: string | null;
  resolvedAt: Date | null;
  resolvedById: string | null;
  resolutionNote: string | null;
  updatedAt: Date;
};

export class OperationInterventionError extends BaseError {
  constructor(message: string, status: 400 | 404 | 409 = 409) {
    super(message, status, "OPERATION_INTERVENTION_ERROR");
  }
}

async function loadItem(ref: ItemRef): Promise<LoadedItem> {
  if (ref.kind === "DOMAIN_EVENT") {
    const row = await prisma.domainEventOutbox.findFirst({
      where: { id: ref.id, tenantId: { not: "" } },
    });
    if (!row)
      throw new OperationInterventionError("Domain event bulunamadı.", 404);
    return {
      id: row.id,
      kind: ref.kind,
      tenantId: row.tenantId,
      name: row.name,
      status: row.status,
      attempts: row.attempts,
      maxAttempts: EVENT_MAX_ATTEMPTS,
      idempotencyKey: row.idempotencyKey,
      payload: row.payload,
      context: row.context,
      lastError: row.lastError,
      nextRetryAt: row.nextRetryAt,
      quarantinedAt: row.quarantinedAt,
      quarantinedById: row.quarantinedById,
      resolvedAt: row.resolvedAt,
      resolvedById: row.resolvedById,
      resolutionNote: row.resolutionNote,
      updatedAt: row.updatedAt,
    };
  }
  const row = await prisma.marketplaceSyncJob.findFirst({
    where: { id: ref.id, tenantId: { not: "" } },
  });
  if (!row) throw new OperationInterventionError("Worker job bulunamadı.", 404);
  return {
    id: row.id,
    kind: ref.kind,
    tenantId: row.tenantId,
    name: row.jobType,
    status: row.status,
    attempts: row.attempts,
    maxAttempts: row.maxAttempts,
    idempotencyKey: `marketplace-job:${row.id}`,
    payload: row.params,
    context: row.result,
    lastError: row.errorMessage,
    nextRetryAt: row.nextRetryAt,
    quarantinedAt: row.quarantinedAt,
    quarantinedById: row.quarantinedById,
    resolvedAt: row.resolvedAt,
    resolvedById: row.resolvedById,
    resolutionNote: row.resolutionNote,
    updatedAt: row.updatedAt,
  };
}

function eligibility(item: LoadedItem, action: OperationInterventionAction) {
  if (item.resolvedAt)
    return { allowed: false, reason: "Kayıt daha önce çözüldü." };
  if (action === "RETRY") {
    if (item.quarantinedAt)
      return {
        allowed: false,
        reason: "Karantinadaki kayıt yeniden denenemez.",
      };
    if (!["FAILED", "DEAD_LETTER"].includes(item.status))
      return {
        allowed: false,
        reason: "Yalnızca başarısız kayıt yeniden denenebilir.",
      };
    if (item.attempts >= item.maxAttempts)
      return { allowed: false, reason: "Maksimum deneme sınırına ulaşıldı." };
  }
  if (
    action === "QUARANTINE" &&
    !["FAILED", "DEAD_LETTER"].includes(item.status)
  )
    return {
      allowed: false,
      reason: "Yalnızca başarısız kayıt karantinaya alınabilir.",
    };
  if (action === "RESOLVE" && item.status !== "DEAD_LETTER")
    return {
      allowed: false,
      reason: "Yalnızca dead-letter kayıt çözülebilir.",
    };
  return { allowed: true, reason: "İşlem güvenli biçimde uygulanabilir." };
}

export async function getOperationItem(
  ref: ItemRef,
): Promise<OperationItemDetail> {
  const item = await loadItem(ref);
  return {
    ...item,
    payload: maskOperationPayload(item.payload),
    context: maskOperationPayload(item.context),
    nextRetryAt: item.nextRetryAt?.toISOString() ?? null,
    quarantinedAt: item.quarantinedAt?.toISOString() ?? null,
    resolvedAt: item.resolvedAt?.toISOString() ?? null,
    updatedAt: item.updatedAt.toISOString(),
  };
}

export async function previewOperationIntervention(
  items: ItemRef[],
  action: OperationInterventionAction,
): Promise<OperationInterventionPreview> {
  const unique = [
    ...new Map(items.map((item) => [`${item.kind}:${item.id}`, item])).values(),
  ];
  const loaded = await Promise.all(unique.map(loadItem));
  const previews = loaded.map((item) => {
    const result = eligibility(item, action);
    return {
      id: item.id,
      kind: item.kind,
      ...result,
      nextAttempt: item.attempts + 1,
    };
  });
  return {
    allowed: previews.every((item) => item.allowed),
    action,
    items: previews,
  };
}

async function applyItem(
  item: LoadedItem,
  action: OperationInterventionAction,
  adminId: string,
  reason: string,
): Promise<void> {
  const allowed = eligibility(item, action);
  if (!allowed.allowed)
    throw new OperationInterventionError(`${item.id}: ${allowed.reason}`);
  const now = new Date();
  const common =
    action === "RETRY"
      ? {
          status: "PENDING" as const,
          nextRetryAt: now,
          leaseOwner: null,
          leaseExpiresAt: null,
          resolvedAt: null,
          resolvedById: null,
          resolutionNote: null,
        }
      : action === "QUARANTINE"
        ? {
            status: "DEAD_LETTER" as const,
            nextRetryAt: null,
            leaseOwner: null,
            leaseExpiresAt: null,
            quarantinedAt: now,
            quarantinedById: adminId,
          }
        : {
            resolvedAt: now,
            resolvedById: adminId,
            resolutionNote: reason,
            nextRetryAt: null,
          };
  const updated =
    item.kind === "DOMAIN_EVENT"
      ? await prisma.domainEventOutbox.updateMany({
          where: {
            id: item.id,
            tenantId: item.tenantId,
            updatedAt: item.updatedAt,
          },
          data: common,
        })
      : await prisma.marketplaceSyncJob.updateMany({
          where: {
            id: item.id,
            tenantId: item.tenantId,
            updatedAt: item.updatedAt,
          },
          data: common,
        });
  if (updated.count !== 1)
    throw new OperationInterventionError(
      "Kayıt eşzamanlı olarak değişti; listeyi yenileyin.",
    );
  await createAuditLog(prisma, {
    tenantId: item.tenantId,
    adminId,
    module: "OPERATION_INTERVENTION",
    entityType: EntityType.OTHER,
    entityId: item.id,
    action: AuditAction.UPDATE,
    reason,
    oldValues: {
      kind: item.kind,
      status: item.status,
      attempts: item.attempts,
    },
    newValues: {
      intervention: action,
      dryRun: false,
      idempotencyKey: item.idempotencyKey,
    },
  });
}

export async function interveneOperations(
  input: {
    items: ItemRef[];
    action: OperationInterventionAction;
    reason: string;
    dryRun: boolean;
  },
  adminId: string,
): Promise<OperationInterventionPreview> {
  const uniqueItems = [
    ...new Map(
      input.items.map((item) => [`${item.kind}:${item.id}`, item]),
    ).values(),
  ];
  const preview = await previewOperationIntervention(uniqueItems, input.action);
  if (input.dryRun) return preview;
  if (!preview.allowed)
    throw new OperationInterventionError(
      "Bir veya daha fazla kayıt müdahaleye uygun değil.",
    );
  const loaded = await Promise.all(uniqueItems.map(loadItem));
  for (const item of loaded)
    await applyItem(item, input.action, adminId, input.reason);
  return preview;
}
