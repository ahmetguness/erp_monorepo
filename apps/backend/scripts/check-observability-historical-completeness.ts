import assert from "node:assert/strict";
import { prisma } from "../src/lib/prisma.js";
import { createAdminSession } from "../src/modules/platform/admin-auth/admin-session.service.js";

const base = process.env.API_URL ?? "http://localhost:3001";
const marker = `TEST_E2E_OBS_COMPLETENESS_${Date.now()}_${process.pid}`;
const pointCount = 20_050;
let superAdminId = "";
let limitedAdminId = "";

async function request(path: string, token?: string) {
  const response = await fetch(`${base}${path}`, {
    headers: {
      origin: "http://localhost:3000",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
  });
  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) : null };
}

async function main(): Promise<void> {
  const secret = process.env.ADMIN_JWT_SECRET;
  assert.ok(secret, "ADMIN_JWT_SECRET is required");
  const roles = await prisma.adminRole.findMany({
    include: { permissions: { include: { adminPermission: true } } },
  });
  const superRole = roles.find((role) => role.key === "SUPER_ADMIN");
  const limitedRole = roles.find((role) =>
    role.key !== "SUPER_ADMIN" &&
    !role.permissions.some((item) => item.adminPermission.key === "operations.read"),
  );
  assert.ok(superRole, "SUPER_ADMIN role missing");
  assert.ok(limitedRole, "A role without operations.read is required");

  const [superAdmin, limitedAdmin] = await Promise.all([
    prisma.adminUser.create({ data: {
      email: `${marker.toLowerCase()}-super@test.invalid`, name: marker, password: "unused", mfaEnabled: true,
      roleAssignments: { create: { adminRoleId: superRole.id } },
    } }),
    prisma.adminUser.create({ data: {
      email: `${marker.toLowerCase()}-limited@test.invalid`, name: `${marker}_LIMITED`, password: "unused", mfaEnabled: true,
      roleAssignments: { create: { adminRoleId: limitedRole.id } },
    } }),
  ]);
  superAdminId = superAdmin.id;
  limitedAdminId = limitedAdmin.id;

  const [superSession, limitedSession] = await Promise.all([
    createAdminSession({ adminId: superAdmin.id, email: superAdmin.email, tokenVersion: superAdmin.tokenVersion, rememberMe: false, ipAddress: null, userAgent: marker, jwtSecret: secret }),
    createAdminSession({ adminId: limitedAdmin.id, email: limitedAdmin.email, tokenVersion: limitedAdmin.tokenVersion, rememberMe: false, ipAddress: null, userAgent: marker, jwtSecret: secret }),
  ]);

  const end = new Date(Math.floor(Date.now() / 60_000) * 60_000 - 60_000);
  const rows = Array.from({ length: pointCount }, (_, index) => ({
    metricKey: "availability_pct",
    scope: "SERVICE",
    scopeId: marker,
    value: index % 2 === 0 ? 98 : 100,
    bucketAt: new Date(end.getTime() - (pointCount - 1 - index) * 60_000),
  }));
  for (let offset = 0; offset < rows.length; offset += 1_000) {
    const created = await prisma.observabilityMetricPoint.createMany({ data: rows.slice(offset, offset + 1_000) });
    assert.equal(created.count, Math.min(1_000, rows.length - offset));
  }
  const slo = await prisma.observabilitySlo.create({ data: {
    name: marker, scope: "SERVICE", scopeId: marker, metricKey: "availability_pct",
    targetPercentage: 99.9, windowDays: 30, owner: "platform-assurance",
    runbookUrl: "https://runbooks.local/observability-completeness", notificationChannel: "test", isEnabled: true,
  } });

  assert.equal(await prisma.observabilityMetricPoint.count({ where: { scopeId: marker } }), pointCount);
  assert.equal((await request("/api/admin/observability/history?range=30d")).status, 401);
  assert.equal((await request("/api/admin/observability/history?range=30d", limitedSession.accessToken)).status, 403);
  assert.equal((await request("/api/admin/observability/history?range=invalid", superSession.accessToken)).status, 400);

  const response = await request("/api/admin/observability/history?range=30d", superSession.accessToken);
  assert.equal(response.status, 200);
  const dashboard = response.body.data;
  const independentEligible = await prisma.observabilityMetricPoint.count({ where: { bucketAt: { gte: new Date(Date.now() - 30 * 86_400_000) } } });
  assert.equal(dashboard.pointsMeta.totalEligible, independentEligible);
  assert.equal(dashboard.pointsMeta.returned, 20_000);
  assert.equal(dashboard.points.length, 20_000);
  assert.equal(dashboard.pointsMeta.limit, 20_000);
  assert.equal(dashboard.pointsMeta.truncated, true);
  assert.equal(dashboard.pointsMeta.hasMore, true);
  assert.equal(dashboard.pointsMeta.coverage, "LATEST");
  assert.equal(dashboard.pointsMeta.ordering, "bucketAt_asc");
  for (let index = 1; index < dashboard.points.length; index += 1) {
    assert.ok(new Date(dashboard.points[index - 1].bucketAt).getTime() <= new Date(dashboard.points[index].bucketAt).getTime());
  }
  assert.ok(dashboard.points.some((point: { scopeId: string; bucketAt: string }) => point.scopeId === marker && point.bucketAt === end.toISOString()), "latest fixture point missing from capped graph");

  const aggregate = await prisma.observabilityMetricPoint.aggregate({
    where: { scopeId: marker, metricKey: "availability_pct" },
    _count: { _all: true }, _avg: { value: true },
  });
  assert.equal(aggregate._count._all, pointCount);
  assert.equal(aggregate._avg.value?.toNumber(), 99);
  const status = dashboard.slos.find((item: { id: string }) => item.id === slo.id);
  assert.ok(status);
  assert.equal(status.sampleCount, pointCount);
  assert.equal(status.sliPercentage, 99);
  assert.equal(status.errorBudgetRemainingPercentage, 0);

  console.log(JSON.stringify({
    fixtureEligible: pointCount,
    apiEligible: dashboard.pointsMeta.totalEligible,
    returned: dashboard.pointsMeta.returned,
    truncated: dashboard.pointsMeta.truncated,
    coverage: dashboard.pointsMeta.coverage,
    sliSampleCount: status.sampleCount,
    sliPercentage: status.sliPercentage,
    errorBudgetRemainingPercentage: status.errorBudgetRemainingPercentage,
    unauthenticated: 401,
    unauthorized: 403,
    invalidRange: 400,
  }, null, 2));
}

main()
  .finally(async () => {
    await prisma.observabilitySlo.deleteMany({ where: { scopeId: marker } });
    await prisma.observabilityMetricPoint.deleteMany({ where: { scopeId: marker } });
    if (superAdminId || limitedAdminId) await prisma.adminUser.deleteMany({ where: { id: { in: [superAdminId, limitedAdminId].filter(Boolean) } } });
    const remaining = await prisma.observabilityMetricPoint.count({ where: { scopeId: marker } });
    console.log(`cleanupRemaining=${remaining}`);
    await prisma.$disconnect();
  })
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
