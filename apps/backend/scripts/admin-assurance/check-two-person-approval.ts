import 'dotenv/config';
import assert from 'node:assert/strict';
import { AdminChangeRequestType } from '@prisma/client';
import { prisma } from '../../src/lib/prisma.js';
import { approveAdminChange, submitAdminChange } from '../../src/modules/platform/admin-change-request/admin-change-request.service.js';

const suffix = `${Date.now()}-${process.pid}`;
async function main(): Promise<void> {
  const role = await prisma.adminRole.findUniqueOrThrow({ where: { key: 'SUPER_ADMIN' } });
  const requester = await prisma.adminUser.create({ data: { name: 'Requester', email: `requester-${suffix}@test.local`, password: 'unused', mfaEnabled: true, roleAssignments: { create: { adminRoleId: role.id } } } });
  const approver = await prisma.adminUser.create({ data: { name: 'Approver', email: `approver-${suffix}@test.local`, password: 'unused', mfaEnabled: true, roleAssignments: { create: { adminRoleId: role.id } } } });
  const tenant = await prisma.tenant.create({ data: { slug: `approval-${suffix}`, companyName: 'Approval Assurance', email: `tenant-${suffix}@test.local`, status: 'ACTIVE' } });
  const owner = await prisma.user.create({ data: { name: 'Tenant Owner', email: `owner-${suffix}@test.local`, password: 'unused', tenants: { create: { tenantId: tenant.id, isOwner: true } } } });
  let requestId: string | null = null;
  try {
    const request = await submitAdminChange({ type: AdminChangeRequestType.TENANT_STATUS_UPDATE, targetId: tenant.id, targetLabel: tenant.companyName, requiredPermission: 'tenant.status.approve', payload: { tenantId: tenant.id, status: 'SUSPENDED' }, previousValues: { status: 'ACTIVE' }, affectedTenantCount: 1, affectedUserCount: 0, requestedById: requester.id, reason: 'Operasyon güvence iki kişi onayı testi.' });
    requestId = request.id;
    await assert.rejects(approveAdminChange(request.id, requester.id, ['tenant.status.approve']));
    await assert.rejects(approveAdminChange(request.id, approver.id, ['tenant.read']));
    const applied = await approveAdminChange(request.id, approver.id, ['tenant.status.approve'], 'Bağımsız onay verildi.', `assurance-${suffix}`);
    assert.equal(applied.status, 'APPLIED');
    assert.equal((await prisma.tenant.findUniqueOrThrow({ where: { id: tenant.id } })).status, 'SUSPENDED');
    assert.ok(await prisma.auditLog.findFirst({ where: { tenantId: tenant.id, adminId: approver.id, requestId: `assurance-${suffix}` } }));
    assert.ok(await prisma.notification.findFirst({ where: { tenantId: tenant.id, userId: owner.id, module: 'admin' } }));
    console.log('Two-person approval assurance: OK (self/permission denial, tenant effect, notification, audit)');
  } finally {
    if (requestId) await prisma.adminChangeRequest.deleteMany({ where: { id: requestId } });
    await prisma.tenant.delete({ where: { id: tenant.id } });
    await prisma.user.delete({ where: { id: owner.id } });
    await prisma.adminUser.deleteMany({ where: { id: { in: [requester.id, approver.id] } } });
    await prisma.$disconnect();
  }
}
main().catch(async (error: unknown) => { console.error(error); await prisma.$disconnect(); process.exit(1); });
