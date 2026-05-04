import { Context } from 'hono';
import {
  createInvitation,
  validateInvitation,
  acceptInvitation,
  listInvitations,
  cancelInvitation,
} from '../services/invitation.service';

export class InvitationController {
  /** POST /api/invitations — Owner davet gönderir */
  static async create(c: Context) {
    const tenantId = c.get('tenantId') as string;
    const userId = c.get('userId') as string;
    const { email, roleId } = await c.req.json();

    if (!email) {
      return c.json({ error: 'E-posta adresi zorunludur.' }, 400);
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return c.json({ error: 'Geçerli bir e-posta adresi giriniz.' }, 400);
    }

    const result = await createInvitation(tenantId, email, userId, roleId);

    if (!result.success && 'code' in result) {
      return c.json(result, 409);
    }

    return c.json(result, 201);
  }

  /** GET /api/invitations — Tenant davetlerini listele */
  static async list(c: Context) {
    const tenantId = c.get('tenantId') as string;
    const invitations = await listInvitations(tenantId);
    return c.json({ data: invitations });
  }

  /** POST /api/invitations/:id/cancel — Daveti iptal et */
  static async cancel(c: Context) {
    const tenantId = c.get('tenantId') as string;
    const id = c.req.param('id')!;
    const result = await cancelInvitation(id, tenantId);
    return c.json(result, result.success ? 200 : 400);
  }

  /** POST /api/public/invitations/validate — Token doğrula (public) */
  static async validate(c: Context) {
    const { token, email } = await c.req.json();
    if (!token || !email) {
      return c.json({ error: 'token ve email zorunludur.' }, 400);
    }
    const result = await validateInvitation(token, email);
    return c.json(result, result.valid ? 200 : 400);
  }

  /** POST /api/public/invitations/accept — Daveti kabul et (public) */
  static async accept(c: Context) {
    const { token, email, name, password } = await c.req.json();

    if (!token || !email || !name || !password) {
      return c.json({ error: 'token, email, name ve password zorunludur.' }, 400);
    }
    if (password.length < 8) {
      return c.json({ error: 'Şifre en az 8 karakter olmalıdır.' }, 400);
    }

    const result = await acceptInvitation(token, email, name, password);
    return c.json(result, result.success ? 200 : 400);
  }
}
