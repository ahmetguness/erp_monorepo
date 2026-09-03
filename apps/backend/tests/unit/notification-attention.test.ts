import { describe, expect, it } from 'vitest';
import { NotificationAttentionService, sanitizePreferences, type AttentionEventType, type AttentionMetrics, type NotificationAttentionPreferences, type NotificationAttentionRepository } from '../../src/modules/platform/application/notification-attention/index.js';
import type { SmartNotificationItem } from '../../src/services/smart-notification.service.js';

const preferences: NotificationAttentionPreferences = {
  quietHours: { enabled: true, start: '20:00', end: '08:00', timezone: 'UTC' },
  digest: { cadence: 'DAILY', hour: 9, weekday: 1 },
  channels: { inApp: true, email: false },
  mutedModules: ['mail'],
  escalation: { enabled: true, afterHours: 24, targetRoleId: null },
};

class MemoryRepository implements NotificationAttentionRepository {
  value = preferences;
  metrics: AttentionMetrics = { impressions: 0, actions: 0, dismissals: 0, digestOpens: 0 };
  async isRoleInTenant(_tenantId: string, roleId: string) { return roleId === 'valid-role'; }
  async getPreferences() { return this.value; }
  async savePreferences(_tenantId: string, _userId: string, value: NotificationAttentionPreferences) { this.value = value; }
  async getMetrics() { return this.metrics; }
  async recordEvent(_tenantId: string, _userId: string, event: AttentionEventType) { if (event === 'ACTION') this.metrics.actions += 1; }
}

function smart(id: string, severity: SmartNotificationItem['severity'], module: string): SmartNotificationItem {
  return { id, severity, module, category: 'low_stock', title: id, message: id, count: 1, href: '/dashboard', sourceType: 'test', sourceId: null, actionHref: '/dashboard', suggestedAction: { type: 'open', label: 'Aç', href: '/dashboard' }, lifecycleStatus: 'new', snoozedUntil: null, createdAt: '2026-09-03T21:00:00.000Z' };
}

describe('notification attention service', () => {
  it('keeps only critical work in focus during quiet hours and deduplicates system events', async () => {
    const service = new NotificationAttentionService(new MemoryRepository());
    const result = await service.getSummary('tenant', 'user', [smart('critical', 'critical', 'inventory'), smart('high', 'high', 'sales'), smart('muted', 'critical', 'mail')], [
      { id: 'n1', title: 'Fatura güncellendi', module: 'sales', entityType: 'INVOICE', entityId: 'invoice-1', createdAt: new Date('2026-09-03T20:00:00Z') },
      { id: 'n2', title: 'Fatura güncellendi', module: 'sales', entityType: 'INVOICE', entityId: 'invoice-1', createdAt: new Date('2026-09-03T21:00:00Z') },
    ], new Date('2026-09-03T22:00:00Z'));
    expect(result.quietHoursActive).toBe(true);
    expect(result.focusSmartIds).toEqual(['critical']);
    expect(result.groupedSystemNotifications[0]?.count).toBe(2);
    expect(result.suppressedCount).toBe(1);
  });

  it('sanitizes invalid times, ranges and module names', () => {
    const result = sanitizePreferences({ ...preferences, quietHours: { ...preferences.quietHours, start: '99:00', timezone: 'Invalid/Zone' }, digest: { cadence: 'WEEKLY', hour: 99, weekday: -2 }, mutedModules: ['sales', '../unsafe'] });
    expect(result.quietHours.start).toBe('20:00');
    expect(result.quietHours.timezone).toBe('Europe/Istanbul');
    expect(result.digest).toMatchObject({ hour: 23, weekday: 0 });
    expect(result.mutedModules).toEqual(['sales']);
  });
});
