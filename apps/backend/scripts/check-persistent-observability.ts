import assert from "node:assert/strict";
import { prisma } from "../src/lib/prisma.js";
import {
  getObservabilitySnapshot,
  recordUnhandledError,
} from "../src/services/observability.service.js";
import {
  capturePersistentSnapshot,
  createDeployment,
  getPersistentDashboard,
  silenceAlert,
  updateAlertOwnership,
  upsertSlo,
} from "../src/modules/platform/persistent-observability/persistent-observability.service.js";

const suffix = `${Date.now()}-${process.pid}`;
const serviceId = `backend-test-${suffix}`;
let adminId = "";
let tenantId = "";

async function main(): Promise<void> {
  const role = await prisma.adminRole.findFirstOrThrow({
    where: { key: "SUPER_ADMIN" },
  });
  const admin = await prisma.adminUser.create({
    data: {
      email: `slo-admin-${suffix}@test.local`,
      name: "SLO Admin",
      password: "unused",
      mfaEnabled: true,
      roleAssignments: { create: { adminRoleId: role.id } },
    },
  });
  adminId = admin.id;
  const tenant = await prisma.tenant.create({
    data: {
      slug: `slo-${suffix}`,
      companyName: "SLO Test",
      email: `slo-${suffix}@test.local`,
      plan: "STARTER",
      status: "ACTIVE",
    },
  });
  tenantId = tenant.id;
  recordUnhandledError({
    method: "GET",
    path: "/integration-observability",
    message: "persistent log integration",
    requestId: `request-${suffix}`,
    correlationId: `correlation-${suffix}`,
  });
  const base = await getObservabilitySnapshot(prisma);
  const active = {
    ...base,
    alerts: base.alerts.map((item, index) =>
      index === 0 ? { ...item, active: true, value: item.threshold + 1 } : item,
    ),
  };
  await capturePersistentSnapshot(active, serviceId);
  assert.equal(
    await prisma.observabilityMetricPoint.count({
      where: { scopeId: serviceId },
    }),
    4,
  );
  assert.equal(
    await prisma.observabilityLogEntry.count({
      where: { service: serviceId, requestId: `request-${suffix}` },
    }),
    1,
  );
  assert.equal(
    await prisma.observabilityMetricPoint.count({
      where: {
        scope: "TENANT",
        scopeId: tenantId,
        metricKey: "operation_health_pct",
      },
    }),
    1,
  );

  const slo = await upsertSlo({
    name: "Integration availability",
    scope: "SERVICE",
    scopeId: serviceId,
    metricKey: "availability_pct",
    targetPercentage: 99.9,
    windowDays: 30,
    owner: "platform-operations",
    runbookUrl: "https://runbooks.local/integration",
    notificationChannel: "ops-test",
    isEnabled: true,
  });
  const dashboard = await getPersistentDashboard("24h");
  const status = dashboard.slos.find((item) => item.id === slo.id);
  assert.ok(status && status.sampleCount === 1 && status.sliPercentage >= 0);
  const alert = await prisma.observabilityAlertHistory.findFirstOrThrow({
    where: { scopeId: serviceId, status: "OPEN" },
  });
  const owned = await updateAlertOwnership(alert.id, adminId, {
    owner: "sre-team",
    runbookUrl: "https://runbooks.local/sre",
    notificationChannel: "pager-sre",
  });
  assert.equal(owned.owner, "sre-team");
  const silenced = await silenceAlert(
    alert.id,
    adminId,
    new Date(Date.now() + 3600000),
    "Integration test maintenance silence",
  );
  assert.ok(silenced.silencedUntil);
  const marker = await createDeployment(
    {
      service: serviceId,
      version: suffix,
      environment: "test",
      description: "integration",
      deployedAt: new Date(),
    },
    adminId,
  );
  assert.equal(marker.version, suffix);
  await capturePersistentSnapshot(
    {
      ...base,
      alerts: base.alerts.map((item) => ({ ...item, active: false })),
    },
    serviceId,
  );
  assert.equal(
    (
      await prisma.observabilityAlertHistory.findUniqueOrThrow({
        where: { id: alert.id },
      })
    ).status,
    "RESOLVED",
  );
  for (const range of ["1h", "24h", "7d", "30d"] as const)
    assert.equal((await getPersistentDashboard(range)).range, range);
  console.log(
    "Persistent observability integration: OK (service/tenant points, ranges, SLO budget, central log, alert lifecycle/ownership/silence, deploy marker)",
  );
}

main()
  .finally(async () => {
    await prisma.deploymentMarker.deleteMany({ where: { service: serviceId } });
    await prisma.observabilityAlertHistory.deleteMany({
      where: { scopeId: serviceId },
    });
    await prisma.observabilitySlo.deleteMany({ where: { scopeId: serviceId } });
    await prisma.observabilityMetricPoint.deleteMany({
      where: { scopeId: serviceId },
    });
    await prisma.observabilityLogEntry.deleteMany({
      where: { service: serviceId },
    });
    if (tenantId)
      await prisma.observabilityMetricPoint.deleteMany({
        where: { scope: "TENANT", scopeId: tenantId },
      });
    if (tenantId) await prisma.tenant.deleteMany({ where: { id: tenantId } });
    if (adminId) await prisma.adminUser.deleteMany({ where: { id: adminId } });
    await prisma.$disconnect();
  })
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
