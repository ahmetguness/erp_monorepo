import "dotenv/config";
import assert from "node:assert/strict";
import { prisma } from "../src/lib/prisma.js";
import { runWithTenantIsolationBypass } from "../src/lib/tenant-isolation-context.js";
import { consumeDownload, createDownloadGrant, createLegalHold, createRequest, decideRequest, executeRequest, verifyIdentity } from "../src/modules/platform/privacy-operations/privacy.service.js";

async function main(): Promise<void> {
  const admins = await prisma.adminUser.findMany({ where: { isActive: true }, take: 2, select: { id: true } });
  assert.equal(admins.length, 2, "İki aktif admin gerekli");
  const member = await runWithTenantIsolationBypass("admin-console", async () => await prisma.tenantUser.findFirst({ where: { user: { email: { not: "" } } }, select: { tenantId: true, user: { select: { email: true } } } }));
  assert.ok(member);
  const request = await createRequest({ tenantId: member.tenantId, subjectEmail: member.user.email.toLowerCase(), type: "EXPORT", scope: ["IDENTITY", "MEMBERSHIP"], reason: "KVKK erişim talebi entegrasyon doğrulaması", ticketId: `PRIV-TEST-${Date.now()}` }, admins[0]!.id);
  try {
    await verifyIdentity(request.id, admins[0]!.id);
    await assert.rejects(() => decideRequest(request.id, admins[0]!.id, true), /onay veremez/);
    await decideRequest(request.id, admins[1]!.id, true);
    await createLegalHold(
      {
        tenantId: member.tenantId,
        subjectEmail: member.user.email.toLowerCase(),
        reason: "Export erişimini engellememesi gereken test legal hold kaydı",
      },
      admins[1]!.id,
    );
    assert.equal((await executeRequest(request.id)).status, "COMPLETED");
    const grant = await createDownloadGrant(request.id, admins[1]!.id);
    const token = grant.url.split("/").at(-1)!;
    assert.equal((await consumeDownload(token)).requestId, request.id);
    await assert.rejects(() => consumeDownload(token), /kullanılmış/);
  } finally {
    await prisma.privacyDownloadGrant.deleteMany({ where: { requestId: request.id } });
    await runWithTenantIsolationBypass("admin-console", async () => {
      await prisma.privacyLegalHold.deleteMany({
        where: {
          tenantId: member.tenantId,
          subjectEmail: member.user.email.toLowerCase(),
          reason: "Export erişimini engellememesi gereken test legal hold kaydı",
        },
      });
      await prisma.dataSubjectRequest.delete({ where: { id: request.id } });
    });
  }
  console.log("Privacy operations integration: OK (verification, two-person approval, legal hold, export, one-time expiry grant)");
}
main().finally(() => prisma.$disconnect());
