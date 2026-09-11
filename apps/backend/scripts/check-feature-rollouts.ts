import assert from "node:assert/strict";
import { AdminChangeRequestType, FeatureKey } from "@prisma/client";
import { prisma } from "../src/lib/prisma.js";
import { approveAdminChange, submitAdminChange } from "../src/modules/platform/admin-change-request/admin-change-request.service.js";
import { createFeatureRollout, listFeatureRollouts, markRolloutPending, reportRolloutMetric, stopFeatureRollout } from "../src/modules/platform/feature-rollout/feature-rollout.service.js";
import { TenantFeatureService } from "../src/services/tenant-feature.service.js";

const suffix = `${Date.now()}-${process.pid}`;
const adminIds: string[] = [];
const rolloutIds: string[] = [];
let tenantId = "";

async function activate(rollout: Awaited<ReturnType<typeof createFeatureRollout>>, requesterId: string, approverId: string): Promise<void> {
  const request = await submitAdminChange({
    type: AdminChangeRequestType.FEATURE_ROLLOUT_ACTIVATE,
    targetId: rollout.id,
    targetLabel: `${rollout.plan} / ${rollout.featureKey} / v${rollout.version}`,
    requiredPermission: "feature.approve",
    payload: { rolloutId: rollout.id },
    previousValues: { status: "DRAFT" },
    affectedTenantCount: 1,
    affectedUserCount: 0,
    requestedById: requesterId,
    reason: rollout.reason,
  });
  await markRolloutPending(rollout.id);
  await assert.rejects(approveAdminChange(request.id, requesterId, ["feature.approve"]));
  await approveAdminChange(request.id, approverId, ["feature.approve"]);
}

async function createVersion(adminId: string, value: string) {
  const rollout = await createFeatureRollout(adminId, {
    plan: "STARTER",
    featureKey: FeatureKey.CUSTOM_REPORTING,
    environment: "PRODUCTION",
    stage: "GENERAL",
    value,
    isEnabled: true,
    rolloutPercentage: 100,
    targetTenantIds: [],
    dependencies: [],
    conflicts: [],
    startsAt: new Date(Date.now() - 1000),
    endsAt: new Date(Date.now() + 86400000),
    errorThresholdPct: 5,
    reason: "Controlled rollout integration test",
  });
  rolloutIds.push(rollout.id);
  return rollout;
}

async function main(): Promise<void> {
  const role = await prisma.adminRole.findFirstOrThrow({ where: { key: "SUPER_ADMIN" } });
  for (const order of [1, 2]) {
    const admin = await prisma.adminUser.create({
      data: {
        email: `rollout-admin-${order}-${suffix}@test.local`,
        name: `Rollout Admin ${order}`,
        password: "unused",
        mfaEnabled: true,
        roleAssignments: { create: { adminRoleId: role.id } },
      },
    });
    adminIds.push(admin.id);
  }
  const requester = adminIds[0];
  const approver = adminIds[1];
  assert.ok(requester && approver);
  const tenant = await prisma.tenant.create({
    data: { slug: `rollout-${suffix}`, companyName: "Rollout Test", email: `rollout-${suffix}@test.local`, plan: "STARTER", status: "ACTIVE" },
  });
  tenantId = tenant.id;

  await assert.rejects(createFeatureRollout(requester, {
    plan: "STARTER",
    featureKey: FeatureKey.CUSTOM_REPORTING,
    environment: "PRODUCTION",
    stage: "GENERAL",
    value: "true",
    isEnabled: true,
    rolloutPercentage: 100,
    targetTenantIds: [],
    dependencies: [FeatureKey.CUSTOM_REPORTING],
    conflicts: [],
    startsAt: new Date(),
    errorThresholdPct: 5,
    reason: "Invalid self dependency scenario",
  }));

  const first = await createVersion(requester, "true");
  assert.ok(first.version >= 1);
  await activate(first, requester, approver);
  const resolver = new TenantFeatureService(prisma);
  assert.equal((await resolver.resolveFeature(tenant.id, FeatureKey.CUSTOM_REPORTING)).value, "true");

  const second = await createVersion(requester, "false");
  assert.equal(second.version, first.version + 1);
  await activate(second, requester, approver);
  assert.equal((await resolver.resolveFeature(tenant.id, FeatureKey.CUSTOM_REPORTING)).value, "false");

  const rolledBack = await reportRolloutMetric(second.id, 6, approver);
  assert.equal(rolledBack.status, "ROLLED_BACK");
  assert.equal((await prisma.featureRollout.findUniqueOrThrow({ where: { id: first.id } })).status, "ACTIVE");
  assert.equal((await resolver.resolveFeature(tenant.id, FeatureKey.CUSTOM_REPORTING)).value, "true");

  const killed = await stopFeatureRollout(first.id, approver, "Emergency rollback integration test", true);
  assert.equal(killed.killSwitch, true);
  assert.ok((await listFeatureRollouts()).some((item) => item.id === second.id));
  console.log("Feature rollout integration: OK (versions, approval, runtime targeting, automatic previous-version rollback, kill switch)");
}

main().finally(async () => {
  await prisma.adminChangeRequest.deleteMany({ where: { targetId: { in: rolloutIds } } });
  await prisma.featureRollout.deleteMany({ where: { id: { in: rolloutIds } } });
  if (tenantId) await prisma.tenant.deleteMany({ where: { id: tenantId } });
  await prisma.adminUser.deleteMany({ where: { id: { in: adminIds } } });
  await prisma.$disconnect();
}).catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
