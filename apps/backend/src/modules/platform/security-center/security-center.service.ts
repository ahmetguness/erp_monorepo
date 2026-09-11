import { randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import type {
  PlatformSecurityCenter,
  PlatformSecurityFinding,
  SecurityFindingSeverity,
  SecurityFindingStatus,
  SecurityVerificationStatus,
  UpdateSecurityFindingInput,
} from "@repo/types";
import { ValidationError } from "../../../errors/index.js";
import { prisma } from "../../../lib/prisma.js";
import { collectSecurityChecks } from "./security-checks.js";

type FindingRow = Prisma.PlatformSecurityFindingGetPayload<Record<string, never>>;
const findingStatuses: SecurityFindingStatus[] = ["OPEN", "ACKNOWLEDGED", "RESOLVED"];
const severities: SecurityFindingSeverity[] = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];
const verificationStatuses: SecurityVerificationStatus[] = ["PASS", "WARN", "FAIL"];

function enumValue<T extends string>(value: string, values: T[], fallback: T): T {
  return values.includes(value as T) ? value as T : fallback;
}
function evidence(value: Prisma.JsonValue): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}
function mapFinding(row: FindingRow): PlatformSecurityFinding {
  return {
    id: row.id, key: row.key, title: row.title, category: row.category,
    severity: enumValue(row.severity, severities, "MEDIUM"),
    status: enumValue(row.status, findingStatuses, "OPEN"),
    verificationStatus: enumValue(row.verificationStatus, verificationStatuses, "WARN"),
    owner: row.owner, remediation: row.remediation, evidence: evidence(row.evidence), ticketId: row.ticketId,
    firstSeenAt: row.firstSeenAt.toISOString(), lastSeenAt: row.lastSeenAt.toISOString(),
    verifiedAt: row.verifiedAt?.toISOString() ?? null, resolvedAt: row.resolvedAt?.toISOString() ?? null,
  };
}

export async function scanSecurityCenter(): Promise<PlatformSecurityCenter> {
  const now = new Date();
  const checks = await collectSecurityChecks();
  const existingRows = await prisma.platformSecurityFinding.findMany({
    where: { key: { in: checks.map((check) => check.key) } },
    select: { key: true, status: true },
  });
  const existingStatuses = new Map(existingRows.map((row) => [row.key, row.status]));
  await prisma.$transaction(checks.map((check) => {
    const passing = check.status === "PASS";
    const existingStatus = existingStatuses.get(check.key);
    const nextStatus = passing
      ? "RESOLVED"
      : existingStatus === "ACKNOWLEDGED"
        ? "ACKNOWLEDGED"
        : "OPEN";
    return prisma.platformSecurityFinding.upsert({
      where: { key: check.key },
      create: {
        key: check.key, title: check.title, category: check.category, severity: check.severity,
        status: nextStatus, verificationStatus: check.status,
        remediation: check.remediation, evidence: check.evidence, firstSeenAt: now, lastSeenAt: now,
        verifiedAt: passing ? now : null, resolvedAt: passing ? now : null,
      },
      update: {
        title: check.title, category: check.category, severity: check.severity,
        verificationStatus: check.status, remediation: check.remediation, evidence: check.evidence,
        lastSeenAt: now, verifiedAt: passing ? now : null,
        status: nextStatus, resolvedAt: passing ? now : null,
      },
    });
  }));
  return getSecurityCenter();
}

export async function getSecurityCenter(): Promise<PlatformSecurityCenter> {
  const rows = await prisma.platformSecurityFinding.findMany({ orderBy: [{ severity: "desc" }, { lastSeenAt: "desc" }] });
  const findings = rows.map(mapFinding);
  const passing = findings.filter((item) => item.verificationStatus === "PASS").length;
  const warning = findings.filter((item) => item.verificationStatus === "WARN").length;
  const failing = findings.filter((item) => item.verificationStatus === "FAIL").length;
  return {
    summary: {
      status: failing > 0 ? "FAIL" : warning > 0 ? "WARN" : "PASS",
      total: findings.length, passing, warning, failing,
      open: findings.filter((item) => item.status !== "RESOLVED").length,
      lastScannedAt: rows.reduce<Date | null>((latest, row) => !latest || row.lastSeenAt > latest ? row.lastSeenAt : latest, null)?.toISOString() ?? null,
    },
    findings,
  };
}

export async function updateSecurityFinding(id: string, input: UpdateSecurityFindingInput): Promise<PlatformSecurityFinding> {
  const current = await prisma.platformSecurityFinding.findUnique({ where: { id } });
  if (!current) throw new ValidationError("Güvenlik bulgusu bulunamadı.");
  if (input.status === "RESOLVED" && current.verificationStatus !== "PASS") {
    throw new ValidationError("Bulgu yalnızca kontrol başarıyla doğrulandıktan sonra çözüldü olarak işaretlenebilir.");
  }
  const row = await prisma.platformSecurityFinding.update({
    where: { id },
    data: {
      ...(input.owner !== undefined ? { owner: input.owner } : {}),
      ...(input.status ? { status: input.status, resolvedAt: input.status === "RESOLVED" ? new Date() : null } : {}),
    },
  });
  return mapFinding(row);
}

export async function createSecurityTicket(id: string, requestedTicketId?: string): Promise<PlatformSecurityFinding> {
  const row = await prisma.platformSecurityFinding.findUnique({ where: { id } });
  if (!row) throw new ValidationError("Güvenlik bulgusu bulunamadı.");
  if (row.ticketId) throw new ValidationError("Bu bulgu zaten bir ticket ile ilişkilendirilmiş.");
  const ticketId = requestedTicketId ?? `SEC-${new Date().toISOString().slice(0, 10).replaceAll("-", "")}-${randomUUID().slice(0, 8).toUpperCase()}`;
  return mapFinding(await prisma.platformSecurityFinding.update({ where: { id }, data: { ticketId, status: "ACKNOWLEDGED" } }));
}
