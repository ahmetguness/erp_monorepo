'use client';

import { useState, useRef, useEffect } from 'react';
import type { ReactNode } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  Bell,
  Check,
  CheckCheck,
  Clock3,
  EyeOff,
  Info,
  Trash2,
  X,
  ExternalLink,
  Sparkles,
  Inbox,
  Filter,
} from 'lucide-react';
import {
  useNotifications,
  useSmartNotifications,
  useMarkAsRead,
  useMarkAllAsRead,
  useDeleteNotification,
  useDeleteAllNotifications,
  useSmartNotificationAction,
} from '@/hooks/useNotifications';
import { cn } from '@/lib/utils';
import type { SmartNotification } from '@/services/notification.service';

const SMART_TONE: Record<SmartNotification['severity'], { icon: ReactNode; text: string; bg: string; badge: string }> = {
  critical: {
    icon: <AlertTriangle className="h-3.5 w-3.5 text-red-400 shrink-0" />,
    text: 'text-red-300',
    bg: 'bg-red-500/[0.06] hover:bg-red-500/[0.1] border-l-2 border-red-500',
    badge: 'bg-red-500/20 text-red-300 border border-red-500/30',
  },
  high: {
    icon: <AlertTriangle className="h-3.5 w-3.5 text-amber-400 shrink-0" />,
    text: 'text-amber-300',
    bg: 'bg-amber-500/[0.05] hover:bg-amber-500/[0.09] border-l-2 border-amber-500',
    badge: 'bg-amber-500/20 text-amber-300 border border-amber-500/30',
  },
  medium: {
    icon: <Info className="h-3.5 w-3.5 text-sky-400 shrink-0" />,
    text: 'text-sky-300',
    bg: 'bg-sky-500/[0.04] hover:bg-sky-500/[0.08] border-l-2 border-sky-500',
    badge: 'bg-sky-500/20 text-sky-300 border border-sky-500/30',
  },
  low: {
    icon: <Info className="h-3.5 w-3.5 text-slate-400 shrink-0" />,
    text: 'text-slate-300',
    bg: 'bg-slate-500/[0.04] hover:bg-slate-500/[0.08] border-l-2 border-slate-600',
    badge: 'bg-slate-500/20 text-slate-300 border border-slate-500/30',
  },
};

type DropdownTab = 'all' | 'unread' | 'smart';

