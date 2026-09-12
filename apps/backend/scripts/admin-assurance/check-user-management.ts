import 'dotenv/config';
import assert from 'node:assert/strict';
import { ADMIN_ROLE_PERMISSIONS, type AdminPermission } from '@repo/types';
import { prisma } from '../../src/lib/prisma.js';
import { createAdminSession } from '../../src/modules/platform/admin-auth/admin-session.service.js';
import { assertSuperAdminPreserved, changeManagedAdmin } from '../../src/modules/platform/admin-users/admin-user.service.js';

const suffix = `${Date.now()}-${process.pid}`;
async function main(): Promise<void> {
  assert.throws(() => assertSuperAdminPreserved(true, false, 1));
  assert.doesNotThrow(() => assertSuperAdminPreserved(true, false, 2));
  const auditorPermissions: readonly AdminPermission[] = ADMIN_ROLE_PERMISSIONS.READ_ONLY_AUDITOR;
  assert.equal(auditorPermissions.includes('admin-user.manage'), false);
  const [superRole, supportRole] = await Promise.all([
    prisma.adminRole.findUniqueOrThrow({ where: { key: 'SUPER_ADMIN' } }),
    prisma.adminRole.findUniqueOrThrow({ where: { key: 'SUPPORT' } }),
  ]);
  const actor = await prisma.adminUser.create({ data: { name: 'Assurance Actor', email: `actor-${suffix}@test.local`, password: 'unused', mfaEnabled: true, roleAssignments: { create: { adminRoleId: superRole.id } } } });
  const target = await prisma.adminUser.create({ data: { name: 'Assurance Target', email: `target-${suffix}@test.local`, password: 'unused', mfaEnabled: true, roleAssignments: { create: { adminRoleId: supportRole.id } } } });
  try {
    await createAdminSession({ adminId: target.id, email: target.email, tokenVersion: target.tokenVersion, rememberMe: false, ipAddress: null, userAgent: 'assurance', jwtSecret: 'assurance-secret' });
    await assert.rejects(changeManagedAdmin(target.id, actor.id, { isActive: true, roles: ['SUPER_ADMIN'] }));
    await changeManagedAdmin(actor.id, target.id, { isActive: false, roles: ['SUPPORT'] });
    const changed = await prisma.adminUser.findUniqueOrThrow({ where: { id: target.id }, include: { sessions: true } });
    assert.equal(changed.isActive, false);
    assert.ok(changed.sessions.every((session) => session.revokedAt !== null));
    console.log('Admin user assurance: OK (role denial, update, session revoke, super-admin guard)');
  } finally {
    await prisma.adminUser.deleteMany({ where: { id: { in: [target.id, actor.id] } } });
    await prisma.$disconnect();
  }
}
main().catch(async (error: unknown) => { console.error(error); await prisma.$disconnect(); process.exit(1); });
