import { Prisma } from "@prisma/client";
import type { AlertHistoryItem, CentralLogEntry, DeploymentMarker, ObservabilityPoint, ObservabilityRange, ObservabilityScope, PersistentObservabilityDashboard, SloDefinition, SloStatus } from "@repo/types";
import { prisma } from "../../../lib/prisma.js";
import type { ObservabilitySnapshot } from "../../../services/observability.service.js";
import { maskOperationPayload } from "../operation-intervention/pii-masker.js";

const RANGE_MS: Record<ObservabilityRange, number> = { "1h": 3600000, "24h": 86400000, "7d": 604800000, "30d": 2592000000 };
const bucketMinute = (date: Date) => new Date(Math.floor(date.getTime() / 60000) * 60000);
const scope = (value: string): ObservabilityScope => value === "TENANT" ? "TENANT" : "SERVICE";

export async function capturePersistentSnapshot(snapshot: ObservabilitySnapshot, serviceId = "backend"): Promise<void> {
  const bucketAt = bucketMinute(new Date(snapshot.runtime.generatedAt));
  const points = [
    ["availability_pct", Math.max(0, 100 - snapshot.http.errorRatePct)],
    ["http_error_rate_pct", snapshot.http.errorRatePct],
    ["http_p95_ms", snapshot.http.p95Ms],
    ["queue_health_pct", snapshot.domainEvents.deadLetterCount + snapshot.workerJobs.deadLetterCount > 0 ? 0 : 100],
  ] as const;
  for (const [metricKey, value] of points) await prisma.observabilityMetricPoint.upsert({
    where: { metricKey_scope_scopeId_bucketAt: { metricKey, scope: "SERVICE", scopeId: serviceId, bucketAt } },
    create: { metricKey, scope: "SERVICE", scopeId: serviceId, value, bucketAt }, update: { value },
  });
  const [tenants, failedEvents, failedJobs] = await Promise.all([
    prisma.tenant.findMany({ where: { deletedAt: null }, select: { id: true }, take: 5000 }),
    prisma.domainEventOutbox.groupBy({
      by: ["tenantId"],
      where: { tenantId: { not: "" }, resolvedAt: null, status: { in: ["FAILED", "DEAD_LETTER"] } },
    }),
    prisma.marketplaceSyncJob.groupBy({
      by: ["tenantId"],
      where: { tenantId: { not: "" }, resolvedAt: null, status: { in: ["FAILED", "DEAD_LETTER"] } },
    }),
  ]);
  const unhealthyTenantIds = new Set([
    ...failedEvents.map((item) => item.tenantId),
    ...failedJobs.map((item) => item.tenantId),
  ]);
  await prisma.observabilityMetricPoint.createMany({
    data: tenants.map((tenant) => ({ metricKey: "operation_health_pct", scope: "TENANT", scopeId: tenant.id, value: unhealthyTenantIds.has(tenant.id) ? 0 : 100, bucketAt })),
    skipDuplicates: true,
  });
  for (const alert of snapshot.alerts) {
    const fingerprint = `SERVICE:${serviceId}:${alert.key}`;
    const open = await prisma.observabilityAlertHistory.findFirst({ where: { fingerprint, status: "OPEN" }, orderBy: { openedAt: "desc" } });
    if (alert.active) {
      if (open) await prisma.observabilityAlertHistory.update({ where: { id: open.id }, data: { value: alert.value, threshold: alert.threshold, severity: alert.severity } });
      else await prisma.observabilityAlertHistory.create({ data: {
        fingerprint, metricKey: alert.key, scope: "SERVICE", scopeId: serviceId, severity: alert.severity,
        value: alert.value, threshold: alert.threshold, owner: "platform-operations",
        runbookUrl: `https://runbooks.local/${alert.key}`, notificationChannel: "ops-alerts",
      } });
    } else if (open) await prisma.observabilityAlertHistory.update({ where: { id: open.id }, data: { status: "RESOLVED", resolvedAt: new Date(), value: alert.value } });
  }
  for (const entry of snapshot.http.recentErrors) {
    const fingerprint = `${serviceId}:${entry.requestId}:${entry.occurredAt}`;
    const maskedMessage = maskOperationPayload(entry.message);
    const message = typeof maskedMessage === "string" ? maskedMessage : "[masked]";
    await prisma.observabilityLogEntry.upsert({
      where: { fingerprint },
      create: { fingerprint, level: "ERROR", service: serviceId, message, requestId: entry.requestId, correlationId: entry.correlationId, occurredAt: new Date(entry.occurredAt) },
      update: { message },
    });
  }
}

const mapSlo = (row: { id: string; name: string; scope: string; scopeId: string; metricKey: string; targetPercentage: Prisma.Decimal; windowDays: number; owner: string; runbookUrl: string; notificationChannel: string; isEnabled: boolean }): SloDefinition => ({
  id: row.id, name: row.name, scope: scope(row.scope), scopeId: row.scopeId, metricKey: row.metricKey,
  targetPercentage: row.targetPercentage.toNumber(), windowDays: row.windowDays, owner: row.owner,
  runbookUrl: row.runbookUrl, notificationChannel: row.notificationChannel, isEnabled: row.isEnabled,
});
const mapAlert = (row: Prisma.ObservabilityAlertHistoryGetPayload<Record<string, never>>): AlertHistoryItem => ({
  id: row.id, metricKey: row.metricKey, scope: scope(row.scope), scopeId: row.scopeId,
  severity: row.severity === "critical" ? "critical" : "warning", status: row.status === "RESOLVED" ? "RESOLVED" : "OPEN",
  value: row.value.toNumber(), threshold: row.threshold.toNumber(), owner: row.owner, runbookUrl: row.runbookUrl,
  notificationChannel: row.notificationChannel, silencedUntil: row.silencedUntil?.toISOString() ?? null,
  openedAt: row.openedAt.toISOString(), resolvedAt: row.resolvedAt?.toISOString() ?? null,
});

