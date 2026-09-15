import { z } from 'zod';
import { apiClient } from '../lib/api-client';

export const NotificationItemSchema = z.object({
  id: z.string(),
  tenantId: z.string().optional(),
  userId: z.string().optional(),
  title: z.string(),
  message: z.string().nullable().optional(),
  module: z.string().nullable().optional(),
  entityType: z.string().nullable().optional(),
  entityId: z.string().nullable().optional(),
  status: z.enum(['UNREAD', 'READ', 'ARCHIVED']),
  createdAt: z.string(),
  readAt: z.string().nullable().optional(),
});

export const NotificationListResponseSchema = z.object({
  data: z.array(NotificationItemSchema),
  meta: z.object({
    unreadCount: z.number().default(0),
  }),
});

export type NotificationItem = z.infer<typeof NotificationItemSchema>;
export type NotificationListResponse = z.infer<typeof NotificationListResponseSchema>;

export async function fetchNotifications(params?: {
  status?: 'UNREAD' | 'READ' | 'ARCHIVED';
  limit?: number;
}): Promise<NotificationListResponse> {
  const res = await apiClient.get('/api/notifications', { params });
  return NotificationListResponseSchema.parse(res.data);
}

export async function markNotificationAsRead(id: string): Promise<NotificationItem> {
  const res = await apiClient.post(`/api/notifications/${id}/read`);
  return NotificationItemSchema.parse(res.data.data);
}

export async function markAllNotificationsAsRead(): Promise<boolean> {
  const res = await apiClient.post('/api/notifications/read-all');
  return !!res.data.data?.success;
}

export async function archiveNotification(id: string): Promise<NotificationItem> {
  const res = await apiClient.post(`/api/notifications/${id}/archive`);
  return NotificationItemSchema.parse(res.data.data);
}

export async function deleteNotification(id: string): Promise<boolean> {
  const res = await apiClient.delete(`/api/notifications/${id}`);
  return !!res.data.data?.success;
}

export async function registerPushTokenToServer(pushToken: string): Promise<boolean> {
  const res = await apiClient.post('/api/notifications/push-token', { pushToken });
  return !!res.data.data?.success;
}
