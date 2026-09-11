import { createHash, randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import type { PlatformAuditDiff, PlatformAuditEntry, PlatformAuditOutcome, PlatformAuditPage } from "@repo/types";
import { prisma } from "../../../lib/prisma.js";
import type { PlatformAuditFiltersInput } from "./platform-audit.schemas.js";

const actorSelect = { id: true, name: true, email: true } as const;
type AuditRow = Prisma.PlatformAdminAuditLogGetPayload<Record<string, never>>;
export interface CreatePlatformAuditInput {
  actorId: string | null; action: string; module: string; targetType: string; targetId: string | null;
  outcome: PlatformAuditOutcome; reason?: string | null; approvalId?: string | null; ipAddress?: string | null;
  device?: string | null; requestId?: string | null; correlationId?: string | null;
  beforeValues?: Prisma.InputJsonObject; afterValues?: Prisma.InputJsonObject;
}

function stable(value: unknown): string {
  if (value instanceof Date) return JSON.stringify(value.toISOString());
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value !== null && typeof value === "object") return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${stable(item)}`).join(",")}}`;
  return JSON.stringify(value) ?? "null";
}
function differences(before: Prisma.InputJsonObject | undefined, after: Prisma.InputJsonObject | undefined): Prisma.InputJsonObject[] {
  const safeBefore = before ?? {}; const safeAfter = after ?? {};
  return [...new Set([...Object.keys(safeBefore), ...Object.keys(safeAfter)])].filter((field) => stable(safeBefore[field]) !== stable(safeAfter[field])).map((field) => ({ field, before: safeBefore[field] ?? null, after: safeAfter[field] ?? null }));
}
function hashPayload(row: unknown): string {
  return createHash("sha256").update(stable(row)).digest("hex");
}
function whereFor(filters: Omit<PlatformAuditFiltersInput, "page" | "limit">): Prisma.PlatformAdminAuditLogWhereInput {
  return {
    ...(filters.from || filters.to ? { createdAt: { gte: filters.from, lte: filters.to } } : {}),
    ...(filters.module ? { module: { contains: filters.module, mode: "insensitive" } } : {}),
    ...(filters.actorId ? { actorId: filters.actorId } : {}), ...(filters.outcome ? { outcome: filters.outcome } : {}),
    ...(filters.target ? { OR: [{ targetType: { contains: filters.target, mode: "insensitive" } }, { targetId: { contains: filters.target, mode: "insensitive" } }] } : {}),
  };
}
function outcome(value: string): PlatformAuditOutcome { return value === "DENIED" ? "DENIED" : value === "FAILED" ? "FAILED" : "SUCCESS"; }
async function mapRows(rows: AuditRow[]): Promise<PlatformAuditEntry[]> {
  const actors = await prisma.adminUser.findMany({ where: { id: { in: rows.flatMap((row) => row.actorId ? [row.actorId] : []) } }, select: actorSelect });
  const names = new Map(actors.map((actor) => [actor.id, actor]));
  return rows.map((row) => ({ id: row.id, actor: row.actorId ? names.get(row.actorId) ?? null : null, action: row.action, module: row.module, targetType: row.targetType, targetId: row.targetId, outcome: outcome(row.outcome), reason: row.reason, approvalId: row.approvalId, ipAddress: row.ipAddress, device: row.device, requestId: row.requestId, correlationId: row.correlationId, changes: parseDiff(row.changedFields), previousHash: row.previousHash, hash: row.hash, retentionUntil: row.retentionUntil.toISOString(), createdAt: row.createdAt.toISOString() }));
}
function parseDiff(value: Prisma.JsonValue): PlatformAuditDiff[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => item !== null && typeof item === "object" && !Array.isArray(item) && typeof item.field === "string" ? [{ field: item.field, before: item.before ?? null, after: item.after ?? null }] : []);
}

