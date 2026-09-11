import { Prisma } from "@prisma/client";
import type { Incident, IncidentCommunication, IncidentStatus, PublicStatusIncident } from "@repo/types";
import { BaseError } from "../../../errors/index.js";
import { prisma } from "../../../lib/prisma.js";
import type { CreateIncidentInput, UpdateIncidentInput } from "./incident-management.schemas.js";

const incidentInclude = {
  tenants: true,
  timeline: { orderBy: { createdAt: "asc" as const } },
  communications: { orderBy: { createdAt: "desc" as const } },
} satisfies Prisma.PlatformIncidentInclude;
type IncidentRow = Prisma.PlatformIncidentGetPayload<{ include: typeof incidentInclude }>;

export class IncidentManagementError extends BaseError {
  constructor(message: string, statusCode: 400 | 403 | 404 | 409) {
    super(message, statusCode, "INCIDENT_MANAGEMENT_ERROR");
  }
}

async function mapIncident(row: IncidentRow): Promise<Incident> {
  const actorIds = new Set<string>([
    row.createdById,
    ...row.timeline.map((item) => item.createdById),
    ...row.communications.flatMap((item) => [item.requestedById, item.approvedById].filter((id): id is string => id !== null)),
  ]);
  const [actors, tenants] = await Promise.all([
    prisma.adminUser.findMany({ where: { id: { in: [...actorIds] } }, select: { id: true, name: true } }),
    prisma.tenant.findMany({ where: { id: { in: row.tenants.map((item) => item.tenantId) } }, select: { id: true, companyName: true } }),
  ]);
  const actorNames = new Map(actors.map((item) => [item.id, item.name]));
  const tenantNames = new Map(tenants.map((item) => [item.id, item.companyName]));
  return {
    id: row.id, alertId: row.alertId, title: row.title, summary: row.summary,
    severity: row.severity === "SEV1" ? "SEV1" : row.severity === "SEV2" ? "SEV2" : "SEV3",
    status: toStatus(row.status), owner: row.owner, runbookUrl: row.runbookUrl,
    rootCause: row.rootCause, resolution: row.resolution,
    createdByName: actorNames.get(row.createdById) ?? "Bilinmeyen admin",
    affectedTenants: row.tenants.map((item) => ({ tenantId: item.tenantId, tenantName: tenantNames.get(item.tenantId) ?? item.tenantId })),
    timeline: row.timeline.map((item) => ({ id: item.id, type: toTimelineType(item.type), message: item.message, actorName: actorNames.get(item.createdById) ?? "Bilinmeyen admin", createdAt: item.createdAt.toISOString() })),
    communications: row.communications.map((item) => mapCommunication(item, actorNames)),
    createdAt: row.createdAt.toISOString(), resolvedAt: row.resolvedAt?.toISOString() ?? null, updatedAt: row.updatedAt.toISOString(),
  };
}

function toStatus(value: string): IncidentStatus {
  if (value === "IDENTIFIED" || value === "MONITORING" || value === "RESOLVED") return value;
  return "INVESTIGATING";
}
function toTimelineType(value: string): Incident["timeline"][number]["type"] {
  if (value === "STATUS" || value === "COMMUNICATION" || value === "POSTMORTEM" || value === "CREATED") return value;
  return "UPDATE";
}
function mapCommunication(row: IncidentRow["communications"][number], names: Map<string, string>): IncidentCommunication {
  return { id: row.id, message: row.message, status: row.status === "PUBLISHED" ? "PUBLISHED" : row.status === "REJECTED" ? "REJECTED" : "PENDING_APPROVAL", recipientCount: row.recipientCount, requestedByName: names.get(row.requestedById) ?? "Bilinmeyen admin", approvedByName: row.approvedById ? names.get(row.approvedById) ?? "Bilinmeyen admin" : null, publishedAt: row.publishedAt?.toISOString() ?? null, createdAt: row.createdAt.toISOString() };
}

export async function listIncidents(): Promise<Incident[]> {
  const rows = await prisma.platformIncident.findMany({ include: incidentInclude, orderBy: { createdAt: "desc" }, take: 100 });
  return Promise.all(rows.map(mapIncident));
}

export async function createIncident(input: CreateIncidentInput, adminId: string): Promise<Incident> {
  const uniqueTenantIds = [...new Set(input.affectedTenantIds)];
  const tenantCount = await prisma.tenant.count({ where: { id: { in: uniqueTenantIds }, deletedAt: null } });
  if (tenantCount !== uniqueTenantIds.length) throw new IncidentManagementError("Etkilenen tenant listesindeki bir kayıt bulunamadı.", 404);
  if (input.alertId) {
    const alert = await prisma.observabilityAlertHistory.findUnique({ where: { id: input.alertId } });
    if (!alert) throw new IncidentManagementError("Kaynak alarm bulunamadı.", 404);
    if (alert.severity !== "critical" || alert.status !== "OPEN") throw new IncidentManagementError("Yalnızca açık ve kritik alarmlar olaya dönüştürülebilir.", 400);
    const duplicate = await prisma.platformIncident.findFirst({ where: { alertId: input.alertId, status: { not: "RESOLVED" } } });
    if (duplicate) throw new IncidentManagementError("Bu alarm için zaten açık bir olay bulunuyor.", 409);
  }
  const row = await prisma.$transaction(async (tx) => {
    const created = await tx.platformIncident.create({ data: {
      alertId: input.alertId, title: input.title, summary: input.summary, severity: input.severity,
      owner: input.owner, runbookUrl: input.runbookUrl, createdById: adminId,
      tenants: { create: uniqueTenantIds.map((tenantId) => ({ tenantId })) },
      timeline: { create: { type: "CREATED", message: "Olay kaydı açıldı.", createdById: adminId } },
    }, include: incidentInclude });
    return created;
  });
  return mapIncident(row);
}

