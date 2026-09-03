import { NotificationStatus } from '@prisma/client';
import type { Context } from 'hono';
import { ValidationError } from '../../../../errors/index.js';
import { prisma } from '../../../../lib/prisma.js';
import { SmartNotificationService } from '../../../../services/smart-notification.service.js';
import { requireTenantId, requireUserId } from '../../../../utils/context.js';
import { NotificationAttentionService, type AttentionEventType, type DigestCadence, type NotificationAttentionPreferences } from '../../application/notification-attention/index.js';
import { PrismaNotificationAttentionRepository } from '../../infrastructure/persistence/prisma-notification-attention.repository.js';

function service(): NotificationAttentionService {
  return new NotificationAttentionService(new PrismaNotificationAttentionRepository(prisma));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isCadence(value: unknown): value is DigestCadence {
  return value === 'OFF' || value === 'DAILY' || value === 'WEEKLY';
}

function parsePreferences(value: unknown): NotificationAttentionPreferences | null {
  if (!isRecord(value) || !isRecord(value.quietHours) || !isRecord(value.digest) || !isRecord(value.channels) || !isRecord(value.escalation)) return null;
  const { quietHours, digest, channels, escalation } = value;
  if (typeof quietHours.enabled !== 'boolean' || typeof quietHours.start !== 'string' || typeof quietHours.end !== 'string' || typeof quietHours.timezone !== 'string') return null;
  if (!isCadence(digest.cadence) || typeof digest.hour !== 'number' || typeof digest.weekday !== 'number') return null;
  if (typeof channels.inApp !== 'boolean' || typeof channels.email !== 'boolean') return null;
  if (!Array.isArray(value.mutedModules) || !value.mutedModules.every((item) => typeof item === 'string')) return null;
  if (typeof escalation.enabled !== 'boolean' || typeof escalation.afterHours !== 'number' || !(typeof escalation.targetRoleId === 'string' || escalation.targetRoleId === null)) return null;
  return {
    quietHours: { enabled: quietHours.enabled, start: quietHours.start, end: quietHours.end, timezone: quietHours.timezone },
    digest: { cadence: digest.cadence, hour: digest.hour, weekday: digest.weekday },
    channels: { inApp: channels.inApp, email: channels.email },
    mutedModules: value.mutedModules,
    escalation: { enabled: escalation.enabled, afterHours: escalation.afterHours, targetRoleId: escalation.targetRoleId },
  };
}

function isEvent(value: unknown): value is AttentionEventType {
  return value === 'IMPRESSION' || value === 'ACTION' || value === 'DISMISS' || value === 'DIGEST_OPENED';
}

export const NotificationAttentionController = {
  async summary(c: Context): Promise<Response> {
    const tenantId = requireTenantId(c);
    const userId = requireUserId(c);
    const [smart, notifications] = await Promise.all([
      new SmartNotificationService(prisma).getSummary(tenantId, userId),
      prisma.notification.findMany({
        where: { tenantId, userId, status: NotificationStatus.UNREAD },
        select: { id: true, title: true, module: true, entityType: true, entityId: true, createdAt: true },
        orderBy: { createdAt: 'desc' },
        take: 200,
      }),
    ]);
    const summary = await service().getSummary(tenantId, userId, smart.items, notifications.map((item) => ({ ...item, entityType: item.entityType ?? null })));
    return c.json({ data: summary });
  },

  async preferences(c: Context): Promise<Response> {
    const input = parsePreferences(await c.req.json<unknown>().catch(() => null));
    if (!input) return c.json(new ValidationError('Bildirim dikkat tercihleri geçersiz.').toJSON(), 400);
    const result = await service().updatePreferences(requireTenantId(c), requireUserId(c), input);
    return c.json({ data: result });
  },

  async event(c: Context): Promise<Response> {
    const body = await c.req.json<unknown>().catch(() => null);
    const event = isRecord(body) ? body.event : null;
    if (!isEvent(event)) return c.json(new ValidationError('Bildirim etkinliği geçersiz.').toJSON(), 400);
    await service().recordEvent(requireTenantId(c), requireUserId(c), event);
    return c.body(null, 204);
  },
};
