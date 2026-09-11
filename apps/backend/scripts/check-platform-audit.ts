import "dotenv/config";
import assert from "node:assert/strict";
import { Hono } from "hono";
import { prisma } from "../src/lib/prisma.js";
import { platformAdminAuditMiddleware } from "../src/middleware/platform-admin-audit.js";
import {
  createPlatformAudit,
  exportPlatformAudit,
  getPlatformAudit,
  listPlatformAudit,
  updateRetentionPolicy,
  verifyPlatformAuditIntegrity,
} from "../src/modules/platform/platform-audit/platform-audit.service.js";

async function main(): Promise<void> {
  const admin = await prisma.adminUser.findFirstOrThrow();
  const marker = `audit-test-${Date.now().toString(36)}`;
  await createPlatformAudit({
    actorId: admin.id,
    action: "UPDATE",
    module: "INTEGRATION_TEST",
    targetType: "tenant",
    targetId: marker,
    outcome: "SUCCESS",
    reason: "Platform audit integrity integration",
    approvalId: `approval-${marker}`,
    ipAddress: "127.0.0.1",
    device: "integration-agent",
    requestId: `request-${marker}`,
    correlationId: `correlation-${marker}`,
    beforeValues: { status: "ACTIVE", secret: "***MASKED***" },
    afterValues: { status: "SUSPENDED", secret: "***MASKED***" },
  });
  await createPlatformAudit({
    actorId: admin.id,
    action: "POST",
    module: "INTEGRATION_TEST",
    targetType: "incident",
    targetId: marker,
    outcome: "DENIED",
    reason: "Permission verification",
  });
  const page = await listPlatformAudit({
    page: 1,
    limit: 20,
    module: "INTEGRATION_TEST",
    target: marker,
  });
  assert.equal(page.data.length, 2);
  assert.equal(
    page.data.some((entry) => entry.outcome === "DENIED"),
    true,
  );
  const changed = page.data.find((entry) => entry.action === "UPDATE");
  assert.ok(changed);
  assert.deepEqual(
    changed.changes.map((item) => item.field),
    ["status"],
  );
  assert.equal(
    (await getPlatformAudit(changed.id))?.requestId,
    `request-${marker}`,
  );
  assert.equal(
    (
      await exportPlatformAudit(
        { module: "INTEGRATION_TEST", target: marker },
        "csv",
      )
    ).body.includes(marker),
    true,
  );
  assert.equal(
    JSON.parse(
      (
        await exportPlatformAudit(
          { module: "INTEGRATION_TEST", target: marker },
          "json",
        )
      ).body,
    ).length,
    2,
  );
  const app = new Hono();
  app.use("*", async (c, next) => {
    c.set("adminId", admin.id);
    await next();
  });
  app.use("*", platformAdminAuditMiddleware);
  app.post("/api/admin/tenants/:id", (c) => c.json({ ok: true }));
  const response = await app.request(`/api/admin/tenants/${marker}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "content-length": "51",
      "x-request-id": `middleware-${marker}`,
      "x-correlation-id": `correlation-${marker}`,
    },
    body: JSON.stringify({ password: "must-not-persist", status: "ACTIVE" }),
  });
  assert.equal(response.status, 200);
  const middlewareEntry = await prisma.platformAdminAuditLog.findFirstOrThrow({
    where: { requestId: `middleware-${marker}` },
  });
  assert.equal(
    JSON.stringify(middlewareEntry.afterValues).includes("must-not-persist"),
    false,
  );
  assert.equal(
    JSON.stringify(middlewareEntry.afterValues).includes("***MASKED***"),
    true,
  );
  assert.deepEqual(await verifyPlatformAuditIntegrity(), {
    valid: true,
    checked: await prisma.platformAdminAuditLog.count(),
    brokenAtId: null,
  });
  await assert.rejects(
    () =>
      prisma.platformAdminAuditLog.update({
        where: { id: changed.id },
        data: { reason: "tampered" },
      }),
    /append-only/,
  );
  await assert.rejects(
    () => prisma.platformAdminAuditLog.delete({ where: { id: changed.id } }),
    /append-only/,
  );
  assert.equal(await updateRetentionPolicy(2190, admin.id), 2190);
  assert.equal(await updateRetentionPolicy(2555, admin.id), 2555);
  console.log(
    "Platform audit integration: OK (actor/target/outcome filters, field diff, CSV/JSON, hash chain, append-only trigger, retention)",
  );
}

main()
  .finally(() => prisma.$disconnect())
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
