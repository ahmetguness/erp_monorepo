import type { Prisma } from '@prisma/client';
import type { CreateSupportSessionInput, SupportSessionSummary } from '@repo/types';
import { SUPPORT_SCOPES } from '@repo/types';
import { prisma } from '../../../lib/prisma.js';
import { ForbiddenError, NotFoundError } from '../../../errors/index.js';

export async function assertTenantOwner(tenantId: string, userId: string): Promise<void> {
  const owner = await prisma.tenantUser.findFirst({ where: {
    tenantId, userId, isOwner: true, isActive: true,
    user: { isActive: true, deletedAt: null }, tenant: { deletedAt: null },
  }, select: { id: true } });
  if (!owner) throw new ForbiddenError('Yalnızca aktif tenant sahibi destek erişimini onaylayabilir.');
}

export async function supportAudit(db: Prisma.TransactionClient, input: {
  tenantId: string; id: string; adminId?: string; userId?: string;
  reason: string; ticketId: string; event: string;
}): Promise<void> {
  await db.auditLog.create({ data: {
    tenantId: input.tenantId, adminId: input.adminId, userId: input.userId,
    module: 'SUPPORT_SESSION', entityType: 'OTHER', entityId: input.id,
    action: 'OTHER', reason: input.reason, ticketId: input.ticketId,
    newValues: { event: input.event },
  } });
}

export async function requestSupportSession(adminId: string, adminSessionId: string, input: CreateSupportSessionInput): Promise<void> {
  const target = await prisma.tenantUser.findFirst({ where: {
    tenantId: input.tenantId, userId: input.targetUserId, isActive: true,
    user: { isActive: true, deletedAt: null }, tenant: { deletedAt: null, status: { in: ['ACTIVE', 'TRIAL'] } },
  }, select: { id: true } });
  if (!target) throw new NotFoundError('Aktif hedef kullanıcı bulunamadı.');
  await prisma.$transaction(async tx => {
    const session = await tx.supportSession.create({ data: {
      tenantId: input.tenantId, targetUserId: input.targetUserId,
      adminId, adminSessionId, reason: input.reason, ticketId: input.ticketId,
      scopes: [...new Set(input.scopes)], writeRequested: input.writeRequested,
      expiresAt: new Date(Date.now() + input.durationMinutes * 60000),
    } });
    await supportAudit(tx, { ...session, event: 'REQUESTED' });
  });
}

export async function listSupportSessions(tenantId: string, adminId?: string): Promise<SupportSessionSummary[]> {
  const rows = await prisma.supportSession.findMany({ where: { tenantId, ...(adminId ? { adminId } : {}) },
    orderBy: { createdAt: 'desc' }, take: 100,
    include: { admin: { select: { name: true, email: true } }, targetUser: { select: { name: true, email: true } } },
  });
  return rows.map(row => ({
    id: row.id, tenantId, adminId: row.adminId, targetUserId: row.targetUserId,
    reason: row.reason, ticketId: row.ticketId,
    scopes: SUPPORT_SCOPES.filter(scope => row.scopes.includes(scope)),
    expiresAt: row.expiresAt.toISOString(), approvedAt: row.approvedAt?.toISOString() ?? null,
    revokedAt: row.revokedAt?.toISOString() ?? null, writeRequested: row.writeRequested,
    writeApprovedAt: row.writeApprovedAt?.toISOString() ?? null,
    admin: row.admin, targetUser: row.targetUser,
  }));
}

export async function decideSupportSession(tenantId: string, id: string, userId: string, action: 'approve' | 'approve-write' | 'revoke'): Promise<void> {
  await assertTenantOwner(tenantId, userId);
  await prisma.$transaction(async tx => {
    const session = await tx.supportSession.findFirst({ where: { id, tenantId, revokedAt: null, expiresAt: { gt: new Date() } } });
    if (!session) throw new NotFoundError('Destek talebi sona ermiş veya bulunamadı.');
    if (action === 'approve-write' && (!session.approvedAt || !session.writeRequested || !session.scopes.includes('CONTACTS'))) {
      throw new ForbiddenError('Önce görüntüleme izni ve ayrı yazma talebi gerekir.');
    }
    const updated = await tx.supportSession.updateMany({ where: {
      id, tenantId, revokedAt: null, expiresAt: { gt: new Date() },
      ...(action === 'approve' ? { approvedAt: null } : {}),
      ...(action === 'approve-write' ? { writeApprovedAt: null } : {}),
    }, data:
      action === 'revoke' ? { revokedAt: new Date() } : action === 'approve' ? { approvedAt: new Date(), approvedById: userId } : { writeApprovedAt: new Date(), writeApprovedById: userId },
    });
    if (updated.count !== 1) throw new ForbiddenError('Oturum artık geçerli değil.');
    await supportAudit(tx, { ...session, adminId: undefined, userId, event: action.toUpperCase() });
  });
}

export async function revokeAdminSupportSession(tenantId: string, id: string, adminId: string): Promise<void> {
  await prisma.$transaction(async tx => {
    const session = await tx.supportSession.findFirst({ where: { id, tenantId, adminId } });
    if (!session) throw new NotFoundError('Destek oturumu bulunamadı.');
    await tx.supportSession.updateMany({ where: { id, tenantId, adminId }, data: { revokedAt: new Date() } });
    await supportAudit(tx, { ...session, event: 'ADMIN_ENDED' });
  });
}