export function NotificationDropdown() {
  const [open, setOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<DropdownTab>('all');
  const ref = useRef<HTMLDivElement>(null);
  
  const { data } = useNotifications({ limit: 30 });
  const { data: smartSummary } = useSmartNotifications();
  const markRead = useMarkAsRead();
  const markAllRead = useMarkAllAsRead();
  const deleteNotif = useDeleteNotification();
  const deleteAll = useDeleteAllNotifications();
  const smartAction = useSmartNotificationAction();

  const notifications = data?.data ?? [];
  const unreadCount = data?.meta.unreadCount ?? 0;
  const smartItems = smartSummary?.items ?? [];
  const totalAlertCount = unreadCount + smartItems.length;

  // Filter items based on active tab
  const filteredNotifications = notifications.filter((n) => {
    if (activeTab === 'unread') return n.status === 'UNREAD';
    return true;
  });

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const formatTime = (dateStr: string) => {
    const d = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 1) return 'Az önce';
    if (diffMin < 60) return `${diffMin} dk`;
    const diffH = Math.floor(diffMin / 60);
    if (diffH < 24) return `${diffH} sa`;
    return `${Math.floor(diffH / 24)} gün`;
  };

  const snoozeTomorrow = (id: string) => {
    const date = new Date();
    date.setDate(date.getDate() + 1);
    smartAction.mutate({ id, action: 'snooze', snoozedUntil: date.toISOString() });
  };

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label="Bildirimler"
        className="relative p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800/80 transition-colors focus:outline-none focus:ring-2 focus:ring-sky-500/50"
      >
        <Bell className="w-4.5 h-4.5" />
        {totalAlertCount > 0 && (
          <>
            <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-red-500 animate-ping" />
            <span className="absolute -top-0.5 -right-0.5 min-w-4 h-4 px-1 rounded-full bg-gradient-to-r from-red-500 to-rose-600 text-[9px] font-bold text-white flex items-center justify-center shadow-lg shadow-red-500/30">
              {totalAlertCount > 9 ? '9+' : totalAlertCount}
            </span>
          </>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-88 sm:w-96 bg-slate-900/95 backdrop-blur-xl border border-slate-800/90 rounded-2xl shadow-2xl z-50 overflow-hidden ring-1 ring-slate-800">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800/80 bg-slate-950/40">
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-white tracking-wide">Bildirimler</span>
              {unreadCount > 0 && (
                <span className="px-2 py-0.5 rounded-full bg-sky-500/10 text-sky-400 border border-sky-500/20 text-[10px] font-medium">
                  {unreadCount} yeni
                </span>
              )}
            </div>

            <div className="flex items-center gap-1">
              {unreadCount > 0 && (
                <button
                  onClick={() => markAllRead.mutate()}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-emerald-400 hover:bg-emerald-500/10 transition-colors"
                  title="Tümünü okundu işaretle"
                >
                  <CheckCheck className="w-3.5 h-3.5" />
                </button>
              )}
              {notifications.length > 0 && (
                <button
                  onClick={() => deleteAll.mutate()}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                  title="Tümünü temizle"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
              <button
                onClick={() => setOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Navigation Tabs */}
          <div className="flex items-center gap-1 px-3 py-1.5 border-b border-slate-800/60 bg-slate-950/20 text-xs">
            <button
              onClick={() => setActiveTab('all')}
              className={cn(
                'px-2.5 py-1 rounded-lg font-medium transition-all',
                activeTab === 'all'
                  ? 'bg-slate-800 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40',
              )}
            >
              Tümü ({notifications.length})
            </button>
            <button
              onClick={() => setActiveTab('unread')}
              className={cn(
                'px-2.5 py-1 rounded-lg font-medium transition-all flex items-center gap-1',
                activeTab === 'unread'
                  ? 'bg-slate-800 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40',
              )}
            >
              Okunmamış
              {unreadCount > 0 && (
                <span className="w-1.5 h-1.5 rounded-full bg-sky-400" />
              )}
            </button>
            {smartItems.length > 0 && (
              <button
                onClick={() => setActiveTab('smart')}
                className={cn(
                  'px-2.5 py-1 rounded-lg font-medium transition-all flex items-center gap-1',
                  activeTab === 'smart'
                    ? 'bg-amber-500/20 text-amber-300 shadow-sm border border-amber-500/30'
                    : 'text-amber-400/80 hover:text-amber-300 hover:bg-amber-500/10',
                )}
              >
                <Sparkles className="w-3 h-3 text-amber-400" />
                Akıllı Uyarılar ({smartItems.length})
              </button>
            )}
          </div>

          {/* List Content */}
          <div className="max-h-84 overflow-y-auto divide-y divide-slate-800/40 scrollbar-thin scrollbar-thumb-slate-800">
            {/* Smart Alerts Block if activeTab is 'all' or 'smart' */}
            {(activeTab === 'all' || activeTab === 'smart') && smartItems.length > 0 && (
              <div className="bg-slate-950/30">
                <div className="px-4 py-2 text-[10px] font-bold uppercase tracking-wider text-amber-400/90 flex items-center gap-1.5">
                  <Sparkles className="w-3 h-3" />
                  Kritik Akıllı Uyarılar
                </div>
                <div className="divide-y divide-slate-800/40">
                  {smartItems.map((item) => {
                    const tone = SMART_TONE[item.severity];
                    return (
                      <div
                        key={item.id}
                        className={cn('flex items-start gap-3 px-4 py-3 transition-all group', tone.bg)}
                      >
                        <div className="mt-0.5">{tone.icon}</div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-2">
                            <Link
                              href={item.actionHref}
                              onClick={() => setOpen(false)}
                              className={cn('text-xs font-semibold line-clamp-1 hover:underline', tone.text)}
                            >
                              {item.title}
                            </Link>
                            <span className={cn('rounded-md px-1.5 py-0.5 text-[10px] font-bold shrink-0', tone.badge)}>
                              {item.count}
                            </span>
                          </div>
                          <p className="mt-0.5 line-clamp-2 text-[11px] text-slate-400 leading-relaxed">
                            {item.message}
                          </p>

                          <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                            {item.lifecycleStatus === 'acknowledged' && (
                              <span className="rounded-md bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 text-[9px] font-medium text-emerald-400">
                                Ele Alındı
                              </span>
                            )}
                            <Link
                              href={item.suggestedAction.href}
                              onClick={() => setOpen(false)}
                              className="rounded-lg bg-slate-800/90 hover:bg-slate-700 px-2 py-1 text-[10px] font-medium text-slate-200 transition-colors flex items-center gap-1 border border-slate-700/60"
                            >
                              {item.suggestedAction.label}
                              <ExternalLink className="w-2.5 h-2.5" />
                            </Link>

                            {item.lifecycleStatus !== 'acknowledged' && (
                              <button
                                onClick={() => smartAction.mutate({ id: item.id, action: 'acknowledge' })}
                                className="rounded-lg bg-slate-900 p-1 text-slate-400 hover:text-emerald-400 hover:bg-emerald-500/10 border border-slate-800 transition-colors"
                                title="Ele Al"
                              >
                                <Check className="h-3 w-3" />
                              </button>
                            )}
                            <button
                              onClick={() => snoozeTomorrow(item.id)}
                              className="rounded-lg bg-slate-900 p-1 text-slate-400 hover:text-amber-400 hover:bg-amber-500/10 border border-slate-800 transition-colors"
                              title="1 Gün Ertele"
                            >
                              <Clock3 className="h-3 w-3" />
                            </button>
                            <button
                              onClick={() => smartAction.mutate({ id: item.id, action: 'complete' })}
                              className="rounded-lg bg-slate-900 p-1 text-slate-400 hover:text-sky-400 hover:bg-sky-500/10 border border-slate-800 transition-colors"
                              title="Tamamlandı Olarak İşaretle"
                            >
                              <CheckCheck className="h-3 w-3" />
                            </button>
                            <button
                              onClick={() => smartAction.mutate({ id: item.id, action: 'hide' })}
                              className="rounded-lg bg-slate-900 p-1 text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 border border-slate-800 transition-colors"
                              title="Gizle"
                            >
                              <EyeOff className="h-3 w-3" />
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Standard System Notifications */}
            {activeTab !== 'smart' && filteredNotifications.length > 0 && (
              <div className="divide-y divide-slate-800/40">
                {filteredNotifications.map((n) => (
                  <div
                    key={n.id}
                    className={cn(
                      'flex items-start gap-3 px-4 py-3 transition-colors group',
                      n.status === 'UNREAD'
                        ? 'bg-sky-500/[0.04] hover:bg-sky-500/[0.08]'
                        : 'hover:bg-slate-800/30 text-slate-400',
                    )}
                  >
                    {n.status === 'UNREAD' ? (
                      <div className="w-2 h-2 rounded-full bg-sky-400 mt-1.5 shrink-0 shadow-sm shadow-sky-400/50" />
                    ) : (
                      <div className="w-2 h-2 rounded-full bg-slate-700 mt-1.5 shrink-0" />
                    )}

                    <div className="flex-1 min-w-0">
                      <p className={cn('text-xs font-semibold leading-snug', n.status === 'UNREAD' ? 'text-white' : 'text-slate-300')}>
                        {n.title}
                      </p>
                      {n.message && (
                        <p className="text-[11px] text-slate-400 mt-0.5 line-clamp-2 leading-relaxed">
                          {n.message}
                        </p>
                      )}
                      <div className="mt-1 flex items-center gap-2 text-[9px] text-slate-500">
                        {n.module && (
                          <span className="uppercase font-semibold tracking-wider px-1.5 py-0.2 rounded bg-slate-800 text-slate-400">
                            {n.module}
                          </span>
                        )}
                        <span>{formatTime(n.createdAt)}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                      {n.status === 'UNREAD' && (
                        <button
                          onClick={() => markRead.mutate(n.id)}
                          className="p-1 rounded-lg text-slate-400 hover:text-emerald-400 hover:bg-emerald-500/10 transition-colors"
                          title="Okundu"
                        >
                          <Check className="w-3.5 h-3.5" />
                        </button>
                      )}
                      <button
                        onClick={() => deleteNotif.mutate(n.id)}
                        className="p-1 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
                        title="Sil"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Empty state */}
            {((activeTab === 'smart' && smartItems.length === 0) ||
              (activeTab !== 'smart' && filteredNotifications.length === 0 && (activeTab === 'all' ? smartItems.length === 0 : true))) && (
              <div className="py-12 text-center px-4">
                <div className="w-10 h-10 rounded-2xl bg-slate-800/80 border border-slate-700/50 flex items-center justify-center mx-auto mb-3 text-slate-400 shadow-inner">
                  <Inbox className="w-5 h-5" />
                </div>
                <p className="text-xs font-semibold text-slate-300">Bildirim bulunmuyor</p>
                <p className="text-[10px] text-slate-500 mt-1">
                  Şu an için gösterilecek herhangi bir bildirim veya akıllı uyarı yok.
                </p>
              </div>
            )}
          </div>

          {/* Footer Navigation Link */}
          <div className="p-2.5 bg-slate-950/70 border-t border-slate-800/80 text-center">
            <Link
              href="/dashboard/notifications"
              onClick={() => setOpen(false)}
              className="w-full py-1.5 px-3 rounded-xl bg-slate-800/60 hover:bg-sky-500/15 text-slate-300 hover:text-sky-300 text-xs font-semibold transition-all flex items-center justify-center gap-1.5 border border-slate-700/50 hover:border-sky-500/40 group"
            >
              <span>Tüm Bildirimleri ve Geçmişi Gör</span>
              <ExternalLink className="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5" />
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
