import { createHash, randomBytes } from "node:crypto";
import { Prisma } from "@prisma/client";
import type { DataSubjectRequestDto, PrivacyDownloadGrant } from "@repo/types";
import { ValidationError } from "../../../errors/index.js";
import { prisma } from "../../../lib/prisma.js";
import { runWithTenantIsolationBypass } from "../../../lib/tenant-isolation-context.js";

type RequestRow = Prisma.DataSubjectRequestGetPayload<Record<string, never>>;
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
        select: { companyName: true },
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
    legalHold: Boolean(hold),
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
  const current = await bypass(async () =>
    prisma.dataSubjectRequest.findUnique({ where: { id } }),
  );
  if (!current || current.status !== "PENDING_VERIFICATION")
    throw new ValidationError("Talep kimlik doğrulama aşamasında değil.");
  return map(
    await bypass(async () =>
      prisma.dataSubjectRequest.update({
        where: { id },
        data: {
          status: "PENDING_APPROVAL",
          verifiedById: adminId,
          identityVerifiedAt: new Date(),
        },
      }),
    ),
  );
}
export async function decideRequest(
  id: string,
  adminId: string,
  approve: boolean,
): Promise<DataSubjectRequestDto> {
  const current = await bypass(async () =>
    prisma.dataSubjectRequest.findUnique({ where: { id } }),
  );
  if (!current || current.status !== "PENDING_APPROVAL")
    throw new ValidationError("Talep onay aşamasında değil.");
  if (current.requestedById === adminId || current.verifiedById === adminId)
    throw new ValidationError(
      "Talebi oluşturan veya kimliği doğrulayan admin onay veremez.",
    );
  return map(
    await bypass(async () =>
      prisma.dataSubjectRequest.update({
        where: { id },
        data: {
          status: approve ? "APPROVED" : "REJECTED",
          approvedById: adminId,
          approvedAt: new Date(),
        },
      }),
    ),
  );
}
async function activeHold(row: RequestRow): Promise<boolean> {
  return bypass(async () =>
    Boolean(
      await prisma.privacyLegalHold.findFirst({
        where: {
          tenantId: row.tenantId,
          active: true,
          OR: [{ subjectEmail: null }, { subjectEmail: row.subjectEmail }],
        },
      }),
    ),
  );
}
export async function executeRequest(
  id: string,
): Promise<DataSubjectRequestDto> {
  const row = await bypass(async () =>
    prisma.dataSubjectRequest.findUnique({ where: { id } }),
  );
  if (!row || row.status !== "APPROVED")
    throw new ValidationError("Yalnızca onaylı talepler uygulanabilir.");
  if (row.type !== "EXPORT" && (await activeHold(row)))
    return map(
      await bypass(async () =>
        prisma.dataSubjectRequest.update({
          where: { id },
          data: { status: "BLOCKED_LEGAL_HOLD" },
        }),
      ),
    );
  if (row.type !== "EXPORT")
    await bypass(async () => {
      const memberships = await prisma.tenantUser.findMany({
        where: { tenantId: row.tenantId, user: { email: row.subjectEmail } },
        select: { userId: true },
      });
      for (const membership of memberships) {
        const otherTenantCount = await prisma.tenantUser.count({
          where: { userId: membership.userId, tenantId: { not: row.tenantId } },
        });
        await prisma.tenantUser.update({
          where: {
            tenantId_userId: {
              tenantId: row.tenantId,
              userId: membership.userId,
            },
          },
          data: { isActive: false, preferences: Prisma.DbNull },
        });
        if (otherTenantCount === 0)
          await prisma.user.update({
            where: { id: membership.userId },
            data: {
              name: "Anonim Kullanıcı",
              email: `anon-${createHash("sha256").update(`${row.id}:${membership.userId}`).digest("hex").slice(0, 20)}@redacted.invalid`,
              phone: null,
              isActive: false,
            },
          });
      }
    });
  return map(
    await bypass(async () =>
      prisma.dataSubjectRequest.update({
        where: { id },
        data: { status: "COMPLETED", completedAt: new Date() },
      }),
    ),
  );
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
  const hash = createHash("sha256").update(token).digest("hex");
  const grant = await prisma.privacyDownloadGrant.findUnique({
    where: { tokenHash: hash },
  });
  if (!grant || grant.consumedAt || grant.expiresAt <= new Date())
    throw new ValidationError(
      "İndirme bağlantısı geçersiz, kullanılmış veya süresi dolmuş.",
    );
  const claimed = await prisma.privacyDownloadGrant.updateMany({
    where: { id: grant.id, consumedAt: null, expiresAt: { gt: new Date() } },
    data: { consumedAt: new Date() },
  });
  if (claimed.count !== 1)
    throw new ValidationError(
      "İndirme bağlantısı geçersiz, kullanılmış veya süresi dolmuş.",
    );
  const row = await bypass(async () =>
    prisma.dataSubjectRequest.findUniqueOrThrow({
      where: { id: grant.requestId },
    }),
  );
  const payload = await bypass(async () => {
    const membership = await prisma.tenantUser.findFirst({
      where: { tenantId: row.tenantId, user: { email: row.subjectEmail } },
      select: {
        tenantId: true,
        isActive: true,
        isOwner: true,
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
            createdAt: true,
          },
        },
      },
    });
    return {
      requestId: row.id,
      generatedAt: new Date().toISOString(),
      scope: strings(row.scope),
      subject: membership,
    };
  });
  return payload;
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
  await prisma.privacyLegalHold.create({
    data: {
      ...input,
      subjectEmail: input.subjectEmail ?? null,
      createdById: adminId,
    },
  });
}