export async function getPersistentDashboard(range: ObservabilityRange): Promise<PersistentObservabilityDashboard> {
  const since = new Date(Date.now() - RANGE_MS[range]);
  const [points, slos, alerts, deployments, logs] = await Promise.all([
    prisma.observabilityMetricPoint.findMany({ where: { bucketAt: { gte: since } }, orderBy: { bucketAt: "asc" }, take: 20000 }),
    prisma.observabilitySlo.findMany({ where: { isEnabled: true }, orderBy: { name: "asc" } }),
    prisma.observabilityAlertHistory.findMany({ where: { OR: [{ openedAt: { gte: since } }, { status: "OPEN" }] }, orderBy: { openedAt: "desc" }, take: 200 }),
    prisma.deploymentMarker.findMany({ where: { deployedAt: { gte: since } }, orderBy: { deployedAt: "desc" }, take: 200 }),
    prisma.observabilityLogEntry.findMany({ where: { occurredAt: { gte: since } }, orderBy: { occurredAt: "desc" }, take: 200 }),
  ]);
  const sloStatuses: SloStatus[] = await Promise.all(slos.map(async (row) => {
    const definition = mapSlo(row);
    const samples = await prisma.observabilityMetricPoint.findMany({ where: {
      metricKey: row.metricKey, scope: row.scope, scopeId: row.scopeId,
      bucketAt: { gte: new Date(Date.now() - row.windowDays * 86400000) },
    }, select: { value: true } });
    const sliPercentage = samples.length ? samples.reduce((sum, item) => sum + item.value.toNumber(), 0) / samples.length : 0;
    const budget = 100 - definition.targetPercentage;
    const consumed = Math.max(0, 100 - sliPercentage);
    const remaining = budget <= 0 ? (consumed === 0 ? 100 : 0) : Math.max(0, 100 - consumed / budget * 100);
    return { ...definition, sliPercentage: Math.round(sliPercentage * 1000) / 1000, errorBudgetRemainingPercentage: Math.round(remaining * 100) / 100, sampleCount: samples.length };
  }));
  return {
    range,
    points: points.map((item): ObservabilityPoint => ({ metricKey: item.metricKey, scope: scope(item.scope), scopeId: item.scopeId, value: item.value.toNumber(), bucketAt: item.bucketAt.toISOString() })),
    slos: sloStatuses, alerts: alerts.map(mapAlert),
    deployments: deployments.map((item): DeploymentMarker => ({ id: item.id, service: item.service, version: item.version, environment: item.environment, description: item.description, deployedAt: item.deployedAt.toISOString() })),
    logs: logs.map((item): CentralLogEntry => ({ id: item.id, level: item.level === "WARN" ? "WARN" : item.level === "INFO" ? "INFO" : "ERROR", service: item.service, message: item.message, requestId: item.requestId, correlationId: item.correlationId, occurredAt: item.occurredAt.toISOString() })),
  };
}

export async function upsertSlo(input: Omit<SloDefinition, "id">): Promise<SloDefinition> {
  return mapSlo(await prisma.observabilitySlo.upsert({
    where: { scope_scopeId_metricKey: { scope: input.scope, scopeId: input.scopeId, metricKey: input.metricKey } },
    create: input, update: input,
  }));
}
export async function updateAlertOwnership(id: string, adminId: string, input: { owner: string; runbookUrl: string; notificationChannel: string }): Promise<AlertHistoryItem> {
  const alert = await prisma.$transaction(async (tx) => {
    const updated = await tx.observabilityAlertHistory.update({ where: { id }, data: input });
    await tx.$executeRaw`UPDATE "observability_alert_history" SET "lastModifiedById" = ${adminId} WHERE "id" = ${id}`;
    return updated;
  });
  return mapAlert(alert);
}
export async function silenceAlert(id: string, adminId: string, until: Date, reason: string): Promise<AlertHistoryItem> {
  if (until <= new Date()) throw new Error("Susturma bitişi gelecekte olmalıdır.");
  const alert = await prisma.$transaction(async (tx) => {
    const updated = await tx.observabilityAlertHistory.update({ where: { id }, data: { silencedUntil: until } });
    await tx.$executeRaw`UPDATE "observability_alert_history" SET "lastModifiedById" = ${adminId}, "silenceReason" = ${reason} WHERE "id" = ${id}`;
    return updated;
  });
  return mapAlert(alert);
}
export async function createDeployment(input: { service: string; version: string; environment: string; description?: string | null; deployedAt: Date }, adminId: string): Promise<DeploymentMarker> {
  const row = await prisma.deploymentMarker.upsert({ where: { service_version_environment: { service: input.service, version: input.version, environment: input.environment } }, create: { ...input, createdById: adminId }, update: { description: input.description, deployedAt: input.deployedAt } });
  return { id: row.id, service: row.service, version: row.version, environment: row.environment, description: row.description, deployedAt: row.deployedAt.toISOString() };
}
