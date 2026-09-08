import type { Prisma } from '@prisma/client';
import { ADMIN_ROLE_KEYS, type AdminRoleKey, type AdminUserSummary, type UpdateAdminInput } from '@repo/types';
import { prisma } from '../../../lib/prisma.js';
import { BaseError } from '../../../errors/index.js';

export class AdminUserError extends BaseError {
  constructor(message: string, status: 400 | 403 | 404 | 409 | 502 = 409) { super(message, status, 'ADMIN_USER_ERROR'); }
}

export async function lockAdminManagement(tx: Prisma.TransactionClient): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(82461703)`;
}

export async function requireManagingAdmin(tx: Prisma.TransactionClient, actorId: string): Promise<void> {
  const actor = await tx.adminUser.findFirst({ where: {
    id: actorId, isActive: true,
    roleAssignments: { some: { adminRole: { permissions: { some: { adminPermission: { key: 'admin-user.manage' } } } } } },
  }, select: { id: true } });
  if (!actor) throw new AdminUserError('Admin yönetimi yetkiniz bulunmuyor.', 403);
}

export function assertSuperAdminPreserved(wasActiveSuper: boolean, remainsActiveSuper: boolean, activeSuperCount: number): void {
  if (wasActiveSuper && !remainsActiveSuper && activeSuperCount <= 1) {
    throw new AdminUserError('Son aktif Super Admin devre dışı bırakılamaz veya Super Admin rolü kaldırılamaz.');
  }
}

export async function listManagedAdmins(): Promise<AdminUserSummary[]> {
  const users = await prisma.adminUser.findMany({
    orderBy: { createdAt: 'desc' },
    select: {
      id: true, name: true, email: true, isActive: true, mfaEnabled: true, lastLoginAt: true,
      failedLoginCount: true, lastFailedLoginAt: true, invitationExpiresAt: true, invitationAcceptedAt: true,
      roleAssignments: { select: { adminRole: { select: { key: true } } } },
      _count: { select: { sessions: { where: { revokedAt: null, expiresAt: { gt: new Date() } } } } },
    },
  });
  return users.map((user) => ({
    id: user.id, name: user.name, email: user.email, isActive: user.isActive, mfaEnabled: user.mfaEnabled,
    roles: user.roleAssignments.map(({ adminRole }) => adminRole.key).filter((role): role is AdminRoleKey => (ADMIN_ROLE_KEYS as readonly string[]).includes(role)),
    lastLoginAt: user.lastLoginAt?.toISOString() ?? null, failedLoginCount: user.failedLoginCount,
    lastFailedLoginAt: user.lastFailedLoginAt?.toISOString() ?? null, activeSessionCount: user._count.sessions,
    invitationExpiresAt: user.invitationExpiresAt?.toISOString() ?? null,
    invitationStatus: user.invitationAcceptedAt ? 'ACCEPTED' : user.invitationExpiresAt
      ? user.invitationExpiresAt > new Date() ? 'PENDING' : 'EXPIRED' : 'NONE',
  }));
}

export async function changeManagedAdmin(actorId: string, targetId: string, input: UpdateAdminInput): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await lockAdminManagement(tx);
    await requireManagingAdmin(tx, actorId);
    const target = await tx.adminUser.findUnique({ where: { id: targetId }, include: { roleAssignments: { include: { adminRole: true } } } });
    if (!target) throw new AdminUserError('Admin bulunamadı.', 404);
    if (input.isActive && target.invitationExpiresAt && !target.invitationAcceptedAt) throw new AdminUserError('Davet kabul edilmeden hesap etkinleştirilemez.');
    const activeSuperCount = await tx.adminUser.count({ where: { isActive: true, roleAssignments: { some: { adminRole: { key: 'SUPER_ADMIN' } } } } });
    assertSuperAdminPreserved(target.isActive && target.roleAssignments.some(({ adminRole }) => adminRole.key === 'SUPER_ADMIN'), input.isActive && input.roles.includes('SUPER_ADMIN'), activeSuperCount);
    const roles = await tx.adminRole.findMany({ where: { key: { in: input.roles } } });
    if (roles.length !== input.roles.length) throw new AdminUserError('Geçersiz rol.', 400);
    await tx.adminUserRole.deleteMany({ where: { adminUserId: targetId } });
    await tx.adminUserRole.createMany({ data: roles.map((role) => ({ adminUserId: targetId, adminRoleId: role.id })) });
    await tx.adminUser.update({ where: { id: targetId }, data: {
      isActive: input.isActive, tokenVersion: { increment: 1 },
      ...(target.isActive && !input.isActive ? { inviteTokenHash: null } : {}),
    } });
    await tx.adminSession.updateMany({ where: { adminUserId: targetId, revokedAt: null }, data: { revokedAt: new Date() } });
    await tx.adminSecurityEvent.create({ data: {
      adminUserId: targetId, type: 'ADMIN_ACCOUNT_CHANGED',
      message: `Yönetici ${actorId}, hesap durumunu ${input.isActive ? 'aktif' : 'kilitli'} olarak ve rolleri ${input.roles.join(', ')} olarak güncelledi.`,
    } });
  });
}

export async function revokeManagedAdminSessions(actorId: string, targetId: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await lockAdminManagement(tx);
    await requireManagingAdmin(tx, actorId);
    const target = await tx.adminUser.findUnique({ where: { id: targetId }, select: { id: true } });
    if (!target) throw new AdminUserError('Admin bulunamadı.', 404);
    await tx.adminUser.update({ where: { id: targetId }, data: { tokenVersion: { increment: 1 } } });
    await tx.adminSession.updateMany({ where: { adminUserId: targetId, revokedAt: null }, data: { revokedAt: new Date() } });
    await tx.adminSecurityEvent.create({ data: { adminUserId: targetId, type: 'ADMIN_SESSIONS_REVOKED', message: `Yönetici ${actorId} tüm oturumlarınızı kapattı.` } });
  });
}
