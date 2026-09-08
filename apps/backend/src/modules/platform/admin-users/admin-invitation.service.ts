import { createHash, randomBytes } from 'node:crypto';
import bcrypt from 'bcryptjs';
import type { InviteAdminInput } from '@repo/types';
import { prisma } from '../../../lib/prisma.js';
import { sendMail } from '../../../services/mail.service.js';
import { AdminUserError, lockAdminManagement, requireManagingAdmin } from './admin-user.service.js';

const hashToken = (token: string): string => createHash('sha256').update(token).digest('hex');
type InvitationDelivery = (email: string, url: string) => Promise<boolean>;
const deliverInvitation: InvitationDelivery = async (email, url) => {
  const escapedUrl = url.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
  const result = await sendMail({ to: email, subject: 'Axon ERP yönetici daveti',
    html: `<p>Yönetici hesabınız için davet edildiniz. Bağlantı 24 saat geçerlidir.</p><p><a href="${escapedUrl}">Şifrenizi oluşturun</a></p><p>İlk girişte iki aşamalı doğrulama kurulumu zorunludur.</p>` });
  return result.success;
};

export async function inviteManagedAdmin(actorId: string, input: InviteAdminInput, deliver: InvitationDelivery = deliverInvitation): Promise<void> {
  const token = randomBytes(32).toString('base64url');
  const tokenHash = hashToken(token);
  const password = await bcrypt.hash(randomBytes(48).toString('base64url'), 12);
  const invitationUrl = new URL('/admin/accept-invite', process.env.APP_URL || 'http://localhost:3000');
  invitationUrl.hash = token;
  const target = await prisma.$transaction(async (tx) => {
    await lockAdminManagement(tx);
    await requireManagingAdmin(tx, actorId);
    const existing = await tx.adminUser.findUnique({ where: { email: input.email } });
    if (existing && (existing.isActive || existing.invitationAcceptedAt || !existing.invitationExpiresAt)) {
      throw new AdminUserError('Bu e-posta için bir admin hesabı zaten var.');
    }
    const roles = await tx.adminRole.findMany({ where: { key: { in: input.roles } } });
    if (roles.length !== input.roles.length) throw new AdminUserError('Geçersiz rol.', 400);
    const data = { name: input.name, email: input.email, password, isActive: false,
      inviteTokenHash: tokenHash, invitationExpiresAt: new Date(Date.now() + 86400000) };
    const user = existing
      ? await tx.adminUser.update({ where: { id: existing.id }, data })
      : await tx.adminUser.create({ data });
    await tx.adminUserRole.deleteMany({ where: { adminUserId: user.id } });
    await tx.adminUserRole.createMany({ data: roles.map((role) => ({ adminUserId: user.id, adminRoleId: role.id })) });
    await tx.adminSecurityEvent.create({ data: { adminUserId: user.id, type: 'ADMIN_INVITED', message: `Yönetici ${actorId} davet oluşturdu.` } });
    return user;
  });
  let delivered = false;
  try { delivered = await deliver(input.email, invitationUrl.toString()); } catch { delivered = false; }
  if (!delivered) {
    await prisma.adminUser.updateMany({ where: { id: target.id, inviteTokenHash: tokenHash }, data: { inviteTokenHash: null, invitationExpiresAt: new Date() } });
    throw new AdminUserError('Davet e-postası gönderilemedi. Daveti yeniden gönderin.', 502);
  }
}

export async function acceptManagedAdminInvitation(token: string, password: string): Promise<void> {
  const tokenHash = hashToken(token);
  const passwordHash = await bcrypt.hash(password, 12);
  await prisma.$transaction(async (tx) => {
    await lockAdminManagement(tx);
    const invitation = await tx.adminUser.findFirst({ where: {
      inviteTokenHash: tokenHash, isActive: false, invitationAcceptedAt: null, invitationExpiresAt: { gt: new Date() },
    }, select: { id: true } });
    if (!invitation) throw new AdminUserError('Davet geçersiz, kullanılmış veya süresi dolmuş.', 400);
    await tx.adminUser.update({ where: { id: invitation.id }, data: {
      password: passwordHash, passwordChangedAt: new Date(), isActive: true,
      inviteTokenHash: null, invitationAcceptedAt: new Date(), tokenVersion: { increment: 1 },
    } });
    await tx.adminSecurityEvent.create({ data: { adminUserId: invitation.id, type: 'ADMIN_INVITATION_ACCEPTED', message: 'Yönetici daveti kabul edildi. İlk girişte MFA kurulumu gereklidir.' } });
  });
}
