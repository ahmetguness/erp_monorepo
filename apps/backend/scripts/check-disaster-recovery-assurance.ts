import assert from "node:assert/strict";
import { prisma } from "../src/lib/prisma.js";
import { createAdminSession } from "../src/modules/platform/admin-auth/admin-session.service.js";

const base = process.env.API_URL ?? "http://localhost:3001";
const marker = `TEST_E2E_DR_${Date.now()}_${process.pid}`;
const adminIds: string[] = [];
const backupIds: string[] = [];
let tenantId = "";
let originalPolicy: Awaited<
  ReturnType<typeof prisma.platformDisasterRecoveryPolicy.findUniqueOrThrow>
>;
let requestCounter = 0;

async function http(
  path: string,
  method = "GET",
  body?: unknown,
  token?: string,
) {
  const mutation = !["GET", "HEAD", "OPTIONS"].includes(method);
  const response = await fetch(`${base}${path}`, {
    method,
    headers: {
      origin: "http://localhost:3000",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(mutation
        ? { "idempotency-key": `${marker}-${++requestCounter}` }
        : {}),
      ...(body === undefined ? {} : { "content-type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) : null };
}

async function main(): Promise<void> {
  originalPolicy =
    await prisma.platformDisasterRecoveryPolicy.findUniqueOrThrow({
      where: { id: "default" },
    });
  const secret = process.env.ADMIN_JWT_SECRET;
  assert.ok(secret);
  const roles = await prisma.adminRole.findMany({
    include: { permissions: { include: { adminPermission: true } } },
  });
  const superRole = roles.find((role) => role.key === "SUPER_ADMIN");
  const limitedRole = roles.find(
    (role) =>
      role.key !== "SUPER_ADMIN" &&
      !role.permissions.some((item) =>
        ["operations.read", "operations.manage"].includes(
          item.adminPermission.key,
        ),
      ),
  );
  assert.ok(superRole && limitedRole);
  const [admin, limited] = await Promise.all([
    prisma.adminUser.create({
      data: {
        email: `${marker.toLowerCase()}-admin@test.invalid`,
        name: marker,
        password: "unused",
        mfaEnabled: true,
        roleAssignments: { create: { adminRoleId: superRole.id } },
      },
    }),
    prisma.adminUser.create({
      data: {
        email: `${marker.toLowerCase()}-limited@test.invalid`,
        name: `${marker}_LIMITED`,
        password: "unused",
        mfaEnabled: true,
        roleAssignments: { create: { adminRoleId: limitedRole.id } },
      },
    }),
  ]);
  adminIds.push(admin.id, limited.id);
  const [session, limitedSession] = await Promise.all([
    createAdminSession({
      adminId: admin.id,
      email: admin.email,
      tokenVersion: admin.tokenVersion,
      rememberMe: false,
      ipAddress: null,
      userAgent: marker,
      jwtSecret: secret,
    }),
    createAdminSession({
      adminId: limited.id,
      email: limited.email,
      tokenVersion: limited.tokenVersion,
      rememberMe: false,
      ipAddress: null,
      userAgent: marker,
      jwtSecret: secret,
    }),
  ]);
  assert.equal((await http("/api/admin/disaster-recovery")).status, 401);
  assert.equal(
    (
      await http(
        "/api/admin/disaster-recovery",
        "GET",
        undefined,
        limitedSession.accessToken,
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await http(
        "/api/admin/disaster-recovery/backups",
        "POST",
        {},
        limitedSession.accessToken,
      )
    ).status,
    403,
  );

  const now = new Date();
  const startedAt = new Date(now.getTime() - 10 * 60_000);
  const futurePayload = {
    providerRef: `${marker}_FUTURE`,
    status: "SUCCESS",
    sizeBytes: "100",
    encrypted: true,
    encryptionKeyRef: "kms-test",
    region: "eu-central-1",
    startedAt: now.toISOString(),
    completedAt: new Date(now.getTime() + 60 * 60_000).toISOString(),
  };
  assert.equal(
    (
      await http(
        "/api/admin/disaster-recovery/backups",
        "POST",
        futurePayload,
        session.accessToken,
      )
    ).status,
    400,
  );
  assert.equal(
    await prisma.platformBackupEvidence.count({
      where: { providerRef: futurePayload.providerRef },
    }),
    0,
  );

  const concurrentRef = `${marker}_CONCURRENT`;
  const validPayload = {
    providerRef: concurrentRef,
    status: "SUCCESS",
    sizeBytes: "1073741824",
    encrypted: true,
    encryptionKeyRef: "kms-test",
    region: "eu-central-1",
    replicaRegion: "eu-west-1",
    replicationLagSeconds: 12,
    startedAt: startedAt.toISOString(),
    completedAt: now.toISOString(),
  };
  const duplicate = await Promise.all([
    http(
      "/api/admin/disaster-recovery/backups",
      "POST",
      validPayload,
      session.accessToken,
    ),
    http(
      "/api/admin/disaster-recovery/backups",
      "POST",
      validPayload,
      session.accessToken,
    ),
  ]);
  assert.deepEqual(duplicate.map((item) => item.status).sort(), [201, 409]);
  const backupRows = await prisma.platformBackupEvidence.findMany({
    where: { providerRef: concurrentRef },
  });
  assert.equal(backupRows.length, 1);
  backupIds.push(backupRows[0]!.id);

  assert.equal(
    (
      await http(
        "/api/admin/disaster-recovery/restore-drills",
        "POST",
        {
          backupId: backupRows[0]!.id,
          environment: "production",
          runbookUrl: "https://runbooks.example/dr",
          approvalId: "APR-TEST",
        },
        session.accessToken,
      )
    ).status,
    400,
  );
  assert.equal(
    (
      await http(
        "/api/admin/disaster-recovery/restore-drills",
        "POST",
        {
          backupId: `missing-${marker}`,
          environment: "dr-validation",
          runbookUrl: "https://runbooks.example/dr",
          approvalId: "APR-TEST",
        },
        session.accessToken,
      )
    ).status,
    400,
  );
  const created = await http(
    "/api/admin/disaster-recovery/restore-drills",
    "POST",
    {
      backupId: backupRows[0]!.id,
      environment: "dr-validation",
      runbookUrl: "https://runbooks.example/dr",
      approvalId: "APR-TEST",
    },
    session.accessToken,
  );
  assert.equal(created.status, 201);
  assert.equal(created.body.data.status, "RUNNING");
  const drillId = created.body.data.id as string;
  const completion = {
    status: "PASSED",
    recoveryPointAt: startedAt.toISOString(),
    actualRpoMinutes: 10,
    actualRtoMinutes: 20,
    notes: "TEST_E2E izole ortam veri bütünlüğü doğrulandı.",
  };
  const completed = await Promise.all([
    http(
      `/api/admin/disaster-recovery/restore-drills/${drillId}`,
      "PATCH",
      completion,
      session.accessToken,
    ),
    http(
      `/api/admin/disaster-recovery/restore-drills/${drillId}`,
      "PATCH",
      completion,
      session.accessToken,
    ),
  ]);
  assert.deepEqual(completed.map((item) => item.status).sort(), [200, 400]);
  const drillRow = await prisma.platformRestoreDrill.findUniqueOrThrow({
    where: { id: drillId },
  });
  assert.equal(drillRow.status, "PASSED");
  assert.equal(drillRow.actualRpoMinutes, 10);
  assert.equal(
    (
      await http(
        `/api/admin/disaster-recovery/restore-drills/${drillId}`,
        "PATCH",
        completion,
        session.accessToken,
      )
    ).status,
    400,
  );

  assert.equal(
    (
      await http(
        "/api/admin/disaster-recovery/policy",
        "PUT",
        {
          targetRpoMinutes: 0,
          targetRtoMinutes: 20,
          maxReplicationLagSeconds: 30,
        },
        session.accessToken,
      )
    ).status,
    400,
  );
  const policy = {
    targetRpoMinutes: 30,
    targetRtoMinutes: 60,
    maxReplicationLagSeconds: 45,
  };
  assert.equal(
    (
      await http(
        "/api/admin/disaster-recovery/policy",
        "PUT",
        policy,
        session.accessToken,
      )
    ).status,
    200,
  );
  const storedPolicy =
    await prisma.platformDisasterRecoveryPolicy.findUniqueOrThrow({
      where: { id: "default" },
    });
  assert.equal(storedPolicy.targetRpoMinutes, 30);
  assert.equal(storedPolicy.updatedById, admin.id);
  const healthy = await http(
    "/api/admin/disaster-recovery",
    "GET",
    undefined,
    session.accessToken,
  );
  assert.equal(healthy.status, 200);
  assert.equal(healthy.body.data.latestBackup.providerRef, concurrentRef);
  assert.equal(healthy.body.data.lastRestoreDrill.id, drillId);
  assert.equal(healthy.body.data.health, "HEALTHY");

  await prisma.platformRestoreDrill.createMany({
    data: Array.from({ length: 51 }, (_, index) => ({
      backupId: backupRows[0]!.id,
      status: "PLANNED",
      environment: `${marker}-queued-${index}`,
      runbookUrl: "https://runbooks.example/dr",
      approvalId: `APR-QUEUED-${index}`,
      requestedById: admin.id,
    })),
  });
  const crowded = await http(
    "/api/admin/disaster-recovery",
    "GET",
    undefined,
    session.accessToken,
  );
  assert.equal(crowded.body.data.restoreDrills.length, 50);
  assert.equal(crowded.body.data.lastRestoreDrill.id, drillId);
  assert.equal(crowded.body.data.health, "HEALTHY");

  const failedRef = `${marker}_FAILED`;
  const failed = await http(
    "/api/admin/disaster-recovery/backups",
    "POST",
    {
      ...validPayload,
      providerRef: failedRef,
      status: "FAILED",
      completedAt: new Date(now.getTime() + 1_000).toISOString(),
    },
    session.accessToken,
  );
  assert.equal(failed.status, 201);
  backupIds.push(failed.body.data.id);
  assert.equal(
    (
      await http(
        "/api/admin/disaster-recovery",
        "GET",
        undefined,
        session.accessToken,
      )
    ).body.data.health,
    "CRITICAL",
  );

  const tenant = await prisma.tenant.create({
    data: {
      slug: `${marker.toLowerCase()}-tenant`,
      companyName: `${marker}_TENANT`,
      email: `${marker.toLowerCase()}@test.invalid`,
      status: "ACTIVE",
      plan: "STARTER",
    },
  });
  tenantId = tenant.id;
  const deploymentPath = `/api/admin/tenants/${tenant.id}/deployment-operations`;
  assert.equal(
    (await http(deploymentPath, "GET", undefined, session.accessToken)).status,
    200,
  );
  assert.equal(
    (
      await http(
        `${deploymentPath}/backup-simulation`,
        "POST",
        undefined,
        session.accessToken,
      )
    ).status,
    200,
  );
  const settings = {
    environmentName: "test-dr",
    releaseChannel: "stable",
    backupEnabled: true,
    backupFrequency: "hourly",
    backupRetentionDays: 31,
    maintenanceWindow: "Sun 02:00-03:00",
  };
  assert.equal(
    (await http(deploymentPath, "PUT", settings, session.accessToken)).status,
    200,
  );
  assert.equal(
    (
      await http(
        deploymentPath,
        "PUT",
        { ...settings, backupRetentionDays: 0 },
        session.accessToken,
      )
    ).status,
    400,
  );
  const dbSettings = await prisma.tenantSetting.findMany({
    where: { tenantId: tenant.id },
  });
  assert.ok(
    dbSettings.some(
      (item) => item.key === "deployment.operations.backup.last_run_at",
    ),
  );
  assert.ok(
    dbSettings.some(
      (item) =>
        item.key === "deployment.operations.backup.retention_days" &&
        item.value === "31",
    ),
  );
  assert.equal(
    (
      await http(
        `/api/admin/tenants/missing-${marker}/deployment-operations`,
        "GET",
        undefined,
        session.accessToken,
      )
    ).status,
    404,
  );

  console.log(
    "Disaster recovery assurance PASS: HTTP RBAC, validation, concurrent duplicate backup, restore lifecycle/concurrency, health math, policy persistence and tenant backup simulation verified.",
  );
}

main()
  .finally(async () => {
    if (backupIds.length)
      await prisma.platformRestoreDrill.deleteMany({
        where: { backupId: { in: backupIds } },
      });
    if (backupIds.length)
      await prisma.platformBackupEvidence.deleteMany({
        where: { id: { in: backupIds } },
      });
    if (tenantId) await prisma.tenant.deleteMany({ where: { id: tenantId } });
    if (originalPolicy)
      await prisma.platformDisasterRecoveryPolicy.update({
        where: { id: "default" },
        data: {
          targetRpoMinutes: originalPolicy.targetRpoMinutes,
          targetRtoMinutes: originalPolicy.targetRtoMinutes,
          maxReplicationLagSeconds: originalPolicy.maxReplicationLagSeconds,
          updatedById: originalPolicy.updatedById,
        },
      });
    if (adminIds.length)
      await prisma.adminUser.deleteMany({ where: { id: { in: adminIds } } });
    const remaining = await prisma.platformBackupEvidence.count({
      where: { providerRef: { startsWith: marker } },
    });
    console.log(`cleanupRemaining=${remaining}`);
    await prisma.$disconnect();
  })
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
