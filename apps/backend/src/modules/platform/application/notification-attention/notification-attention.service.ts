import type { SmartNotificationItem } from '../../../../services/smart-notification.service.js';
import type { NotificationAttentionRepository } from './notification-attention.ports.js';
import type { AttentionEventType, AttentionGroup, AttentionSourceNotification, NotificationAttentionPreferences, NotificationAttentionSummary } from './notification-attention.types.js';

const TIME_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

function minuteOfDay(value: string): number {
  const [hours = 0, minutes = 0] = value.split(':').map(Number);
  return hours * 60 + minutes;
}

function localParts(now: Date, timezone: string): { minute: number; weekday: number } {
  try {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: timezone, hour: '2-digit', minute: '2-digit', weekday: 'short', hourCycle: 'h23' }).formatToParts(now);
    const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? '';
    const weekdays: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
    return { minute: Number(value('hour')) * 60 + Number(value('minute')), weekday: weekdays[value('weekday')] ?? now.getUTCDay() };
  } catch {
    return { minute: now.getUTCHours() * 60 + now.getUTCMinutes(), weekday: now.getUTCDay() };
  }
}

function quietHoursActive(preferences: NotificationAttentionPreferences, now: Date): boolean {
  if (!preferences.quietHours.enabled) return false;
  const current = localParts(now, preferences.quietHours.timezone).minute;
  const start = minuteOfDay(preferences.quietHours.start);
  const end = minuteOfDay(preferences.quietHours.end);
  return start <= end ? current >= start && current < end : current >= start || current < end;
}

function eventKey(item: AttentionSourceNotification): string {
  if (item.entityType && item.entityId) return `${item.module ?? 'system'}:${item.entityType}:${item.entityId}`;
  return `${item.module ?? 'system'}:${item.title.trim().toLocaleLowerCase('tr-TR').replace(/\s+/g, '-')}`;
}

function groupNotifications(items: readonly AttentionSourceNotification[]): AttentionGroup[] {
  const groups = new Map<string, AttentionGroup>();
  for (const item of items) {
    const key = eventKey(item);
    const current = groups.get(key);
    if (!current) {
      groups.set(key, { eventKey: key, title: item.title, module: item.module, count: 1, notificationIds: [item.id], latestAt: item.createdAt.toISOString() });
      continue;
    }
    current.count += 1;
    current.notificationIds.push(item.id);
    if (item.createdAt.getTime() > new Date(current.latestAt).getTime()) current.latestAt = item.createdAt.toISOString();
  }
  return [...groups.values()].sort((left, right) => right.latestAt.localeCompare(left.latestAt));
}

function nextDigestAt(preferences: NotificationAttentionPreferences, now: Date): string | null {
  if (preferences.digest.cadence === 'OFF') return null;
  const next = new Date(now);
  next.setUTCMinutes(0, 0, 0);
  next.setUTCHours(preferences.digest.hour);
  if (next <= now) next.setUTCDate(next.getUTCDate() + 1);
  if (preferences.digest.cadence === 'WEEKLY') {
    while (next.getUTCDay() !== preferences.digest.weekday) next.setUTCDate(next.getUTCDate() + 1);
  }
  return next.toISOString();
}

export class NotificationAttentionService {
  constructor(private readonly repository: NotificationAttentionRepository) {}

  async getSummary(tenantId: string, userId: string, smartItems: readonly SmartNotificationItem[], notifications: readonly AttentionSourceNotification[], now = new Date()): Promise<NotificationAttentionSummary> {
    const [preferences, metrics] = await Promise.all([this.repository.getPreferences(tenantId, userId), this.repository.getMetrics(tenantId, userId)]);
    const visibleSystem = notifications.filter((item) => !item.module || !preferences.mutedModules.includes(item.module));
    const visibleSmart = smartItems.filter((item) => !preferences.mutedModules.includes(item.module));
    const quiet = quietHoursActive(preferences, now);
    const focus = visibleSmart.filter((item) => item.severity === 'critical' || (!quiet && item.severity === 'high'));
    const digestCount = visibleSystem.length + visibleSmart.length - focus.length;
    return {
      preferences,
      quietHoursActive: quiet,
      focusSmartIds: focus.map((item) => item.id),
      groupedSystemNotifications: groupNotifications(visibleSystem),
      digestCount,
      suppressedCount: notifications.length - visibleSystem.length + smartItems.length - visibleSmart.length,
      nextDigestAt: nextDigestAt(preferences, now),
      metrics,
    };
  }

  async updatePreferences(tenantId: string, userId: string, input: NotificationAttentionPreferences): Promise<NotificationAttentionPreferences> {
    const sanitized = sanitizePreferences(input);
    const targetRoleId = sanitized.escalation.targetRoleId && await this.repository.isRoleInTenant(tenantId, sanitized.escalation.targetRoleId)
      ? sanitized.escalation.targetRoleId
      : null;
    const preferences = { ...sanitized, escalation: { ...sanitized.escalation, targetRoleId } };
    await this.repository.savePreferences(tenantId, userId, preferences);
    return preferences;
  }

  recordEvent(tenantId: string, userId: string, event: AttentionEventType): Promise<void> {
    return this.repository.recordEvent(tenantId, userId, event);
  }
}

export function sanitizePreferences(input: NotificationAttentionPreferences): NotificationAttentionPreferences {
  const timezone = (() => { try { new Intl.DateTimeFormat('en-US', { timeZone: input.quietHours.timezone }).format(); return input.quietHours.timezone; } catch { return 'Europe/Istanbul'; } })();
  return {
    quietHours: { enabled: input.quietHours.enabled, start: TIME_PATTERN.test(input.quietHours.start) ? input.quietHours.start : '20:00', end: TIME_PATTERN.test(input.quietHours.end) ? input.quietHours.end : '08:00', timezone },
    digest: { cadence: input.digest.cadence, hour: Math.min(23, Math.max(0, Math.trunc(input.digest.hour))), weekday: Math.min(6, Math.max(0, Math.trunc(input.digest.weekday))) },
    channels: { inApp: input.channels.inApp, email: input.channels.email },
    mutedModules: [...new Set(input.mutedModules.filter((module) => /^[a-z][a-z0-9_]{1,49}$/.test(module)))].slice(0, 50),
    escalation: { enabled: input.escalation.enabled, afterHours: Math.min(168, Math.max(1, Math.trunc(input.escalation.afterHours))), targetRoleId: input.escalation.targetRoleId },
  };
}
