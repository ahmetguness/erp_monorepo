import { z } from 'zod';
import { apiClient } from '@/lib/api-client';
import { safeParse } from '@/lib/safe-parse';
import { SingleResponseSchema } from '@/types/api.types';

export const NotificationSchema = z.object({
  id: z.string(), tenantId: z.string(), userId: z.string(),
  title: z.string(), message: z.string().nullable(),
  module: z.string().nullable(), entityType: z.string().nullable(), entityId: z.string().nullable(),
  status: z.enum(['UNREAD', 'READ']),
  createdAt: z.string(), readAt: z.string().nullable(),
});

export type Notification = z.infer<typeof NotificationSchema>;

const ListSchema = z.object({
  data: z.array(NotificationSchema),
  meta: z.object({ unreadCount: z.coerce.number() }),
});

export async function getNotifications(params?: { status?: string; limit?: number }) {
  const res = await apiClient.get('/api/notifications', { params });
  return safeParse(ListSchema, res.data, 'getNotifications');
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
