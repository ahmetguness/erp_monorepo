import assert from "node:assert/strict";
import { prisma } from "../src/lib/prisma.js";
import {
  getOperationItem,
  interveneOperations,
} from "../src/modules/platform/operation-intervention/operation-intervention.service.js";

const suffix = `${Date.now()}-${process.pid}`;
let tenantId = "";
let adminId = "";

async function main(): Promise<void> {
  const role = await prisma.adminRole.findFirstOrThrow({
    where: { key: "SUPER_ADMIN" },
  });
  const admin = await prisma.adminUser.create({
    data: {
      email: `operation-admin-${suffix}@test.local`,
      name: "Operation Admin",
      password: "unused",
      mfaEnabled: true,
      roleAssignments: { create: { adminRoleId: role.id } },
    },
  });
  adminId = admin.id;
  const tenant = await prisma.tenant.create({
    data: {
      slug: `operation-${suffix}`,
      companyName: "Operation Test",
      email: `operation-${suffix}@test.local`,
      plan: "STARTER",
      status: "ACTIVE",
    },
  });
  tenantId = tenant.id;
  const integration = await prisma.marketplaceIntegration.create({
    data: { tenantId, channel: "OTHER", name: `Operation ${suffix}` },
  });
  const event = await prisma.domainEventOutbox.create({
    data: {
      tenantId,
      name: "customer.updated",
      source: "integration-test",
      idempotencyKey: `event-${suffix}`,
      entityType: "CONTACT",
      entityId: `contact-${suffix}`,
      status: "FAILED",
      attempts: 1,
      lastError: "temporary failure",
      payload: {
        email: "person@example.com",
        nested: { apiKey: "secret-value" },
      },
      context: { phone: "+90 555 111 2233" },
    },
  });
  const job = await prisma.marketplaceSyncJob.create({
    data: {
      tenantId,
      integrationId: integration.id,
      jobType: "SYNC_ORDERS",
      status: "FAILED",
      attempts: 2,
      maxAttempts: 5,
      errorMessage: "provider timeout",
      params: { token: "private" },
    },
  });

  const detail = await getOperationItem({ id: event.id, kind: "DOMAIN_EVENT" });
  assert.equal(
    JSON.stringify(detail.payload).includes("person@example.com"),
    false,
  );
  assert.equal(JSON.stringify(detail.payload).includes("secret-value"), false);
  assert.equal(JSON.stringify(detail.context).includes("555"), false);

  const items = [
    { id: event.id, kind: "DOMAIN_EVENT" as const },
    { id: job.id, kind: "MARKETPLACE_JOB" as const },
  ];
  const dryRun = await interveneOperations(
    {
      items,
      action: "RETRY",
      reason: "Transient provider failure retry",
      dryRun: true,
    },
    adminId,
  );
  assert.equal(dryRun.allowed, true);
  assert.equal(
    (
      await prisma.domainEventOutbox.findFirstOrThrow({
        where: { id: event.id, tenantId },
      })
    ).status,
    "FAILED",
  );
  await interveneOperations(
    {
      items,
      action: "RETRY",
      reason: "Transient provider failure retry",
      dryRun: false,
    },
    adminId,
  );
  assert.equal(
    (
      await prisma.domainEventOutbox.findFirstOrThrow({
        where: { id: event.id, tenantId },
      })
    ).status,
    "PENDING",
  );
  assert.equal(
    (
      await prisma.marketplaceSyncJob.findFirstOrThrow({
        where: { id: job.id, tenantId },
      })
    ).status,
    "PENDING",
  );

  const deadLetter = await prisma.domainEventOutbox.create({
    data: {
      tenantId,
      name: "invoice.failed",
      source: "integration-test",
      idempotencyKey: `dead-${suffix}`,
      entityType: "INVOICE",
      entityId: `invoice-${suffix}`,
      status: "FAILED",
      attempts: 5,
      payload: {},
      context: {},
    },
  });
  const denied = await interveneOperations(
    {
      items: [{ id: deadLetter.id, kind: "DOMAIN_EVENT" }],
      action: "RETRY",
      reason: "Retry limit validation test",
      dryRun: true,
    },
    adminId,
  );
  assert.equal(denied.allowed, false);
  await interveneOperations(
    {
      items: [{ id: deadLetter.id, kind: "DOMAIN_EVENT" }],
      action: "QUARANTINE",
      reason: "Poison event moved to quarantine",
      dryRun: false,
    },
    adminId,
  );
  await interveneOperations(
    {
      items: [{ id: deadLetter.id, kind: "DOMAIN_EVENT" }],
      action: "RESOLVE",
      reason: "Payload source corrected externally",
      dryRun: false,
    },
    adminId,
  );
  const resolved = await prisma.domainEventOutbox.findFirstOrThrow({
    where: { id: deadLetter.id, tenantId },
  });
  assert.ok(
    resolved.quarantinedAt && resolved.resolvedAt && resolved.resolutionNote,
  );
  assert.ok(
    (await prisma.auditLog.count({
      where: { tenantId, module: "OPERATION_INTERVENTION" },
    })) >= 4,
  );
  console.log(
    "Operation intervention integration: OK (PII masking, bulk dry-run/retry, limit, quarantine, resolution, audit)",
  );
}

main()
  .finally(async () => {
    if (tenantId) await prisma.tenant.deleteMany({ where: { id: tenantId } });
    if (adminId) await prisma.adminUser.deleteMany({ where: { id: adminId } });
    await prisma.$disconnect();
  })
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
