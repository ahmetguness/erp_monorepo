import assert from 'node:assert/strict';
import { prisma } from '../src/lib/prisma.js';
import { createLifecycleExport } from '../src/modules/platform/tenant-lifecycle/tenant-lifecycle-export.service.js';
import { decideTenantLifecycle, getTenantLifecycle, requestTenantLifecycle } from '../src/modules/platform/tenant-lifecycle/tenant-lifecycle.service.js';
import { assertLegacyTenantTransition, assertTenantTransition, TenantLifecycleError } from '../src/modules/platform/tenant-lifecycle/tenant-lifecycle.policy.js';

const suffix = `${Date.now()}-${process.pid}`;
let tenantId: string | undefined;
const adminIds: string[] = [];
const base = { reason: 'Lifecycle integration reason', impact: 'All tenant users lose application access', ticketId: 'LIFE-TEST' };

async function decide(id: string, adminId: string, decision: 'approve' | 'reject' = 'approve') {
  await decideTenantLifecycle(tenantId!, id, adminId, decision);
}
async function pendingId(): Promise<string> {
  return (await prisma.tenantLifecycleRequest.findFirstOrThrow({ where: { tenantId, state: 'PENDING' } })).id;
}

async function main(): Promise<void> {
  assert.doesNotThrow(() => assertTenantTransition('CANCELLED', 'ARCHIVED'));
  assert.throws(() => assertTenantTransition('ACTIVE', 'ARCHIVED'), TenantLifecycleError);
  assert.throws(() => assertLegacyTenantTransition('CANCELLED', 'ARCHIVED'), TenantLifecycleError);
  assert.throws(() => assertLegacyTenantTransition('ACTIVE', 'TRIAL'), TenantLifecycleError);

  const tenant = await prisma.tenant.create({ data: { slug: `lifecycle-${suffix}`, companyName: 'Lifecycle Test', email: `lifecycle-${suffix}@test.local`, status: 'CANCELLED' } });
  tenantId = tenant.id;
  const role = await prisma.adminRole.findUniqueOrThrow({ where: { key: 'SUPER_ADMIN' } });
  for (const index of [1, 2]) {
    const admin = await prisma.adminUser.create({ data: { name: `Lifecycle Admin ${index}`, email: `lifecycle-admin-${index}-${suffix}@test.local`, password: 'unused', mfaEnabled: true, roleAssignments: { create: { adminRoleId: role.id } } } });
    adminIds.push(admin.id);
  }
  const [first, second] = adminIds as [string, string];
  await requestTenantLifecycle(tenantId, first, { action: 'TRANSITION', targetStatus: 'ARCHIVED', ...base });
  await assert.rejects(decide(await pendingId(), first), TenantLifecycleError, 'Requester cannot self-approve');
  await decide(await pendingId(), second);
  assert.equal((await getTenantLifecycle(tenantId)).status, 'ARCHIVED');

  await requestTenantLifecycle(tenantId, first, { action: 'LEGAL_HOLD', legalHold: true, retentionUntil: new Date(Date.now() + 35 * 86400000).toISOString(), ...base });
  await decide(await pendingId(), second);
  const exported = await createLifecycleExport(tenantId, first);
  assert.match(exported.digest, /^[a-f0-9]{64}$/);
  assert.ok(!JSON.stringify(exported.data).match(/password|token|secret/i));
  const checklist = { ownerNotified: true, balancesReviewed: true, externalBackupVerified: true, retentionReviewed: true };
  const schedule = { action: 'TRANSITION' as const, targetStatus: 'DELETION_SCHEDULED' as const, deletionNotBefore: new Date(Date.now() + 40 * 86400000).toISOString(), retentionUntil: new Date(Date.now() + 35 * 86400000).toISOString(), exportId: exported.id, checklist, ...base };
  await assert.rejects(requestTenantLifecycle(tenantId, first, schedule), TenantLifecycleError, 'Legal hold blocks deletion');
  await requestTenantLifecycle(tenantId, first, { action: 'LEGAL_HOLD', legalHold: false, ...base });
  await decide(await pendingId(), second);
  const scheduleExport = await createLifecycleExport(tenantId, first);
  await assert.rejects(requestTenantLifecycle(tenantId, first, { ...schedule, exportId: exported.id }), TenantLifecycleError, 'Stale export blocked');
  await assert.rejects(requestTenantLifecycle(tenantId, first, { ...schedule, exportId: scheduleExport.id, checklist: { ...checklist, externalBackupVerified: false } }), TenantLifecycleError, 'Incomplete checklist blocked');
  await requestTenantLifecycle(tenantId, first, { ...schedule, exportId: scheduleExport.id });
  await decide(await pendingId(), second);
  let state = await getTenantLifecycle(tenantId);
  assert.equal(state.status, 'DELETION_SCHEDULED');
  assert.ok(state.deletionNotBefore && new Date(state.deletionNotBefore).getTime() >= Date.now() + 29 * 86400000);

  await assert.rejects(requestTenantLifecycle(tenantId, first, { action: 'TRANSITION', targetStatus: 'DELETED', exportId: scheduleExport.id, checklist, ...base }), TenantLifecycleError, 'Waiting period blocks deletion');
  await prisma.tenant.update({ where: { id: tenantId }, data: { deletionNotBefore: new Date(Date.now() - 1000), retentionUntil: new Date(Date.now() - 1000) } });
  const deletionExport = await createLifecycleExport(tenantId, first);
  await requestTenantLifecycle(tenantId, first, { action: 'TRANSITION', targetStatus: 'DELETED', exportId: deletionExport.id, checklist, ...base });
  await decide(await pendingId(), second);
  state = await getTenantLifecycle(tenantId);
  assert.equal(state.status, 'DELETED');
  assert.ok(state.deletedAt);

  await requestTenantLifecycle(tenantId, first, { action: 'TRANSITION', targetStatus: 'ARCHIVED', ...base });
  await decide(await pendingId(), second);
  state = await getTenantLifecycle(tenantId);
  assert.equal(state.status, 'ARCHIVED');
  assert.equal(state.deletedAt, null);
  assert.equal(state.deletionNotBefore, null);
  const audits = await prisma.auditLog.findMany({ where: { tenantId, module: 'TENANT_LIFECYCLE' } });
  assert.ok(audits.some(row => row.action === 'EXPORT'));
  assert.ok(audits.some(row => row.action === 'APPROVE' && row.adminId === second));
  console.log('Tenant lifecycle integration: OK (matrix, two-person approval, export, legal hold, retention, waiting period, soft delete, restore, audit)');
}

main().finally(async () => {
  if (tenantId) await prisma.tenant.deleteMany({ where: { id: tenantId } });
  await prisma.adminUser.deleteMany({ where: { id: { in: adminIds } } });
  await prisma.$disconnect();
}).catch((error: unknown) => { console.error(error); process.exitCode = 1; });
