import { create } from 'zustand';
import {
  fetchNotifications,
  markNotificationAsRead as apiMarkAsRead,
  markAllNotificationsAsRead as apiMarkAllAsRead,
  registerPushTokenToServer,
  NotificationItem,
} from '../services/notification.service';
import { registerForPushNotificationsAsync, setAppBadgeCount } from '../lib/notifications';

interface NotificationState {
  unreadCount: number;
  notifications: NotificationItem[];
  isLoading: boolean;
  error: string | null;
  pushToken: string | null;
}

interface NotificationActions {
  loadNotifications: (status?: 'UNREAD' | 'READ' | 'ARCHIVED') => Promise<void>;
  markAsRead: (id: string) => Promise<void>;
  markAllAsRead: () => Promise<void>;
  setUnreadCount: (count: number) => void;
  initializePushNotifications: () => Promise<void>;
}

export type NotificationStore = NotificationState & NotificationActions;

export const useNotificationStore = create<NotificationStore>((set, get) => ({
  unreadCount: 0,
  notifications: [],
  isLoading: false,
  error: null,
  pushToken: null,

  setUnreadCount: (count: number) => {
    set({ unreadCount: count });
    setAppBadgeCount(count);
  },

  loadNotifications: async (status) => {
    set({ isLoading: true, error: null });
    try {
      const response = await fetchNotifications({ status, limit: 30 });
      set({
        notifications: response.data,
        unreadCount: response.meta.unreadCount,
        isLoading: false,
      });
      setAppBadgeCount(response.meta.unreadCount);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Bildirimler yüklenemedi';
      set({ error: msg, isLoading: false });
    }
  },

  markAsRead: async (id: string) => {
    try {
      await apiMarkAsRead(id);
      set((state) => {
        const nextList = state.notifications.map((item) =>
          item.id === id ? { ...item, status: 'READ' as const, readAt: new Date().toISOString() } : item
        );
        const newUnread = Math.max(0, state.unreadCount - 1);
        setAppBadgeCount(newUnread);
        return {
          notifications: nextList,
          unreadCount: newUnread,
        };
      });
    } catch (err) {
      console.warn('[NotificationStore] Failed to mark notification as read:', err);
    }
  },

  markAllAsRead: async () => {
    try {
      await apiMarkAllAsRead();
      set((state) => ({
        notifications: state.notifications.map((item) => ({
          ...item,
          status: 'READ' as const,
          readAt: new Date().toISOString(),
        })),
        unreadCount: 0,
      }));
      setAppBadgeCount(0);
    } catch (err) {
      console.warn('[NotificationStore] Failed to mark all notifications as read:', err);
    }
  },

  initializePushNotifications: async () => {
    try {
      const { token } = await registerForPushNotificationsAsync();
      if (token) {
        set({ pushToken: token });
        await registerPushTokenToServer(token);
      }
    } catch (err) {
      console.warn('[NotificationStore] Push registration failed:', err);
    }
  },
}));
