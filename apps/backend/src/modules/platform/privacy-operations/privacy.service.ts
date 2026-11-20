import { createHash, randomBytes } from "node:crypto";
import { Prisma } from "@prisma/client";
import type { DataSubjectRequestDto, PrivacyDownloadGrant } from "@repo/types";
import { ValidationError } from "../../../errors/index.js";
import { prisma } from "../../../lib/prisma.js";
import { runWithTenantIsolationBypass } from "../../../lib/tenant-isolation-context.js";
import { createRequestSchema } from './privacy.schemas.js';
import { consumePrivacyDownload } from './privacy-export.service.js';
import { lockSessionRegistry } from '../../../services/security/session-registry.js';
import { revokeSubjectSessionsInTransaction } from '../../../services/security-hardening.service.js';
import { getCurrentObservabilityContext } from '../../../services/observability.service.js';

async function lockPrivacyTenant(tx: Prisma.TransactionClient, tenantId: string): Promise<void> {
  await tx.$executeRaw`SET LOCAL lock_timeout = '1000ms'`;
  await tx.$queryRaw`SELECT id FROM tenants WHERE id=${tenantId} FOR UPDATE`;
}

type RequestRow = Prisma.DataSubjectRequestGetPayload<Record<string, never>>;
async function lockRequest(tx: Prisma.TransactionClient, id: string): Promise<RequestRow | null> {
  await tx.$executeRaw`SET LOCAL lock_timeout = '1000ms'`;
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${id}))`;
  return tx.dataSubjectRequest.findUnique({ where: { id } });
}
const bypass = <T>(work: () => Promise<T>) =>
  runWithTenantIsolationBypass("admin-console", work);
function strings(value: Prisma.JsonValue): string[] {
  return Array.isArray(value)
    ? value.filter((v): v is string => typeof v === "string")
    : [];
}
async function map(row: RequestRow): Promise<DataSubjectRequestDto> {
  const [tenant, hold] = await bypass(async () =>
    Promise.all([
      prisma.tenant.findUnique({
        where: { id: row.tenantId },
        select: { companyName: true, legalHold: true },
      }),
      prisma.privacyLegalHold.findFirst({
        where: {
          tenantId: row.tenantId,
          active: true,
          OR: [{ subjectEmail: null }, { subjectEmail: row.subjectEmail }],
        },
      }),
    ]),
  );
  const type =
    row.type === "ERASURE" || row.type === "ANONYMIZATION"
      ? row.type
      : "EXPORT";
  const allowed = [
    "PENDING_VERIFICATION",
    "PENDING_APPROVAL",
    "APPROVED",
    "COMPLETED",
    "REJECTED",
    "BLOCKED_LEGAL_HOLD",
  ] as const;
  const status =
    allowed.find((v) => v === row.status) ?? "PENDING_VERIFICATION";
  return {
    id: row.id,
    tenantId: row.tenantId,
    tenantName: tenant?.companyName ?? "Silinmiş tenant",
    subjectEmail: row.subjectEmail,
    type,
    status,
    scope: strings(row.scope),
    reason: row.reason,
    ticketId: row.ticketId,
    requestedById: row.requestedById,
    verifiedById: row.verifiedById,
    approvedById: row.approvedById,
    identityVerifiedAt: row.identityVerifiedAt?.toISOString() ?? null,
    approvedAt: row.approvedAt?.toISOString() ?? null,
    completedAt: row.completedAt?.toISOString() ?? null,
    legalHold: Boolean(hold) || Boolean(tenant?.legalHold),
    createdAt: row.createdAt.toISOString(),
  };
}
export async function listRequests(): Promise<DataSubjectRequestDto[]> {
  const rows = await bypass(async () =>
    prisma.dataSubjectRequest.findMany({
      orderBy: { createdAt: "desc" },
      take: 200,
    }),
  );
  return Promise.all(rows.map(map));
}
export async function createRequest(
  input: {
    tenantId: string;
    subjectEmail: string;
    type: string;
    scope: string[];
    reason: string;
    ticketId: string;
  },
  adminId: string,
): Promise<DataSubjectRequestDto> {
  input = createRequestSchema.parse(input);
  if (input.type !== 'EXPORT' && input.scope.includes('AUDIT')) throw new ValidationError('Audit kayıtları bu taleple silinemez; saklama ve hukuki onay süreci gereklidir.');
  const membership = await bypass(async () =>
    prisma.tenantUser.findFirst({
      where: { tenantId: input.tenantId, user: { email: input.subjectEmail } },
    }),
  );
  if (!membership)
    throw new ValidationError("Veri sahibi bu tenant içinde bulunamadı.");
  return map(
    await bypass(async () =>
      prisma.dataSubjectRequest.create({
        data: { ...input, requestedById: adminId },
      }),
    ),
  );
}
export async function verifyIdentity(
  id: string,
  adminId: string,
): Promise<DataSubjectRequestDto> {
  const updated = await bypass(async () => prisma.$transaction(async (tx) => {
    const current = await lockRequest(tx, id);
    if (!current || current.status !== "PENDING_VERIFICATION")
      throw new ValidationError("Talep kimlik doğrulama aşamasında değil.");
    return tx.dataSubjectRequest.update({
        where: { id },
        data: {
          status: "PENDING_APPROVAL",
          verifiedById: adminId,
          identityVerifiedAt: new Date(),
        },
      });
  }));
  return map(updated);
}
export async function decideRequest(
  id: string,
  adminId: string,
  approve: boolean,
): Promise<DataSubjectRequestDto> {
  const updated = await bypass(async () => prisma.$transaction(async (tx) => {
    const current = await lockRequest(tx, id);
    if (!current || current.status !== "PENDING_APPROVAL")
      throw new ValidationError("Talep onay aşamasında değil.");
    if (current.requestedById === adminId || current.verifiedById === adminId)
      throw new ValidationError("Talebi oluşturan veya kimliği doğrulayan admin onay veremez.");
    return tx.dataSubjectRequest.update({
        where: { id },
        data: {
          status: approve ? "APPROVED" : "REJECTED",
          approvedById: adminId,
          approvedAt: new Date(),
        },
      });
  }));
  return map(updated);
}
export async function executeRequest(
  id: string,
  executedById: string,
): Promise<DataSubjectRequestDto> {
  const updated = await bypass(async () => prisma.$transaction(async (tx) => {
    const row = await lockRequest(tx, id);
    if (!row || row.status !== "APPROVED")
      throw new ValidationError("Yalnızca onaylı talepler uygulanabilir.");
    const scope = createRequestSchema.shape.scope.parse(row.scope);
    createRequestSchema.shape.type.parse(row.type);
    if (row.type !== 'EXPORT' && scope.includes('AUDIT')) throw new ValidationError('Audit kayıtları bu taleple silinemez; hukuki değerlendirme gereklidir.');
    if (row.type !== "EXPORT") {
      await tx.$executeRaw`SET LOCAL lock_timeout = '1000ms'`;
      // Match login/registry writers: registry before tenant, never reverse.
      await lockSessionRegistry(tx, row.tenantId);
      await lockPrivacyTenant(tx, row.tenantId);
      const tenant = await tx.tenant.findUniqueOrThrow({ where: { id: row.tenantId }, select: { legalHold: true } });
      const hold = await tx.privacyLegalHold.findFirst({ where: { tenantId: row.tenantId, active: true, OR: [{ subjectEmail: null }, { subjectEmail: row.subjectEmail }] } });
      if (hold || tenant.legalHold) return tx.dataSubjectRequest.update({ where: { id }, data: { status: "BLOCKED_LEGAL_HOLD" } });
      const memberships = await tx.tenantUser.findMany({
        where: { tenantId: row.tenantId, user: { email: row.subjectEmail } },
        select: { userId: true },
      });
      for (const membership of memberships) {
        // FK creation takes KEY SHARE on users. Lock the identity before the
        // cross-tenant membership check so a concurrent new membership cannot
        // commit in the gap before global identity anonymization.
        if (scope.includes('IDENTITY')) await tx.$queryRaw`SELECT id FROM users WHERE id=${membership.userId} FOR UPDATE`;
        const otherTenantCount = await tx.tenantUser.count({
          where: { userId: membership.userId, tenantId: { not: row.tenantId } },
        });
        if (otherTenantCount > 0 && scope.includes('IDENTITY')) throw new ValidationError('Ortak kimlik başka tenantlarda kullanılıyor. Kimlik kapsamı ayrı değerlendirilmelidir; üyelik kapsamıyla yeni talep hazırlayın.');
        await tx.tenantUser.update({
          where: {
            tenantId_userId: {
              tenantId: row.tenantId,
              userId: membership.userId,
            },
          },
          data: { isActive: false, preferences: Prisma.DbNull },
        });
        await tx.apiKey.updateMany({ where: { tenantId: row.tenantId, createdById: membership.userId, isActive: true }, data: { isActive: false, revokedAt: new Date() } });
        await revokeSubjectSessionsInTransaction(tx, row.tenantId, membership.userId, row.approvedById);
        if (otherTenantCount === 0 && strings(row.scope).includes('IDENTITY'))
          await tx.user.update({
            where: { id: membership.userId },
            data: {
              name: "Anonim Kullanıcı",
              email: `anon-${createHash("sha256").update(`${row.id}:${membership.userId}`).digest("hex").slice(0, 20)}@redacted.invalid`,
              phone: null,
              isActive: false,
              passwordResetToken: null,
              passwordResetExpiry: null,
            },
          });
      }
    }
    await tx.auditLog.create({ data: { tenantId: row.tenantId, adminId: executedById, requestId: getCurrentObservabilityContext()?.requestId ?? null, module: 'PRIVACY', entityType: 'OTHER', entityId: row.id, action: row.type === 'EXPORT' ? 'EXPORT' : 'UPDATE', newValues: { scope, result: row.type === 'EXPORT' ? 'SCOPED_EXPORT_READY' : 'SCOPED_ANONYMIZATION', approvedById: row.approvedById, financialAndAuditRecordsPreserved: true } } });
    return tx.dataSubjectRequest.update({ where: { id }, data: { status: "COMPLETED", completedAt: new Date() } });
  }));
  return map(updated);
}
export async function createDownloadGrant(
  id: string,
  adminId: string,
): Promise<PrivacyDownloadGrant> {
  const row = await bypass(async () =>
    prisma.dataSubjectRequest.findUnique({ where: { id } }),
  );
  if (!row || row.type !== "EXPORT" || row.status !== "COMPLETED")
    throw new ValidationError("Tamamlanmış export talebi gereklidir.");
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + 15 * 60_000);
  await prisma.privacyDownloadGrant.create({
    data: {
      requestId: id,
      tokenHash: createHash("sha256").update(token).digest("hex"),
      expiresAt,
      createdById: adminId,
    },
  });
  return {
    url: `/api/admin/privacy/download/${token}`,
    expiresAt: expiresAt.toISOString(),
  };
}
export async function consumeDownload(
  token: string,
): Promise<Record<string, unknown>> {
  return bypass(() => consumePrivacyDownload(prisma, token));
}
export async function createLegalHold(
  input: { tenantId: string; subjectEmail?: string; reason: string },
  adminId: string,
): Promise<void> {
  const tenant = await bypass(async () =>
    prisma.tenant.findUnique({
      where: { id: input.tenantId },
      select: { id: true },
    }),
  );
  if (!tenant) throw new ValidationError("Tenant bulunamadı.");
  if (input.subjectEmail) {
    const subject = await bypass(async () =>
      prisma.tenantUser.findFirst({
        where: {
          tenantId: input.tenantId,
          user: { email: input.subjectEmail },
        },
        select: { id: true },
      }),
    );
    if (!subject)
      throw new ValidationError("Veri sahibi bu tenant içinde bulunamadı.");
  }
  await bypass(() => prisma.$transaction(async tx => {
  await lockPrivacyTenant(tx, input.tenantId);
  await tx.privacyLegalHold.create({
    data: {
      ...input,
      subjectEmail: input.subjectEmail ?? null,
      createdById: adminId,
    },
  });
  }));
}
