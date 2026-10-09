import { NotificationStatus } from '@prisma/client';
import { Context } from 'hono';
import { NotFoundError,ValidationError } from '../../../../errors/index.js';
import { prisma } from '../../../../lib/prisma.js';
import { SmartNotificationService,type SmartNotificationAction } from '../../../../services/smart-notification.service.js';
import { PrismaNotificationAttentionRepository } from '../../infrastructure/persistence/prisma-notification-attention.repository.js';
import { requireParam,requireTenantId,requireUserId } from '../../../../utils/context.js';

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
    const id = requireParam(c, 'id');
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
    const attention = new PrismaNotificationAttentionRepository(prisma);
    await attention.recordEvent(tenantId, userId, action === 'hide' || action === 'snooze' ? 'DISMISS' : 'ACTION');
    return c.json({ data: state });
  },

  async list(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const userId = requireUserId(c);

    const statusResult = parseNotificationStatus(c.req.query('status'));
    if (statusResult.invalid) return c.json(new ValidationError('status geÃ§ersiz.').toJSON(), 400);
    const limitResult = parseLimit(c.req.query('limit'));
    if (limitResult.invalid) return c.json(new ValidationError('limit 1 ile 100 arasÄ±nda bir tam sayÄ± olmalÄ±dÄ±r.').toJSON(), 400);

    const notifications = await prisma.notification.findMany({
      where: {
        tenantId,
        ...(userId && { userId }),
        ...(statusResult.value && { status: statusResult.value }),
      },
      orderBy: { createdAt: 'desc' },
      take: limitResult.value,
    });

    const unreadCount = await prisma.notification.count({
      where: { tenantId, ...(userId && { userId }), status: NotificationStatus.UNREAD },
    });

    return c.json({ data: notifications, meta: { unreadCount } });
  },

  async markAsRead(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const userId = requireUserId(c);
    const id = requireParam(c, 'id');

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
    const id = requireParam(c, 'id');

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
    const id = requireParam(c, 'id');

    await prisma.notification.deleteMany({ where: { id, tenantId, userId } });
    return c.json({ data: { success: true } });
  },

  async bulkMarkAsRead(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const userId = requireUserId(c);
    const body = await c.req.json<{ ids: string[] }>().catch(() => ({ ids: [] }));
    const ids = parseIds(body.ids);
    if (!ids) return c.json(new ValidationError('ids, en fazla 100 benzersiz ID iÃ§eren bir dizi olmalÄ±dÄ±r.').toJSON(), 400);
    let count = 0;
    if (ids.length > 0) {
      const result = await prisma.notification.updateMany({
        where: { tenantId, userId, id: { in: ids } },
        data: { status: NotificationStatus.READ, readAt: new Date() },
      });
      count = result.count;
    }
    return c.json({ data: { success: true, count } });
  },

  async bulkArchive(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const userId = requireUserId(c);
    const body = await c.req.json<{ ids: string[] }>().catch(() => ({ ids: [] }));
    const ids = parseIds(body.ids);
    if (!ids) return c.json(new ValidationError('ids, en fazla 100 benzersiz ID iÃ§eren bir dizi olmalÄ±dÄ±r.').toJSON(), 400);
    let count = 0;
    if (ids.length > 0) {
      const result = await prisma.notification.updateMany({
        where: { tenantId, userId, id: { in: ids } },
        data: { status: NotificationStatus.ARCHIVED },
      });
      count = result.count;
    }
    return c.json({ data: { success: true, count } });
  },

  async bulkDelete(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const userId = requireUserId(c);
    const body = await c.req.json<{ ids: string[] }>().catch(() => ({ ids: [] }));
    const ids = parseIds(body.ids);
    if (!ids) return c.json(new ValidationError('ids, en fazla 100 benzersiz ID iÃ§eren bir dizi olmalÄ±dÄ±r.').toJSON(), 400);
    let count = 0;
    if (ids.length > 0) {
      const result = await prisma.notification.deleteMany({
        where: { tenantId, userId, id: { in: ids } },
      });
      count = result.count;
    }
    return c.json({ data: { success: true, count } });
  },

  async registerPushToken(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const userId = requireUserId(c);
    const body = await c.req.json<{ pushToken: string }>().catch(() => ({ pushToken: '' }));

    const pushToken = typeof body.pushToken === 'string' ? body.pushToken.trim() : '';
    if (!pushToken || pushToken.length > 4096) {
      return c.json(new ValidationError('pushToken alani zorunludur.').toJSON(), 400);
    }

    const tenantUser = await prisma.tenantUser.findUnique({
      where: { tenantId_userId: { tenantId, userId } },
    });

    if (!tenantUser) {
      return c.json(new NotFoundError('Kullanici', userId).toJSON(), 404);
    }

    const currentPrefs = (tenantUser.preferences as Record<string, unknown>) || {};
    await prisma.tenantUser.update({
      where: { id: tenantUser.id },
      data: {
        preferences: {
          ...currentPrefs,
          pushToken,
          pushTokenUpdatedAt: new Date().toISOString(),
        },
      },
    });

    return c.json({ data: { success: true, message: 'Push token basariyla kaydedildi.' } });
  },
};

function isSmartNotificationAction(value: string): value is SmartNotificationAction {
  return value === 'acknowledge' || value === 'complete' || value === 'snooze' || value === 'hide' || value === 'reopen';
}

function parseNotificationStatus(value: string | undefined): { value?: NotificationStatus; invalid: boolean } {
  if (value === undefined) return { invalid: false };
  if (value === NotificationStatus.UNREAD || value === NotificationStatus.READ || value === NotificationStatus.ARCHIVED) return { value, invalid: false };
  return { invalid: true };
}

function parseLimit(value: string | undefined): { value: number; invalid: boolean } {
  if (value === undefined) return { value: 50, invalid: false };
  if (!/^\d+$/.test(value)) return { value: 50, invalid: true };
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > 100) return { value: 50, invalid: true };
  return { value: parsed, invalid: false };
}

function parseIds(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.length > 100 || !value.every((id) => typeof id === 'string' && id.trim().length > 0 && id.length <= 191)) return null;
  return [...new Set(value)];
}
