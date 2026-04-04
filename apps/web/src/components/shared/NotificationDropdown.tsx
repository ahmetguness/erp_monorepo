'use client';

import { useState, useRef, useEffect } from 'react';
import { Bell, Check, CheckCheck, Trash2, X } from 'lucide-react';
import { useNotifications, useMarkAsRead, useMarkAllAsRead, useDeleteNotification } from '@/hooks/useNotifications';
import { cn } from '@/lib/utils';

export function NotificationDropdown() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const { data } = useNotifications({ limit: 20 });
  const markRead = useMarkAsRead();
  const markAllRead = useMarkAllAsRead();
  const deleteNotif = useDeleteNotification();

  const notifications = data?.data ?? [];
  const unreadCount = data?.meta.unreadCount ?? 0;

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
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full bg-red-500 text-[9px] font-bold text-white flex items-center justify-center">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 bg-slate-900 border border-slate-800 rounded-xl shadow-2xl z-50 overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800/60">
            <span className="text-sm font-semibold text-white">Bildirimler</span>
            <div className="flex items-center gap-1">
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
            {notifications.length === 0 ? (
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
