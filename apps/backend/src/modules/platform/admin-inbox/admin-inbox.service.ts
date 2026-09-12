import type {
  AdminInboxAction,
  AdminInboxCategory,
  AdminInboxItem,
  AdminInboxPreferences,
  AdminInboxPriority,
  AdminInboxResponse,
  AdminPermission,
} from "@repo/types";
import { ValidationError } from "../../../errors/index.js";
import { prisma } from "../../../lib/prisma.js";
import { runWithTenantIsolationBypass } from "../../../lib/tenant-isolation-context.js";

const defaultPreferences: AdminInboxPreferences = {
  approvals: true,
  security: true,
  incidents: true,
  expirations: true,
};
type InboxScope = "ALL" | "MINE" | "UNASSIGNED";
interface InboxActionInput {
  category: AdminInboxCategory;
  sourceId: string;
  action: AdminInboxAction;
  ownerId?: string;
}

function dueDate(createdAt: Date, hours: number): Date {
  return new Date(createdAt.getTime() + hours * 3_600_000);
}

function severityPriority(value: string): AdminInboxPriority {
  if (value === "CRITICAL" || value === "SEV1" || value === "critical")
    return "CRITICAL";
  if (value === "HIGH" || value === "SEV2" || value === "warning")
    return "HIGH";
  if (value === "MEDIUM" || value === "SEV3") return "MEDIUM";
  return "LOW";
}

function preferenceEnabled(
  category: AdminInboxCategory,
  preferences: AdminInboxPreferences,
): boolean {
  if (category === "APPROVAL") return preferences.approvals;
  if (category === "SECURITY") return preferences.security;
  if (category === "INCIDENT") return preferences.incidents;
  return preferences.expirations;
}

export async function getAdminInbox(
  adminId: string,
  permissions: readonly AdminPermission[],
  scope: InboxScope,
  includeResolved: boolean,
): Promise<AdminInboxResponse> {
  const canApprovals = permissions.includes("change-request.read");
  const canSecurity = permissions.includes("security.read");
  const canIncidents = permissions.includes("operations.read");
  const canFeatureExpirations = permissions.includes("feature.read");
  const canTenantExpirations = permissions.includes("tenant.read");
  const now = new Date();
  const horizon = new Date(now.getTime() + 14 * 86_400_000);

  const [preferenceRow, approvals, findings, incidents, overrides, trials] =
    await runWithTenantIsolationBypass("admin-console", () =>
      Promise.all([
        prisma.adminInboxPreference.findUnique({ where: { adminId } }),
        canApprovals
          ? prisma.adminChangeRequest.findMany({
              where: { status: "PENDING" },
              orderBy: { createdAt: "asc" },
              take: 100,
            })
          : [],
        canSecurity
          ? prisma.platformSecurityFinding.findMany({
              where: { status: { not: "RESOLVED" } },
              orderBy: { lastSeenAt: "desc" },
              take: 100,
            })
          : [],
        canIncidents
          ? prisma.platformIncident.findMany({
              where: { status: { not: "RESOLVED" } },
              orderBy: { createdAt: "asc" },
              take: 100,
            })
          : [],
        canFeatureExpirations
          ? prisma.tenantFeatureOverride.findMany({
              where: { expiresAt: { gt: now, lte: horizon }, isEnabled: true },
              take: 100,
            })
          : [],
        canTenantExpirations
          ? prisma.tenant.findMany({
              where: {
                status: "TRIAL",
                trialEndsAt: { gt: now, lte: horizon },
                deletedAt: null,
              },
              select: {
                id: true,
                companyName: true,
                trialEndsAt: true,
                createdAt: true,
              },
              take: 100,
            })
          : [],
      ]),
    );
  const preferences: AdminInboxPreferences = preferenceRow
    ? {
        approvals: preferenceRow.approvals,
        security: preferenceRow.security,
        incidents: preferenceRow.incidents,
        expirations: preferenceRow.expirations,
      }
    : defaultPreferences;

  const raw: Array<
    Omit<AdminInboxItem, "ownerId" | "readAt" | "resolvedAt" | "overdue">
  > = [
    ...approvals.map((item) => ({
      id: `APPROVAL:${item.id}`,
      sourceId: item.id,
      category: "APPROVAL" as const,
      priority:
        item.affectedTenantCount > 10 ? ("HIGH" as const) : ("MEDIUM" as const),
      title: `Onay bekliyor: ${item.targetLabel}`,
      description: item.reason,
      href: `/admin/change-requests?requestId=${item.id}`,
      dueAt: dueDate(item.createdAt, 24).toISOString(),
      createdAt: item.createdAt.toISOString(),
    })),
    ...findings.map((item) => ({
      id: `SECURITY:${item.id}`,
      sourceId: item.id,
      category: "SECURITY" as const,
      priority: severityPriority(item.severity),
      title: item.title,
      description: item.remediation,
      href: "/admin/security",
      dueAt: dueDate(
        item.lastSeenAt,
        item.severity === "CRITICAL" ? 4 : 24,
      ).toISOString(),
      createdAt: item.firstSeenAt.toISOString(),
    })),
    ...incidents.map((item) => ({
      id: `INCIDENT:${item.id}`,
      sourceId: item.id,
      category: "INCIDENT" as const,
      priority: severityPriority(item.severity),
      title: item.title,
      description: item.summary,
      href: "/admin/observability?tab=historical",
      dueAt: dueDate(
        item.createdAt,
        item.severity === "SEV1" ? 1 : 4,
      ).toISOString(),
      createdAt: item.createdAt.toISOString(),
    })),
    ...overrides.map((item) => ({
      id: `EXPIRATION:${item.id}`,
      sourceId: item.id,
      category: "EXPIRATION" as const,
      priority: "MEDIUM" as const,
      title: `Override süresi doluyor: ${item.featureKey}`,
      description: item.reason ?? "Geçici özellik override kaydı",
      href: "/admin/features",
      dueAt: item.expiresAt?.toISOString() ?? null,
      createdAt: item.createdAt.toISOString(),
    })),
    ...trials.map((item) => ({
      id: `EXPIRATION:trial-${item.id}`,
      sourceId: `trial-${item.id}`,
      category: "EXPIRATION" as const,
      priority: "HIGH" as const,
      title: `Deneme süresi bitiyor: ${item.companyName}`,
      description:
        "Tenant deneme süresi için satış veya yaşam döngüsü aksiyonu gerekli.",
      href: `/admin/tenants/${item.id}/subscription`,
      dueAt: item.trialEndsAt?.toISOString() ?? null,
      createdAt: item.createdAt.toISOString(),
    })),
  ].filter((item) => preferenceEnabled(item.category, preferences));

  const sourceFilters = raw.map((item) => ({
    sourceType: item.category,
    sourceId: item.sourceId,
  }));
  const [readStates, taskStates] =
    sourceFilters.length === 0
      ? [[], []]
      : await Promise.all([
          prisma.adminInboxItemState.findMany({
            where: { adminId, OR: sourceFilters },
          }),
          prisma.adminInboxTaskState.findMany({ where: { OR: sourceFilters } }),
        ]);
  const readStateMap = new Map(
    readStates.map((state) => [`${state.sourceType}:${state.sourceId}`, state]),
  );
  const taskStateMap = new Map(
    taskStates.map((state) => [`${state.sourceType}:${state.sourceId}`, state]),
  );
  const items: AdminInboxItem[] = raw
    .map((item) => {
      const readState = readStateMap.get(item.id);
      const taskState = taskStateMap.get(item.id);
      return {
        ...item,
        ownerId: taskState?.ownerId ?? null,
        readAt: readState?.readAt?.toISOString() ?? null,
        resolvedAt: taskState?.resolvedAt?.toISOString() ?? null,
        overdue: item.dueAt !== null && new Date(item.dueAt) < now,
      };
    })
    .filter(
      (item) =>
        (includeResolved || !item.resolvedAt) &&
        (scope === "ALL" ||
          (scope === "MINE"
            ? item.ownerId === adminId
            : item.ownerId === null)),
    );
  const rank: Record<AdminInboxPriority, number> = {
    CRITICAL: 0,
    HIGH: 1,
    MEDIUM: 2,
    LOW: 3,
  };
  items.sort(
    (a, b) =>
      rank[a.priority] - rank[b.priority] ||
      (a.dueAt ?? "9999").localeCompare(b.dueAt ?? "9999"),
  );
  return {
    items,
    unreadCount: items.filter((item) => !item.readAt).length,
    overdueCount: items.filter((item) => item.overdue).length,
    preferences,
  };
}

