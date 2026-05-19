'use client';

import { useState, useRef, useEffect } from 'react';
import type { ReactNode } from 'react';
import Link from 'next/link';
import { AlertTriangle, Bell, Check, CheckCheck, Info, Trash2, X } from 'lucide-react';
import { useNotifications, useSmartNotifications, useMarkAsRead, useMarkAllAsRead, useDeleteNotification, useDeleteAllNotifications } from '@/hooks/useNotifications';
import { cn } from '@/lib/utils';
import type { SmartNotification } from '@/services/notification.service';

const SMART_TONE: Record<SmartNotification['severity'], { icon: ReactNode; text: string; bg: string }> = {
  critical: {
    icon: <AlertTriangle className="h-3.5 w-3.5 text-red-400" />,
    text: 'text-red-300',
    bg: 'bg-red-500/[0.06] hover:bg-red-500/[0.1]',
  },
  warning: {
    icon: <AlertTriangle className="h-3.5 w-3.5 text-amber-400" />,
    text: 'text-amber-300',
    bg: 'bg-amber-500/[0.05] hover:bg-amber-500/[0.09]',
  },
  info: {
    icon: <Info className="h-3.5 w-3.5 text-sky-400" />,
    text: 'text-sky-300',
    bg: 'bg-sky-500/[0.04] hover:bg-sky-500/[0.08]',
  },
};

export function NotificationDropdown() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const { data } = useNotifications({ limit: 20 });
  const { data: smartSummary } = useSmartNotifications();
  const markRead = useMarkAsRead();
  const markAllRead = useMarkAllAsRead();
  const deleteNotif = useDeleteNotification();
  const deleteAll = useDeleteAllNotifications();

  const notifications = data?.data ?? [];
  const unreadCount = data?.meta.unreadCount ?? 0;
  const smartItems = smartSummary?.items ?? [];
  const visibleCount = unreadCount + smartItems.length;

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

  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen((o) => !o)}
        className="relative p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors">
        <Bell className="w-4.5 h-4.5" />
        {visibleCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full bg-red-500 text-[9px] font-bold text-white flex items-center justify-center">
            {visibleCount > 9 ? '9+' : visibleCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 bg-slate-900 border border-slate-800 rounded-xl shadow-2xl z-50 overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800/60">
            <div>
              <span className="text-sm font-semibold text-white">Bildirimler</span>
              {smartItems.length > 0 && <p className="text-[10px] text-slate-500">{smartItems.length} akıllı uyarı</p>}
            </div>
            <div className="flex items-center gap-1">
              {notifications.length > 0 && (
                <button onClick={() => deleteAll.mutate()}
                  className="p-1.5 rounded-lg text-slate-500 hover:text-red-400 hover:bg-red-500/10 transition-colors" title="Tümünü temizle">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
              {unreadCount > 0 && (
                <button onClick={() => markAllRead.mutate()}
                  className="p-1.5 rounded-lg text-slate-500 hover:text-sky-400 hover:bg-sky-500/10 transition-colors" title="Tümünü okundu yap">
                  <CheckCheck className="w-3.5 h-3.5" />
                </button>
              )}
              <button onClick={() => setOpen(false)} className="p-1.5 rounded-lg text-slate-500 hover:text-white hover:bg-slate-800 transition-colors">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* List */}
          <div className="max-h-80 overflow-y-auto">
            {smartItems.length > 0 && (
              <div className="border-b border-slate-800/60">
                <div className="px-4 py-2 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                  Akıllı uyarılar
                </div>
                <div className="divide-y divide-slate-800/40">
                  {smartItems.map((item) => {
                    const tone = SMART_TONE[item.severity];
                    return (
                      <Link
                        key={item.id}
                        href={item.href}
                        onClick={() => setOpen(false)}
                        className={cn('flex items-start gap-3 px-4 py-3 transition-colors', tone.bg)}
                      >
                        <div className="mt-0.5 shrink-0">{tone.icon}</div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-start justify-between gap-2">
                            <p className={cn('text-xs font-semibold line-clamp-1', tone.text)}>{item.title}</p>
                            <span className="rounded-md bg-slate-950/70 px-1.5 py-0.5 text-[10px] font-bold text-slate-300">{item.count}</span>
                          </div>
                          <p className="mt-0.5 line-clamp-2 text-[10px] text-slate-500">{item.message}</p>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              </div>
            )}

            {notifications.length === 0 && smartItems.length === 0 ? (
              <div className="py-10 text-center">
                <Bell className="w-6 h-6 text-slate-700 mx-auto mb-2" />
                <p className="text-xs text-slate-600">Bildirim yok</p>
              </div>
            ) : (
              <div className="divide-y divide-slate-800/40">
                {notifications.map((n) => (
                  <div key={n.id} className={cn(
                    'flex items-start gap-3 px-4 py-3 transition-colors group',
                    n.status === 'UNREAD' ? 'bg-sky-500/[0.03] hover:bg-sky-500/[0.06]' : 'hover:bg-slate-800/20',
                  )}>
                    {n.status === 'UNREAD' && <div className="w-1.5 h-1.5 rounded-full bg-sky-400 mt-2 shrink-0" />}
                    <div className="flex-1 min-w-0">
                      <p className={cn('text-xs font-medium', n.status === 'UNREAD' ? 'text-white' : 'text-slate-400')}>{n.title}</p>
                      {n.message && <p className="text-[10px] text-slate-500 mt-0.5 line-clamp-2">{n.message}</p>}
                      <p className="text-[9px] text-slate-600 mt-1">{formatTime(n.createdAt)}</p>
                    </div>
                    <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                      {n.status === 'UNREAD' && (
                        <button onClick={() => markRead.mutate(n.id)} className="p-1 rounded text-slate-600 hover:text-emerald-400" title="Okundu">
                          <Check className="w-3 h-3" />
                        </button>
                      )}
                      <button onClick={() => deleteNotif.mutate(n.id)} className="p-1 rounded text-slate-600 hover:text-red-400" title="Sil">
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
