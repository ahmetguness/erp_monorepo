import type { Context } from 'hono';
import { rateLimiter } from '../../../../../lib/rateLimiter.js';
import { getTrustedClientIp } from '../../../../../utils/request-ip.js';
import { requireParam } from '../../../../../utils/context.js';
import { acceptAdminInviteSchema, inviteAdminSchema, updateAdminSchema } from '../../../admin-users/admin-user.schemas.js';
import { acceptManagedAdminInvitation, inviteManagedAdmin } from '../../../admin-users/admin-invitation.service.js';
import { changeManagedAdmin, listManagedAdmins, revokeManagedAdminSessions } from '../../../admin-users/admin-user.service.js';

export const AdminUserController = {
  async list(c: Context): Promise<Response> { return c.json({ data: await listManagedAdmins() }); },
  async invite(c: Context): Promise<Response> {
    const body = inviteAdminSchema.safeParse(await c.req.json<unknown>().catch(() => null));
    if (!body.success) return c.json({ error: 'Geçerli ad, e-posta ve roller gerekli.' }, 400);
    if (await rateLimiter.check(`admin-invites:${c.get('adminId')}`, 20, 3600000)) return c.json({ error: 'Davet sınırına ulaşıldı.' }, 429);
    await inviteManagedAdmin(c.get('adminId'), body.data);
    return c.json({ data: { success: true } }, 201);
  },
  async update(c: Context): Promise<Response> {
    const body = updateAdminSchema.safeParse(await c.req.json<unknown>().catch(() => null));
    if (!body.success) return c.json({ error: 'Geçerli durum ve roller gerekli.' }, 400);
    await changeManagedAdmin(c.get('adminId'), requireParam(c, 'id'), body.data);
    return c.json({ data: { success: true } });
  },
  async revokeSessions(c: Context): Promise<Response> {
    await revokeManagedAdminSessions(c.get('adminId'), requireParam(c, 'id'));
    return c.json({ data: { success: true } });
  },
  async acceptInvitation(c: Context): Promise<Response> {
    if (await rateLimiter.check(`admin-invite-accept:${getTrustedClientIp(c)}`, 10, 900000)) return c.json({ error: 'Çok fazla deneme.' }, 429);
    const body = acceptAdminInviteSchema.safeParse(await c.req.json<unknown>().catch(() => null));
    if (!body.success) return c.json({ error: 'Geçerli davet ve 12–72 karakterlik şifre gerekli.' }, 400);
    await acceptManagedAdminInvitation(body.data.token, body.data.password);
    return c.json({ data: { success: true } });
  },
};
