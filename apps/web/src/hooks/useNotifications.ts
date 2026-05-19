'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useUIStore } from '@/store/ui.store';
import { getErrorMessage } from '@/types/api.types';
import {
  getNotifications,
  getSmartNotifications,
  markAsRead,
  markAllAsRead,
  deleteNotification,
  deleteAllNotifications,
  archiveNotification,
  updateSmartNotificationState,
  type SmartNotificationAction,
} from '@/services/notification.service';

export function useNotifications(params?: { status?: string; limit?: number }) {
  return useQuery({
    queryKey: ['notifications', params],
    queryFn: () => getNotifications(params),
    refetchInterval: 60 * 1000, // poll every 60s
  });
}

export function useSmartNotifications() {
  return useQuery({
    queryKey: ['notifications', 'smart'],
    queryFn: getSmartNotifications,
    refetchInterval: 60 * 1000,
  });
}

export function useMarkAsRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => markAsRead(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  });
}

export function useMarkAllAsRead() {
  const qc = useQueryClient();
  const { toast } = useUIStore();
  return useMutation({
    mutationFn: () => markAllAsRead(),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['notifications'] }); toast.success('Tüm bildirimler okundu.'); },
    onError: (e: unknown) => toast.error(getErrorMessage(e)),
  });
}

export function useDeleteNotification() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteNotification(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  });
}

export function useDeleteAllNotifications() {
  const qc = useQueryClient();
  const { toast } = useUIStore();
  return useMutation({
    mutationFn: () => deleteAllNotifications(),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['notifications'] }); toast.success('Tüm bildirimler silindi.'); },
    onError: (e: unknown) => toast.error(getErrorMessage(e)),
  });
}

export function useArchiveNotification() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => archiveNotification(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  });
}

export function useSmartNotificationAction() {
  const qc = useQueryClient();
  const { toast } = useUIStore();
  return useMutation({
    mutationFn: ({ id, action, snoozedUntil }: { id: string; action: SmartNotificationAction; snoozedUntil?: string }) =>
      updateSmartNotificationState(id, action, snoozedUntil),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['notifications'] });
      if (vars.action === 'acknowledge') toast.success('Akıllı uyarı ele alındı.');
      if (vars.action === 'complete') toast.success('Akıllı uyarı tamamlandı.');
      if (vars.action === 'snooze') toast.success('Akıllı uyarı ertelendi.');
      if (vars.action === 'hide') toast.success('Akıllı uyarı gizlendi.');
    },
    onError: (e: unknown) => toast.error(getErrorMessage(e)),
  });
}
