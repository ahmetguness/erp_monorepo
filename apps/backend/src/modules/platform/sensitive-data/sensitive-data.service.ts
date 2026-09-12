import type { AdminSensitiveAccessGrant, AdminSensitiveAccessState, AdminSensitiveField, CreateAdminSensitiveAccessGrantInput } from "@repo/types";
import { prisma } from "../../../lib/prisma.js";
import { createPlatformAudit } from "../platform-audit/platform-audit.service.js";

const GRANT_TTL_MS = 15 * 60 * 1000;
const ALL_FIELDS: AdminSensitiveField[] = ["email", "phone", "errorDetails"];
export function maskEmail(value: string): string { const [local = "", domain = ""] = value.split("@"); return `${local.slice(0, 1)}***@${domain || "***"}`; }
export function maskPhone(value: string | null): string | null { if (!value) return value; const digits = value.replace(/\D/g, ""); return digits.length >= 4 ? `*** *** ${digits.slice(-4)}` : "***"; }

export async function getSensitiveAccessState(adminId: string, tenantId: string): Promise<AdminSensitiveAccessState> {
  const grants = await prisma.adminSensitiveAccessGrant.findMany({ where: { adminId, tenantId, expiresAt: { gt: new Date() } }, select: { fields: true, expiresAt: true } });
  const revealedFields = ALL_FIELDS.filter((field) => grants.some((grant) => grant.fields.includes(field)));
  const expiresAt = grants.filter((grant) => grant.fields.some((field) => revealedFields.includes(field as AdminSensitiveField))).sort((a, b) => b.expiresAt.getTime() - a.expiresAt.getTime())[0]?.expiresAt ?? null;
  return { revealedFields, maskedFields: ALL_FIELDS.filter((field) => !revealedFields.includes(field)), expiresAt: expiresAt?.toISOString() ?? null };
}

export async function createSensitiveAccessGrant(adminId: string, input: CreateAdminSensitiveAccessGrantInput, meta: { ipAddress: string | null; device: string | null; requestId: string | null }): Promise<AdminSensitiveAccessGrant> {
  await prisma.tenant.findFirstOrThrow({ where: { id: input.tenantId, deletedAt: null }, select: { id: true } });
  const fields = [...new Set(input.fields)]; const expiresAt = new Date(Date.now() + GRANT_TTL_MS);
  const grant = await prisma.adminSensitiveAccessGrant.create({ data: { adminId, tenantId: input.tenantId, fields, purpose: input.purpose, reason: input.reason, expiresAt } });
  await createPlatformAudit({ actorId: adminId, action: "SENSITIVE_DATA_REVEALED", module: "PRIVACY", targetType: "TENANT", targetId: input.tenantId, outcome: "SUCCESS", reason: input.reason, ipAddress: meta.ipAddress, device: meta.device, requestId: meta.requestId, afterValues: { fields, purpose: input.purpose, expiresAt: expiresAt.toISOString() } });
  return { id: grant.id, tenantId: grant.tenantId, fields, purpose: input.purpose, reason: grant.reason, expiresAt: grant.expiresAt.toISOString() };
}

export async function maskTenantForAdmin<T extends { id: string; email: string; phone: string | null }>(adminId: string, tenant: T): Promise<T & { sensitiveAccess: AdminSensitiveAccessState }> {
  const access = await getSensitiveAccessState(adminId, tenant.id);
  return { ...tenant, email: access.revealedFields.includes("email") ? tenant.email : maskEmail(tenant.email), phone: access.revealedFields.includes("phone") ? tenant.phone : maskPhone(tenant.phone), sensitiveAccess: access };
}
export async function maskTenantsForAdmin<T extends { id: string; email: string; phone: string | null }>(adminId: string, tenants: T[]): Promise<Array<T & { sensitiveAccess: AdminSensitiveAccessState }>> {
  const grants = await prisma.adminSensitiveAccessGrant.findMany({ where: { adminId, tenantId: { in: tenants.map((tenant) => tenant.id) }, expiresAt: { gt: new Date() } }, select: { tenantId: true, fields: true, expiresAt: true } });
  return tenants.map((tenant) => {
    const own = grants.filter((grant) => grant.tenantId === tenant.id);
    const revealedFields = ALL_FIELDS.filter((field) => own.some((grant) => grant.fields.includes(field)));
    const latestExpiry = own.sort((a, b) => b.expiresAt.getTime() - a.expiresAt.getTime())[0]?.expiresAt ?? null;
    const sensitiveAccess: AdminSensitiveAccessState = { revealedFields, maskedFields: ALL_FIELDS.filter((field) => !revealedFields.includes(field)), expiresAt: latestExpiry?.toISOString() ?? null };
    return { ...tenant, email: revealedFields.includes("email") ? tenant.email : maskEmail(tenant.email), phone: revealedFields.includes("phone") ? tenant.phone : maskPhone(tenant.phone), sensitiveAccess };
  });
}
export async function canRevealError(adminId: string, tenantId: string): Promise<boolean> { return (await getSensitiveAccessState(adminId, tenantId)).revealedFields.includes("errorDetails"); }