export async function updateIncident(id: string, input: UpdateIncidentInput, adminId: string): Promise<Incident> {
  const current = await prisma.platformIncident.findUnique({ where: { id } });
  if (!current) throw new IncidentManagementError("Olay bulunamadı.", 404);
  if (input.status === "RESOLVED" && (!input.rootCause && !current.rootCause || !input.resolution && !current.resolution))
    throw new IncidentManagementError("Olayı çözmek için kök neden ve çözüm zorunludur.", 400);
  const statusChanged = input.status && input.status !== current.status;
  const postmortemChanged = input.rootCause !== undefined || input.resolution !== undefined;
  const row = await prisma.$transaction(async (tx) => {
    await tx.platformIncident.update({ where: { id }, data: { ...input, resolvedAt: input.status === "RESOLVED" ? new Date() : input.status ? null : undefined } });
    if (statusChanged || postmortemChanged) await tx.platformIncidentTimeline.create({ data: { incidentId: id, type: postmortemChanged ? "POSTMORTEM" : "STATUS", message: postmortemChanged ? "Kök neden ve çözüm kaydı güncellendi." : `Durum ${input.status} olarak değiştirildi.`, createdById: adminId } });
    return tx.platformIncident.findUniqueOrThrow({ where: { id }, include: incidentInclude });
  });
  return mapIncident(row);
}

export async function addTimelineEntry(id: string, message: string, adminId: string): Promise<Incident> {
  await prisma.platformIncidentTimeline.create({ data: { incidentId: id, type: "UPDATE", message, createdById: adminId } }).catch(() => { throw new IncidentManagementError("Olay bulunamadı.", 404); });
  return mapIncident(await prisma.platformIncident.findUniqueOrThrow({ where: { id }, include: incidentInclude }));
}

export async function requestCommunication(id: string, message: string, adminId: string): Promise<Incident> {
  const recipientCount = await prisma.platformIncidentTenant.count({ where: { incidentId: id, tenantId: { not: "" } } });
  if (!recipientCount) throw new IncidentManagementError("İletişim için en az bir etkilenen tenant gerekir.", 400);
  await prisma.platformIncidentCommunication.create({ data: { incidentId: id, message, recipientCount, requestedById: adminId } }).catch(() => { throw new IncidentManagementError("Olay bulunamadı.", 404); });
  return mapIncident(await prisma.platformIncident.findUniqueOrThrow({ where: { id }, include: incidentInclude }));
}

export async function decideCommunication(communicationId: string, decision: "APPROVE" | "REJECT", note: string, adminId: string): Promise<Incident> {
  const status = decision === "APPROVE" ? "PUBLISHED" : "REJECTED";
  const communication = await prisma.$transaction(async (tx) => {
    const current = await tx.platformIncidentCommunication.findUnique({ where: { id: communicationId } });
    if (!current) throw new IncidentManagementError("İletişim talebi bulunamadı.", 404);
    if (current.requestedById === adminId) throw new IncidentManagementError("Talep sahibi kendi iletişimini onaylayamaz.", 403);
    const updated = await tx.platformIncidentCommunication.updateMany({
      where: { id: communicationId, status: "PENDING_APPROVAL" },
      data: { status, approvedById: adminId, decisionNote: note, publishedAt: decision === "APPROVE" ? new Date() : null },
    });
    if (updated.count !== 1) throw new IncidentManagementError("İletişim talebi daha önce sonuçlandırılmış.", 409);
    await tx.platformIncidentTimeline.create({ data: { incidentId: current.incidentId, type: "COMMUNICATION", message: decision === "APPROVE" ? `Tenant durum güncellemesi yayınlandı (${current.recipientCount} alıcı).` : "Tenant durum güncellemesi reddedildi.", createdById: adminId } });
    return current;
  });
  return mapIncident(await prisma.platformIncident.findUniqueOrThrow({ where: { id: communication.incidentId }, include: incidentInclude }));
}

export async function getPublicStatusIncidents(): Promise<PublicStatusIncident[]> {
  const communications = await prisma.platformIncidentCommunication.findMany({ where: { status: "PUBLISHED" }, include: { incident: true }, orderBy: { publishedAt: "desc" }, distinct: ["incidentId"], take: 50 });
  return communications.map((item) => ({ id: item.incident.id, title: item.incident.title, severity: item.incident.severity === "SEV1" ? "SEV1" : item.incident.severity === "SEV2" ? "SEV2" : "SEV3", status: toStatus(item.incident.status), latestMessage: item.message, publishedAt: item.publishedAt?.toISOString() ?? item.createdAt.toISOString() }));
}
