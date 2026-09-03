import { z } from 'zod';
import { apiClient } from '@/lib/api-client';
import { safeParse } from '@/lib/safe-parse';
import { SingleResponseSchema } from '@/types/api.types';

export const NotificationSchema = z.object({
  id: z.string(), tenantId: z.string(), userId: z.string(),
  title: z.string(), message: z.string().nullable(),
  module: z.string().nullable(), entityType: z.string().nullable(), entityId: z.string().nullable(),
  status: z.enum(['UNREAD', 'READ', 'ARCHIVED']),
  createdAt: z.string(), readAt: z.string().nullable(),
});

export type Notification = z.infer<typeof NotificationSchema>;

export const SmartNotificationSchema = z.object({
  id: z.string(),
  category: z.enum([
    'collection_due',
    'low_stock',
    'pending_approval',
    'pending_leave',
    'service_sla',
    'edocument_error',
    'mail_failed',
  ]),
  severity: z.enum(['critical', 'high', 'medium', 'low']),
  title: z.string(),
  message: z.string(),
  count: z.coerce.number(),
  href: z.string(),
  module: z.string(),
  sourceType: z.string(),
  sourceId: z.string().nullable(),
  actionHref: z.string(),
  suggestedAction: z.object({
    type: z.enum(['open', 'review', 'create_task', 'send_mail']),
    label: z.string(),
    href: z.string(),
  }),
  lifecycleStatus: z.enum(['new', 'acknowledged', 'completed', 'snoozed', 'hidden']),
  snoozedUntil: z.string().nullable(),
  createdAt: z.string(),
});

export const SmartNotificationSummarySchema = z.object({
  items: z.array(SmartNotificationSchema),
  totalCount: z.coerce.number(),
  criticalCount: z.coerce.number(),
  highCount: z.coerce.number(),
  mediumCount: z.coerce.number(),
});

export type SmartNotification = z.infer<typeof SmartNotificationSchema>;
export type SmartNotificationSummary = z.infer<typeof SmartNotificationSummarySchema>;
export type SmartNotificationAction = 'acknowledge' | 'complete' | 'snooze' | 'hide' | 'reopen';

export const NotificationAttentionPreferencesSchema = z.object({
  quietHours: z.object({ enabled: z.boolean(), start: z.string(), end: z.string(), timezone: z.string() }),
  digest: z.object({ cadence: z.enum(['OFF', 'DAILY', 'WEEKLY']), hour: z.number(), weekday: z.number() }),
  channels: z.object({ inApp: z.boolean(), email: z.boolean() }),
  mutedModules: z.array(z.string()),
  escalation: z.object({ enabled: z.boolean(), afterHours: z.number(), targetRoleId: z.string().nullable() }),
});

export const NotificationAttentionSummarySchema = z.object({
  preferences: NotificationAttentionPreferencesSchema,
  quietHoursActive: z.boolean(),
  focusSmartIds: z.array(z.string()),
  groupedSystemNotifications: z.array(z.object({ eventKey: z.string(), title: z.string(), module: z.string().nullable(), count: z.number(), notificationIds: z.array(z.string()), latestAt: z.string() })),
  digestCount: z.number(),
  suppressedCount: z.number(),
  nextDigestAt: z.string().nullable(),
  metrics: z.object({ impressions: z.number(), actions: z.number(), dismissals: z.number(), digestOpens: z.number() }),
});

export type NotificationAttentionPreferences = z.infer<typeof NotificationAttentionPreferencesSchema>;
export type NotificationAttentionSummary = z.infer<typeof NotificationAttentionSummarySchema>;
export type AttentionEventType = 'IMPRESSION' | 'ACTION' | 'DISMISS' | 'DIGEST_OPENED';

const ListSchema = z.object({
  data: z.array(NotificationSchema),
  meta: z.object({ unreadCount: z.coerce.number() }),
});

export async function getNotifications(params?: { status?: string; limit?: number }) {
  const res = await apiClient.get('/api/notifications', { params });
  return safeParse(ListSchema, res.data, 'getNotifications');
}

export async function getSmartNotifications(): Promise<SmartNotificationSummary> {
  const res = await apiClient.get('/api/notifications/smart');
  return safeParse(SingleResponseSchema(SmartNotificationSummarySchema), res.data, 'getSmartNotifications').data;
}

export async function updateSmartNotificationState(id: string, action: SmartNotificationAction, snoozedUntil?: string): Promise<void> {
  await apiClient.post(`/api/notifications/smart/${encodeURIComponent(id)}/action`, {
    action,
    ...(snoozedUntil && { snoozedUntil }),
  });
}

export async function getNotificationAttention(): Promise<NotificationAttentionSummary> {
  const response = await apiClient.get('/api/notifications/attention');
  return safeParse(SingleResponseSchema(NotificationAttentionSummarySchema), response.data, 'getNotificationAttention').data;
}

export async function updateNotificationAttentionPreferences(preferences: NotificationAttentionPreferences): Promise<NotificationAttentionPreferences> {
  const response = await apiClient.put('/api/notifications/attention/preferences', preferences);
  return safeParse(SingleResponseSchema(NotificationAttentionPreferencesSchema), response.data, 'updateNotificationAttentionPreferences').data;
}

export async function recordNotificationAttentionEvent(event: AttentionEventType): Promise<void> {
  await apiClient.post('/api/notifications/attention/events', { event });
}

export async function markAsRead(id: string): Promise<Notification> {
  const res = await apiClient.post(`/api/notifications/${id}/read`);
  return safeParse(SingleResponseSchema(NotificationSchema), res.data, 'markAsRead').data;
}

export async function markAllAsRead(): Promise<void> {
  await apiClient.post('/api/notifications/read-all');
}

export async function deleteNotification(id: string): Promise<void> {
  await apiClient.delete(`/api/notifications/${id}`);
}

export async function deleteAllNotifications(): Promise<void> {
  await apiClient.delete('/api/notifications/all');
}

export async function archiveNotification(id: string): Promise<Notification> {
  const res = await apiClient.post(`/api/notifications/${id}/archive`);
  return safeParse(SingleResponseSchema(NotificationSchema), res.data, 'archiveNotification').data;
}

export async function bulkMarkAsRead(ids: string[]): Promise<void> {
  await apiClient.post('/api/notifications/bulk-read', { ids });
}

export async function bulkArchiveNotifications(ids: string[]): Promise<void> {
  await apiClient.post('/api/notifications/bulk-archive', { ids });
}

export async function bulkDeleteNotifications(ids: string[]): Promise<void> {
  await apiClient.delete('/api/notifications/bulk', { data: { ids } });
}