export async function updateInboxItem(
  adminId: string,
  input: InboxActionInput,
): Promise<void> {
  if (input.action === "ASSIGN") {
    const owner = await prisma.adminUser.findFirst({
      where: { id: input.ownerId, isActive: true },
      select: { id: true },
    });
    if (!owner) throw new ValidationError("Aktif görev sahibi bulunamadı.");
  }
  const now = new Date();
  if (input.action === "READ" || input.action === "UNREAD") {
    await prisma.adminInboxItemState.upsert({
      where: {
        adminId_sourceType_sourceId: {
          adminId,
          sourceType: input.category,
          sourceId: input.sourceId,
        },
      },
      create: {
        adminId,
        sourceType: input.category,
        sourceId: input.sourceId,
        readAt: input.action === "READ" ? now : null,
      },
      update: { readAt: input.action === "READ" ? now : null },
    });
    return;
  }
  await prisma.adminInboxTaskState.upsert({
    where: {
      sourceType_sourceId: {
        sourceType: input.category,
        sourceId: input.sourceId,
      },
    },
    create: {
      sourceType: input.category,
      sourceId: input.sourceId,
      ownerId: input.action === "ASSIGN" ? input.ownerId : null,
      resolvedAt: input.action === "RESOLVE" ? now : null,
    },
    update: {
      ...(input.action === "ASSIGN" ? { ownerId: input.ownerId } : {}),
      ...(input.action === "RESOLVE" ? { resolvedAt: now } : {}),
      ...(input.action === "REOPEN" ? { resolvedAt: null } : {}),
    },
  });
  if (input.action === "RESOLVE") {
    await prisma.adminInboxItemState.upsert({
      where: {
        adminId_sourceType_sourceId: {
          adminId,
          sourceType: input.category,
          sourceId: input.sourceId,
        },
      },
      create: {
        adminId,
        sourceType: input.category,
        sourceId: input.sourceId,
        readAt: now,
      },
      update: { readAt: now },
    });
  }
}

export async function updateInboxPreferences(
  adminId: string,
  input: AdminInboxPreferences,
): Promise<void> {
  await prisma.adminInboxPreference.upsert({
    where: { adminId },
    create: { adminId, ...input },
    update: input,
  });
}
