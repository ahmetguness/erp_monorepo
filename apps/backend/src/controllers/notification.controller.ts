import { Context } from 'hono';
import { NotificationStatus } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { NotFoundError, ValidationError } from '../errors';
import { requireTenantId, requireUserId } from '../utils/context.js';
import { SmartNotificationService, type SmartNotificationAction } from '../services/smart-notification.service.js';

// ─────────────────────────────────────────────
// Notification Controller
// ─────────────────────────────────────────────

export const NotificationController = {
  async smart(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const userId = requireUserId(c);
    const service = new SmartNotificationService(prisma);
    const summary = await service.getSummary(tenantId, userId);
    return c.json({ data: summary });
  },

  async smartAction(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const userId = requireUserId(c);
    const id = c.req.param('id')!;
    const body = await c.req.json<unknown>().catch(() => null);
    const action = typeof body === 'object' && body !== null && 'action' in body && typeof body.action === 'string'
      ? body.action
      : '';
    const snoozedUntilValue = typeof body === 'object' && body !== null && 'snoozedUntil' in body && typeof body.snoozedUntil === 'string'
      ? body.snoozedUntil
      : undefined;

    if (!isSmartNotificationAction(action)) {
      return c.json(new ValidationError('Geçerli bir akıllı bildirim aksiyonu zorunludur.').toJSON(), 400);
    }

    const snoozedUntil = snoozedUntilValue ? new Date(snoozedUntilValue) : null;
    if (snoozedUntilValue && Number.isNaN(snoozedUntil?.getTime())) {
      return c.json(new ValidationError('snoozedUntil geçersiz.').toJSON(), 400);
    }

    const service = new SmartNotificationService(prisma);
    const state = await service.updateState(tenantId, userId, id, action, snoozedUntil);
    return c.json({ data: state });
  },

  async list(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const userId = requireUserId(c);

    const status = parseNotificationStatus(c.req.query('status'));
    const limit = parseLimit(c.req.query('limit'));

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
    const tenantId = requireTenantId(c);
    const userId = requireUserId(c);
    const id = c.req.param('id')!;

    const notif = await prisma.notification.findFirst({ where: { id, tenantId, userId } });
    if (!notif) return c.json(new NotFoundError('Bildirim', id).toJSON(), 404);

    const updated = await prisma.notification.update({
      where: { id },
      data: { status: NotificationStatus.READ, readAt: new Date() },
    });

    return c.json({ data: updated });
  },

  async markAllAsRead(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const userId = requireUserId(c);

    await prisma.notification.updateMany({
      where: { tenantId, userId, status: NotificationStatus.UNREAD },
      data: { status: NotificationStatus.READ, readAt: new Date() },
    });

    return c.json({ data: { success: true } });
  },

  async deleteAll(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const userId = requireUserId(c);

    await prisma.notification.deleteMany({
      where: { tenantId, userId },
    });

    return c.json({ data: { success: true } });
  },

  async archive(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const userId = requireUserId(c);
    const id = c.req.param('id')!;

    const notif = await prisma.notification.findFirst({ where: { id, tenantId, userId } });
    if (!notif) return c.json(new NotFoundError('Bildirim', id).toJSON(), 404);

    const updated = await prisma.notification.update({
      where: { id },
      data: { status: NotificationStatus.ARCHIVED },
    });

    return c.json({ data: updated });
  },

  async delete(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const userId = requireUserId(c);
    const id = c.req.param('id')!;

    await prisma.notification.deleteMany({ where: { id, tenantId, userId } });
    return c.json({ data: { success: true } });
  },
};

function isSmartNotificationAction(value: string): value is SmartNotificationAction {
  return value === 'acknowledge' || value === 'complete' || value === 'snooze' || value === 'hide' || value === 'reopen';
}

function parseNotificationStatus(value: string | undefined): NotificationStatus | undefined {
  if (value === NotificationStatus.UNREAD) return value;
  if (value === NotificationStatus.READ) return value;
  if (value === NotificationStatus.ARCHIVED) return value;
  return undefined;
}

function parseLimit(value: string | undefined): number {
  const parsed = Number.parseInt(value ?? '', 10);
  if (!Number.isFinite(parsed)) return 50;
  return Math.min(100, Math.max(1, parsed));
}
