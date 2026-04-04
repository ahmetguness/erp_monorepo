import { Context } from 'hono';
import { NotificationStatus } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { ForbiddenError, NotFoundError } from '../errors';

// ─────────────────────────────────────────────
// Notification Controller
// ─────────────────────────────────────────────

export const NotificationController = {

  async list(c: Context): Promise<Response> {
    const tenantId = c.req.header('x-tenant-id') ?? c.get('tenantId');
    const userId = c.get('userId') as string | undefined;
    if (!tenantId) return c.json(new ForbiddenError('Tenant kimliği bulunamadı.').toJSON(), 403);

    const status = c.req.query('status') as NotificationStatus | undefined;
    const limit = Math.min(100, parseInt(c.req.query('limit') ?? '50', 10));

    const notifications = await prisma.notification.findMany({
      where: {
        tenantId,
        ...(userId && { userId }),
        ...(status && { status }),
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    const unreadCount = await prisma.notification.count({
      where: { tenantId, ...(userId && { userId }), status: NotificationStatus.UNREAD },
    });

    return c.json({ data: notifications, meta: { unreadCount } });
  },

  async markAsRead(c: Context): Promise<Response> {
    const tenantId = c.req.header('x-tenant-id') ?? c.get('tenantId');
    const id = c.req.param('id')!;
    if (!tenantId) return c.json(new ForbiddenError('Tenant kimliği bulunamadı.').toJSON(), 403);

    const notif = await prisma.notification.findFirst({ where: { id, tenantId } });
    if (!notif) return c.json(new NotFoundError('Bildirim', id).toJSON(), 404);

    const updated = await prisma.notification.update({
      where: { id },
      data: { status: NotificationStatus.READ, readAt: new Date() },
    });

    return c.json({ data: updated });
  },

  async markAllAsRead(c: Context): Promise<Response> {
    const tenantId = c.req.header('x-tenant-id') ?? c.get('tenantId');
    const userId = c.get('userId') as string | undefined;
    if (!tenantId) return c.json(new ForbiddenError('Tenant kimliği bulunamadı.').toJSON(), 403);

    await prisma.notification.updateMany({
      where: { tenantId, ...(userId && { userId }), status: NotificationStatus.UNREAD },
      data: { status: NotificationStatus.READ, readAt: new Date() },
    });

    return c.json({ data: { success: true } });
  },

  async delete(c: Context): Promise<Response> {
    const tenantId = c.req.header('x-tenant-id') ?? c.get('tenantId');
    const id = c.req.param('id')!;
    if (!tenantId) return c.json(new ForbiddenError('Tenant kimliği bulunamadı.').toJSON(), 403);

    await prisma.notification.deleteMany({ where: { id, tenantId } });
    return c.json({ data: { success: true } });
  },
};
