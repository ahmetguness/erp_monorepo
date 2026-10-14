import "dotenv/config";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { prisma } from "../src/lib/prisma.js";
import { runWithTenantIsolationBypass } from "../src/lib/tenant-isolation-context.js";
import {
  consumeDownload,
  createDownloadGrant,
  createLegalHold,
  createRequest,
  decideRequest,
  executeRequest,
  verifyIdentity,
} from "../src/modules/platform/privacy-operations/privacy.service.js";

async function main(): Promise<void> {
  const marker = `TEST_E2E_PRIVACY_${Date.now()}_${process.pid}`;
  const admins = await Promise.all(
    [1, 2].map((index) =>
      prisma.adminUser.create({
        data: {
          email: `${marker.toLowerCase()}-${index}@test.local`,
          name: `${marker}_${index}`,
          password: "unused",
          mfaEnabled: true,
        },
        select: { id: true },
      }),
    ),
  );
  const member = await runWithTenantIsolationBypass(
    "admin-console",
    async () =>
      await prisma.tenantUser.findFirst({
        where: { user: { email: { not: "" } } },
        select: { tenantId: true, user: { select: { email: true } } },
      }),
  );
  assert.ok(member);
  const request = await createRequest(
    {
      tenantId: member.tenantId,
      subjectEmail: member.user.email.toLowerCase(),
      type: "EXPORT",
      scope: ["IDENTITY", "MEMBERSHIP"],
      reason: "KVKK erişim talebi entegrasyon doğrulaması",
      ticketId: `PRIV-TEST-${Date.now()}`,
    },
    admins[0]!.id,
  );
  try {
    await verifyIdentity(request.id, admins[0]!.id);
    await assert.rejects(
      () => decideRequest(request.id, admins[0]!.id, true),
      /onay veremez/,
    );
    const decisions = await Promise.allSettled([
      decideRequest(request.id, admins[1]!.id, true),
      decideRequest(request.id, admins[1]!.id, true),
    ]);
    assert.equal(
      decisions.filter((item) => item.status === "fulfilled").length,
      1,
    );
    assert.equal(
      decisions.filter((item) => item.status === "rejected").length,
      1,
    );
    await createLegalHold(
      {
        tenantId: member.tenantId,
        subjectEmail: member.user.email.toLowerCase(),
        reason: "Export erişimini engellememesi gereken test legal hold kaydı",
      },
      admins[1]!.id,
    );
    const executions = await Promise.allSettled([
      executeRequest(request.id),
      executeRequest(request.id),
    ]);
    assert.equal(
      executions.filter((item) => item.status === "fulfilled").length,
      1,
    );
    assert.equal(
      executions.filter((item) => item.status === "rejected").length,
      1,
    );
    const completed = executions.find((item) => item.status === "fulfilled");
    assert.equal(
      completed?.status === "fulfilled" ? completed.value.status : null,
      "COMPLETED",
    );
    const grant = await createDownloadGrant(request.id, admins[1]!.id);
    const token = grant.url.split("/").at(-1)!;
    assert.equal((await consumeDownload(token)).requestId, request.id);
    await assert.rejects(() => consumeDownload(token), /kullanılmış/);
    const expiredGrant = await createDownloadGrant(request.id, admins[1]!.id);
    const expiredToken = expiredGrant.url.split("/").at(-1)!;
    await prisma.privacyDownloadGrant.update({
      where: {
        tokenHash: createHash("sha256").update(expiredToken).digest("hex"),
      },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    await assert.rejects(() => consumeDownload(expiredToken), /süresi dolmuş/);

    const rollbackTenant = await runWithTenantIsolationBypass(
      "admin-console",
      () =>
        prisma.tenant.create({
          data: {
            slug: `${marker.toLowerCase()}-rollback`,
            companyName: `${marker}_ROLLBACK`,
            email: `${marker.toLowerCase()}-tenant@test.invalid`,
          },
        }),
    );
    const rollbackUser = await prisma.user.create({
      data: {
        email: `${marker.toLowerCase()}-subject@test.invalid`,
        name: "Rollback Subject",
        password: "unused",
        phone: "+905551112233",
      },
    });
    await runWithTenantIsolationBypass("admin-console", () =>
      prisma.tenantUser.create({
        data: {
          tenantId: rollbackTenant.id,
          userId: rollbackUser.id,
          isActive: true,
          preferences: { dashboard: "preserve" },
        },
      }),
    );
    const rollbackRequest = await createRequest(
      {
        tenantId: rollbackTenant.id,
        subjectEmail: rollbackUser.email,
        type: "ANONYMIZATION",
        scope: ["IDENTITY", "MEMBERSHIP"],
        reason: "Controlled transaction rollback assurance",
        ticketId: `${marker}-ROLLBACK`,
      },
      admins[0]!.id,
    );
    const collisionEmail = `anon-${createHash("sha256").update(`${rollbackRequest.id}:${rollbackUser.id}`).digest("hex").slice(0, 20)}@redacted.invalid`;
    const collision = await prisma.user.create({
      data: { email: collisionEmail, name: "Collision", password: "unused" },
    });
    try {
      await verifyIdentity(rollbackRequest.id, admins[0]!.id);
      await decideRequest(rollbackRequest.id, admins[1]!.id, true);
      await assert.rejects(() => executeRequest(rollbackRequest.id));
      const state = await runWithTenantIsolationBypass(
        "admin-console",
        async () => ({
          request: await prisma.dataSubjectRequest.findUniqueOrThrow({
            where: { id: rollbackRequest.id },
          }),
          membership: await prisma.tenantUser.findUniqueOrThrow({
            where: {
              tenantId_userId: {
                tenantId: rollbackTenant.id,
                userId: rollbackUser.id,
              },
            },
          }),
          user: await prisma.user.findUniqueOrThrow({
            where: { id: rollbackUser.id },
          }),
        }),
      );
      assert.equal(state.request.status, "APPROVED");
      assert.equal(state.membership.isActive, true);
      assert.deepEqual(state.membership.preferences, { dashboard: "preserve" });
      assert.equal(state.user.email, rollbackUser.email);
      assert.equal(state.user.name, "Rollback Subject");
      assert.equal(state.user.phone, "+905551112233");
    } finally {
      await runWithTenantIsolationBypass("admin-console", async () => {
        await prisma.dataSubjectRequest.deleteMany({
          where: { id: rollbackRequest.id },
        });
        await prisma.tenant.delete({ where: { id: rollbackTenant.id } });
      });
      await prisma.user.deleteMany({
        where: { id: { in: [rollbackUser.id, collision.id] } },
      });
    }
  } finally {
    await prisma.privacyDownloadGrant.deleteMany({
      where: { requestId: request.id },
    });
    await runWithTenantIsolationBypass("admin-console", async () => {
      await prisma.privacyLegalHold.deleteMany({
        where: {
          tenantId: member.tenantId,
          subjectEmail: member.user.email.toLowerCase(),
          reason:
            "Export erişimini engellememesi gereken test legal hold kaydı",
        },
      });
      await prisma.dataSubjectRequest.delete({ where: { id: request.id } });
    });
    await prisma.adminUser.deleteMany({
      where: { id: { in: admins.map((admin) => admin.id) } },
    });
  }
  console.log(
    "Privacy operations integration: OK (verification, two-person approval, legal hold, export, one-time expiry grant)",
  );
}
main().finally(() => prisma.$disconnect());
