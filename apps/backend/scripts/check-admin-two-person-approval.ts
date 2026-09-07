import { AdminChangeRequestType, TenantStatus } from '@prisma/client';
import { prisma } from '../src/lib/prisma.js';
import {
  approveAdminChange, AdminChangeRequestError, rollbackAdminChange, submitAdminChange,
} from '../src/modules/platform/admin-change-request/admin-change-request.service.js';
import { previewAdminChange } from '../src/modules/platform/admin-change-request/admin-change-preview.service.js';
import { resolveAdminAccess } from '../src/modules/platform/admin-access/admin-access.service.js';

const suffix = `${Date.now()}-${process.pid}`;
let tenantId: string | null = null;
let makerId: string | null = null;
let checkerId: string | null = null;

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function main(): Promise<void> {
  const superAdminRole = await prisma.adminRole.findUniqueOrThrow({ where: { key: 'SUPER_ADMIN' } });
  const [maker, checker] = await Promise.all([
    prisma.adminUser.create({ data: { email: `approval-maker-${suffix}@test.local`, name: 'Approval Maker', password: 'not-used', roleAssignments: { create: { adminRoleId: superAdminRole.id } } } }),
    prisma.adminUser.create({ data: { email: `approval-checker-${suffix}@test.local`, name: 'Approval Checker', password: 'not-used', roleAssignments: { create: { adminRoleId: superAdminRole.id } } } }),
  ]);
  makerId = maker.id;
  checkerId = checker.id;

  const tenant = await prisma.tenant.create({
    data: { slug: `approval-flow-${suffix}`, companyName: 'Approval Flow Test', email: `approval-tenant-${suffix}@test.local` },
  });
  tenantId = tenant.id;

  const preview = await previewAdminChange({
    type: AdminChangeRequestType.TENANT_STATUS_UPDATE,
    payload: { tenantId: tenant.id, status: TenantStatus.SUSPENDED },
  });
  assert(preview.changes.some((change) => change.field === 'status'), 'Status diff missing from preview.');
  assert(preview.requiresApproval, 'Critical status change must require approval.');

  const request = await submitAdminChange({
    type: AdminChangeRequestType.TENANT_STATUS_UPDATE,
    targetId: tenant.id,
    targetLabel: tenant.companyName,
    requiredPermission: 'tenant.status.approve',
    payload: { tenantId: tenant.id, status: TenantStatus.SUSPENDED },
    previousValues: { status: TenantStatus.TRIAL },
    affectedTenantCount: 1,
    affectedUserCount: 0,
    requestedById: maker.id,
    ticketId: `TEST-${suffix}`,
    reason: 'Tenant erişimini entegrasyon testinde doğrulamak',
  });

  const beforeApproval = await prisma.tenant.findUniqueOrThrow({ where: { id: tenant.id } });
  assert(beforeApproval.status === TenantStatus.TRIAL, 'Kritik işlem onaydan önce uygulanmamalı.');

  const makerAccess = await resolveAdminAccess(maker.id);
  assert(makerAccess !== null, 'Maker erişimi çözümlenemedi.');
  try {
    await approveAdminChange(request.id, maker.id, makerAccess.permissions);
    throw new Error('Maker kendi talebini onaylayabildi.');
  } catch (error) {
    assert(error instanceof AdminChangeRequestError && error.statusCode === 403, 'Maker onayı 403 ile engellenmedi.');
  }

  const checkerAccess = await resolveAdminAccess(checker.id);
  assert(checkerAccess !== null, 'Checker erişimi çözümlenemedi.');
  const applied = await approveAdminChange(request.id, checker.id, checkerAccess.permissions, 'Entegrasyon kontrolü');
  assert(applied.status === 'APPLIED', 'Talep APPLIED durumuna geçmedi.');
  assert(applied.decidedBy?.id === checker.id, 'Checker kimliği kaydedilmedi.');

  const afterApproval = await prisma.tenant.findUniqueOrThrow({ where: { id: tenant.id } });
  assert(afterApproval.status === TenantStatus.SUSPENDED, 'Onaylanan değişiklik hedefe uygulanmadı.');

  try {
    await approveAdminChange(request.id, checker.id, checkerAccess.permissions);
    throw new Error('Aynı talep ikinci kez uygulanabildi.');
  } catch (error) {
    assert(error instanceof AdminChangeRequestError && error.statusCode === 409, 'Tekrar onay 409 ile engellenmedi.');
  }

  const rollbackRequestId = `rollback-${suffix}`;
  const rolledBack = await rollbackAdminChange(
    request.id,
    checker.id,
    checkerAccess.permissions,
    'Integration test safe rollback operation',
    `TEST-${suffix}`,
    rollbackRequestId,
  );
  assert(rolledBack.status === 'APPLIED', 'Rollback was not applied.');
  assert(rolledBack.rollbackOfId === request.id, 'Rollback relationship was not recorded.');
  const afterRollback = await prisma.tenant.findUniqueOrThrow({ where: { id: tenant.id } });
  assert(afterRollback.status === TenantStatus.TRIAL, 'Rollback did not restore the previous tenant status.');
  const originalAfterRollback = await prisma.adminChangeRequest.findUniqueOrThrow({ where: { id: request.id } });
  assert(originalAfterRollback.status === 'ROLLED_BACK', 'Original request was not marked ROLLED_BACK.');
  const rollbackAudit = await prisma.auditLog.findFirst({
    where: { tenantId: tenant.id, approvalId: rolledBack.id },
    include: { admin: { select: { id: true, email: true } } },
  });
  assert(rollbackAudit?.adminId === checker.id, 'Rollback audit does not contain the admin identity.');
  assert(rollbackAudit.admin?.id === checker.id, 'Rollback audit actor relation is incorrect.');
  assert(rollbackAudit.admin.email === checker.email, 'Rollback audit actor email is incorrect.');
  assert(rollbackAudit?.rollbackOfId === request.id, 'Rollback audit relationship is missing.');
  assert(rollbackAudit?.requestId === rollbackRequestId, 'Rollback audit request identity is missing.');

  console.log('Admin two-person approval integration: OK');
}

main()
  .finally(async () => {
    if (tenantId) {
      await prisma.adminChangeRequest.deleteMany({ where: { targetId: tenantId } });
      await prisma.tenant.deleteMany({ where: { id: tenantId } });
    }
    const adminIds = [makerId, checkerId].filter((id): id is string => id !== null);
    if (adminIds.length > 0) await prisma.adminUser.deleteMany({ where: { id: { in: adminIds } } });
    await prisma.$disconnect();
  })
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : 'Bilinmeyen entegrasyon testi hatası.');
    process.exit(1);
  });
