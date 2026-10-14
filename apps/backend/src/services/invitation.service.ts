import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { prisma } from '../lib/prisma';
import { logger } from '../lib/logger';
import { validatePasswordStrength } from '../utils/password-policy.js';
import { sendMail } from './mail.service';
import { invitationEmail } from './mail-templates.service';
import { StarterAccessService } from './starter-access.service.js';

const INVITE_EXPIRY_HOURS = 48;

// ── Davet oluştur ────────────────────────────

export async function createInvitation(
  tenantId: string,
  email: string,
  invitedBy: string,
  roleId?: string,
) {
  const normalizedEmail = email.toLowerCase().trim();

  const rawToken = crypto.randomBytes(32).toString('hex');
  const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
  const expiresAt = new Date(Date.now() + INVITE_EXPIRY_HOURS * 60 * 60 * 1000);

  const creation = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${tenantId}))`;

    if (roleId && await tx.role.count({ where: { id: roleId, tenantId } }) !== 1) {
      return { kind: 'error' as const, code: 'INVALID_ROLE', message: 'Seçilen rol bu tenant için geçerli değildir.' };
    }

    const existingUser = await tx.user.findUnique({ where: { email: normalizedEmail } });
    if (existingUser) {
      const existingMember = await tx.tenantUser.findUnique({
        where: { tenantId_userId: { tenantId, userId: existingUser.id } },
      });
      if (existingMember?.isActive) {
        return { kind: 'error' as const, code: 'ALREADY_MEMBER', message: 'Bu kullanıcı zaten ekip üyesi.' };
      }
    }

    const pendingInvite = await tx.invitation.findFirst({
      where: { tenantId, email: normalizedEmail, status: 'PENDING', expiresAt: { gt: new Date() } },
    });
    if (pendingInvite) {
      return { kind: 'error' as const, code: 'INVITE_PENDING', message: 'Bu e-posta adresine zaten bekleyen bir davet var.' };
    }

    const [activeUsers, pendingInvites] = await Promise.all([
      tx.tenantUser.count({ where: { tenantId, isActive: true } }),
      tx.invitation.count({ where: { tenantId, status: 'PENDING', expiresAt: { gt: new Date() } } }),
    ]);
    await new StarterAccessService(tx).enforceUserCapacity(tenantId, 1, activeUsers + pendingInvites);

    await tx.invitation.deleteMany({
      where: { tenantId, email: normalizedEmail, status: { in: ['EXPIRED', 'CANCELLED'] } },
    });
    const invitation = await tx.invitation.create({
      data: { tenantId, email: normalizedEmail, roleId: roleId || null, tokenHash, expiresAt, invitedBy },
    });
    return { kind: 'created' as const, invitation };
  });

  if (creation.kind === 'error') {
    return { success: false, code: creation.code, message: creation.message };
  }
  const invitation = creation.invitation;

  // Tenant bilgisi al
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { companyName: true },
  });

  // Rol adı al
  let roleName: string | undefined;
  if (roleId) {
    const role = await prisma.role.findUnique({ where: { id: roleId }, select: { name: true } });
    roleName = role?.name;
  }

  // Mail gönder
  const appUrl = process.env.APP_URL || 'http://localhost:3000';
  const inviteUrl = `${appUrl}/invite?token=${rawToken}&email=${encodeURIComponent(normalizedEmail)}`;

  const template = invitationEmail(tenant?.companyName || 'Axon ERP', inviteUrl, roleName);
  try {
    await sendMail({ to: normalizedEmail, ...template });
  } catch (error) {
    await prisma.invitation.deleteMany({ where: { id: invitation.id, tenantId, status: 'PENDING' } });
    throw error;
  }

  logger.info(`Davet gönderildi: ${normalizedEmail} → tenant ${tenantId}`);

  return { success: true, invitationId: invitation.id };
}

// ── Davet token doğrula ──────────────────────

export async function validateInvitation(rawToken: string, email: string) {
  const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
  const normalizedEmail = email.toLowerCase().trim();

  const invitation = await prisma.invitation.findFirst({
    where: { tokenHash, email: normalizedEmail, status: 'PENDING' },
  });

  if (!invitation) {
    return { valid: false, error: 'Geçersiz veya kullanılmış davet linki.' };
  }

  if (invitation.expiresAt < new Date()) {
    await prisma.invitation.update({ where: { id: invitation.id }, data: { status: 'EXPIRED' } });
    return { valid: false, error: 'Davet linkinin süresi dolmuş.' };
  }

  const tenant = await prisma.tenant.findUnique({
    where: { id: invitation.tenantId },
    select: { id: true, companyName: true, plan: true },
  });

  return {
    valid: true,
    invitationId: invitation.id,
    tenantName: tenant?.companyName,
    email: invitation.email,
  };
}

// ── Daveti kabul et ──────────────────────────

export async function acceptInvitation(
  rawToken: string,
  email: string,
  name: string,
  password: string,
) {
  validatePasswordStrength(password);

  const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
  const normalizedEmail = email.toLowerCase().trim();

  const invitation = await prisma.invitation.findFirst({
    where: { tokenHash, email: normalizedEmail, status: 'PENDING' },
  });

  if (!invitation) {
    return { success: false, error: 'Geçersiz veya kullanılmış davet linki.' };
  }

  if (invitation.expiresAt < new Date()) {
    await prisma.invitation.update({ where: { id: invitation.id }, data: { status: 'EXPIRED' } });
    return { success: false, error: 'Davet linkinin süresi dolmuş.' };
  }

  const hashedPassword = await bcrypt.hash(password, 12);

  const result = await prisma.$transaction(async (tx) => {
    const claimed = await tx.invitation.updateMany({
      where: { id: invitation.id, tokenHash, email: normalizedEmail, status: 'PENDING', expiresAt: { gte: new Date() } },
      data: { status: 'ACCEPTED', acceptedAt: new Date() },
    });
    if (claimed.count !== 1) return null;

    // User oluştur veya mevcut user'ı bul
    let user = await tx.user.findUnique({ where: { email: normalizedEmail } });

    if (!user) {
      user = await tx.user.create({
        data: { email: normalizedEmail, name, password: hashedPassword },
      });
    }

    // TenantUser bağla
    await tx.tenantUser.upsert({
      where: { tenantId_userId: { tenantId: invitation.tenantId, userId: user.id } },
      create: {
        tenantId: invitation.tenantId,
        userId: user.id,
        roleId: invitation.roleId,
        isOwner: false,
        isActive: true,
      },
      update: { isActive: true, roleId: invitation.roleId },
    });

    return user;
  });

  if (!result) {
    return { success: false, error: 'Geçersiz veya kullanılmış davet linki.' };
  }

  logger.info(`Davet kabul edildi: ${normalizedEmail} → tenant ${invitation.tenantId}`);

  return { success: true, userId: result.id, tenantId: invitation.tenantId };
}

// ── Davetleri listele ────────────────────────

export async function listInvitations(tenantId: string) {
  // Süresi dolmuş PENDING davetleri otomatik expire et
  await prisma.invitation.updateMany({
    where: { tenantId, status: 'PENDING', expiresAt: { lt: new Date() } },
    data: { status: 'EXPIRED' },
  });

  return prisma.invitation.findMany({
    where: { tenantId },
    orderBy: { createdAt: 'desc' },
  });
}

// ── Daveti iptal et ──────────────────────────

export async function cancelInvitation(invitationId: string, tenantId: string) {
  const invitation = await prisma.invitation.findFirst({
    where: { id: invitationId, tenantId, status: 'PENDING' },
  });

  if (!invitation) {
    return { success: false, error: 'Davet bulunamadı veya zaten işlenmiş.' };
  }

  await prisma.invitation.update({
    where: { id: invitationId },
    data: { status: 'CANCELLED' },
  });

  return { success: true };
}