export async function createPlatformAudit(input: CreatePlatformAuditInput): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(78124019)`;
    const [head, policy] = await Promise.all([
      tx.platformAdminAuditLog.findFirst({ orderBy: [{ createdAt: "desc" }, { id: "desc" }] }),
      tx.platformAuditPolicy.findUniqueOrThrow({ where: { id: "default" } }),
    ]);
    const createdAt = new Date(); const id = randomUUID(); const changedFields = differences(input.beforeValues, input.afterValues);
    const base = { id, actorId: input.actorId, action: input.action, module: input.module, targetType: input.targetType, targetId: input.targetId, outcome: input.outcome, reason: input.reason ?? null, approvalId: input.approvalId ?? null, ipAddress: input.ipAddress ?? null, device: input.device ?? null, requestId: input.requestId ?? null, correlationId: input.correlationId ?? null, beforeValues: input.beforeValues ?? null, afterValues: input.afterValues ?? null, changedFields, previousHash: head?.hash ?? null, retentionUntil: new Date(createdAt.getTime() + policy.retentionDays * 86400000), createdAt };
    await tx.platformAdminAuditLog.create({ data: { ...base, beforeValues: input.beforeValues ?? Prisma.JsonNull, afterValues: input.afterValues ?? Prisma.JsonNull, changedFields, hash: hashPayload(base) } });
  });
}

export async function verifyPlatformAuditIntegrity(): Promise<PlatformAuditPage["integrity"]> {
  let previousHash: string | null = null; let checked = 0; let cursor: string | undefined;
  while (true) {
    const rows = await prisma.platformAdminAuditLog.findMany({ orderBy: [{ createdAt: "asc" }, { id: "asc" }], take: 1000, ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}) });
    for (const row of rows) {
      const { hash: storedHash, ...hashable } = row; const expected = hashPayload(hashable); checked += 1;
      if (row.previousHash !== previousHash || storedHash !== expected) return { valid: false, checked, brokenAtId: row.id };
      previousHash = row.hash;
    }
    if (rows.length < 1000) break;
    cursor = rows.at(-1)?.id;
  }
  return { valid: true, checked, brokenAtId: null };
}

export async function listPlatformAudit(filters: PlatformAuditFiltersInput): Promise<PlatformAuditPage> {
  const where = whereFor(filters); const skip = (filters.page - 1) * filters.limit;
  const [total, rows, integrity, policy] = await Promise.all([prisma.platformAdminAuditLog.count({ where }), prisma.platformAdminAuditLog.findMany({ where, orderBy: { createdAt: "desc" }, skip, take: filters.limit }), verifyPlatformAuditIntegrity(), prisma.platformAuditPolicy.findUniqueOrThrow({ where: { id: "default" } })]);
  return { data: await mapRows(rows), meta: { total, page: filters.page, pageSize: filters.limit, totalPages: Math.ceil(total / filters.limit) }, integrity, retentionDays: policy.retentionDays };
}
export async function getPlatformAudit(id: string): Promise<PlatformAuditEntry | null> { const row = await prisma.platformAdminAuditLog.findUnique({ where: { id } }); return row ? (await mapRows([row]))[0] ?? null : null; }
export async function exportPlatformAudit(filters: Omit<PlatformAuditFiltersInput, "page" | "limit">, format: "csv" | "json"): Promise<{ contentType: string; filename: string; body: string }> {
  const entries = await mapRows(await prisma.platformAdminAuditLog.findMany({ where: whereFor(filters), orderBy: { createdAt: "desc" }, take: 10000 }));
  if (format === "json") return { contentType: "application/json", filename: "platform-audit.json", body: JSON.stringify(entries, null, 2) };
  const escape = (value: unknown) => `"${String(value ?? "").replaceAll('"', '""')}"`;
  return { contentType: "text/csv; charset=utf-8", filename: "platform-audit.csv", body: ["id,createdAt,actor,module,action,target,outcome,reason,requestId,correlationId,hash", ...entries.map((entry) => [entry.id, entry.createdAt, entry.actor?.email, entry.module, entry.action, `${entry.targetType}:${entry.targetId ?? ""}`, entry.outcome, entry.reason, entry.requestId, entry.correlationId, entry.hash].map(escape).join(","))].join("\n") };
}
export async function updateRetentionPolicy(retentionDays: number, adminId: string): Promise<number> { const policy = await prisma.platformAuditPolicy.update({ where: { id: "default" }, data: { retentionDays, updatedById: adminId } }); return policy.retentionDays; }
