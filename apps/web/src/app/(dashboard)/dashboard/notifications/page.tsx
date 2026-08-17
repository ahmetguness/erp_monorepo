'use client';

import { useState, useMemo } from 'react';
import type { ReactNode } from 'react';
import Link from 'next/link';
import {
  Bell,
  AlertTriangle,
  Info,
  CheckCircle2,
  CheckCheck,
  Check,
  Clock3,
  EyeOff,
  Trash2,
  Archive,
  Search,
  Filter,
  RefreshCw,
  Sparkles,
  ExternalLink,
  ShieldAlert,
  Inbox,
  ArrowUpDown,
  CheckSquare,
  Square,
  DollarSign,
  Package,
  FileCheck,
  Wrench,
  Mail,
  UserCheck,
} from 'lucide-react';
import {
  useNotifications,
  useSmartNotifications,
  useMarkAsRead,
  useMarkAllAsRead,
  useDeleteNotification,
  useDeleteAllNotifications,
  useArchiveNotification,
  useBulkMarkAsRead,
  useBulkArchive,
  useBulkDelete,
  useSmartNotificationAction,
} from '@/hooks/useNotifications';
import { cn } from '@/lib/utils';
import type { Notification, SmartNotification } from '@/services/notification.service';

const CATEGORY_MAP: Record<string, { label: string; icon: ReactNode; color: string }> = {
  collection_due: { label: 'Tahsilat & Finans', icon: <DollarSign className="w-3.5 h-3.5" />, color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20' },
  low_stock: { label: 'Kritik Stok', icon: <Package className="w-3.5 h-3.5" />, color: 'text-amber-400 bg-amber-500/10 border-amber-500/20' },
  pending_approval: { label: 'Onay Bekleyen', icon: <CheckSquare className="w-3.5 h-3.5" />, color: 'text-purple-400 bg-purple-500/10 border-purple-500/20' },
  pending_leave: { label: 'İzin Talebi', icon: <UserCheck className="w-3.5 h-3.5" />, color: 'text-sky-400 bg-sky-500/10 border-sky-500/20' },
  service_sla: { label: 'Servis SLA', icon: <Wrench className="w-3.5 h-3.5" />, color: 'text-orange-400 bg-orange-500/10 border-orange-500/20' },
  edocument_error: { label: 'e-Dönüşüm Hatası', icon: <FileCheck className="w-3.5 h-3.5" />, color: 'text-rose-400 bg-rose-500/10 border-rose-500/20' },
  mail_failed: { label: 'Mail Gönderimi', icon: <Mail className="w-3.5 h-3.5" />, color: 'text-slate-400 bg-slate-500/10 border-slate-500/20' },
};

type StatusFilter = 'ALL' | 'UNREAD' | 'READ' | 'ARCHIVED';
type TypeFilter = 'ALL' | 'SMART' | 'SYSTEM';
type SeverityFilter = 'ALL' | 'critical' | 'high' | 'medium' | 'low';

export default function NotificationsPage() {
  // Query hooks
  const { data: notificationsData, isLoading: isNotifLoading, refetch: refetchNotifs } = useNotifications({ limit: 100 });
  const { data: smartSummary, isLoading: isSmartLoading, refetch: refetchSmart } = useSmartNotifications();

  // Mutation hooks
  const markRead = useMarkAsRead();
  const markAllRead = useMarkAllAsRead();
  const deleteNotif = useDeleteNotification();
  const deleteAll = useDeleteAllNotifications();
  const archiveNotif = useArchiveNotification();
  const bulkMarkRead = useBulkMarkAsRead();
  const bulkArchive = useBulkArchive();
  const bulkDelete = useBulkDelete();
  const smartAction = useSmartNotificationAction();

  // State
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('ALL');
  const [severityFilter, setSeverityFilter] = useState<SeverityFilter>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const notifications = notificationsData?.data ?? [];
  const unreadCount = notificationsData?.meta.unreadCount ?? 0;
  const smartItems = smartSummary?.items ?? [];

  // Metrics
  const criticalCount = smartSummary?.criticalCount ?? 0;
  const highCount = smartSummary?.highCount ?? 0;
  const totalCount = notifications.length + smartItems.length;

  // Filtered lists
  const filteredSmartItems = useMemo(() => {
    if (typeFilter === 'SYSTEM') return [];
    return smartItems.filter((item) => {
      if (severityFilter !== 'ALL' && item.severity !== severityFilter) return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        return item.title.toLowerCase().includes(q) || item.message.toLowerCase().includes(q);
      }
      return true;
    });
  }, [smartItems, typeFilter, severityFilter, searchQuery]);

  const filteredNotifications = useMemo(() => {
    if (typeFilter === 'SMART') return [];
    return notifications.filter((n) => {
      if (statusFilter === 'UNREAD' && n.status !== 'UNREAD') return false;
      if (statusFilter === 'READ' && n.status !== 'READ') return false;
      if (statusFilter === 'ARCHIVED' && n.status !== 'ARCHIVED') return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        return n.title.toLowerCase().includes(q) || (n.message && n.message.toLowerCase().includes(q));
      }
      return true;
    });
  }, [notifications, typeFilter, statusFilter, searchQuery]);

  // Bulk Selection Helpers
  const toggleSelectAll = () => {
    if (selectedIds.length === filteredNotifications.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(filteredNotifications.map((n) => n.id));
    }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]));
  };

  const handleBulkRead = () => {
    if (selectedIds.length === 0) return;
    bulkMarkRead.mutate(selectedIds, { onSuccess: () => setSelectedIds([]) });
  };

  const handleBulkArchive = () => {
    if (selectedIds.length === 0) return;
    bulkArchive.mutate(selectedIds, { onSuccess: () => setSelectedIds([]) });
  };

  const handleBulkDelete = () => {
    if (selectedIds.length === 0) return;
    bulkDelete.mutate(selectedIds, { onSuccess: () => setSelectedIds([]) });
  };

  const snoozeTomorrow = (id: string) => {
    const date = new Date();
    date.setDate(date.getDate() + 1);
    smartAction.mutate({ id, action: 'snooze', snoozedUntil: date.toISOString() });
  };

  const formatTime = (dateStr: string) => {
    const d = new Date(dateStr);
    return d.toLocaleString('tr-TR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const isLoading = isNotifLoading || isSmartLoading;

  return (
    <div className="space-y-6 pb-12">
      {/* Top Header Banner */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-slate-900 via-slate-900/90 to-sky-950/40 p-6 border border-slate-800 shadow-2xl">
        <div className="absolute top-0 right-0 w-96 h-96 bg-sky-500/10 rounded-full blur-3xl pointer-events-none" />
        
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-sky-400 text-xs font-semibold uppercase tracking-wider mb-1">
              <Bell className="w-4 h-4" />
              <span>Bildirim & İkaz Yönetim Merkezi</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
              Bildirimler
            </h1>
            <p className="text-slate-400 text-sm mt-1 max-w-xl">
              Sistem uyarıları, finansal hatırlatmalar, kritik stok ikazları ve onay süreçlerinizi tek merkezden takip edin.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                refetchNotifs();
                refetchSmart();
              }}
              className="px-3.5 py-2 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-300 text-xs font-medium transition-all border border-slate-700/60 flex items-center gap-2 shadow-sm"
              title="Yenile"
            >
              <RefreshCw className={cn('w-3.5 h-3.5', isLoading && 'animate-spin')} />
              <span>Yenile</span>
            </button>

            {unreadCount > 0 && (
              <button
                onClick={() => markAllRead.mutate()}
                className="px-4 py-2 rounded-xl bg-sky-500 hover:bg-sky-400 text-white text-xs font-semibold transition-all shadow-lg shadow-sky-500/25 flex items-center gap-2"
              >
                <CheckCheck className="w-4 h-4" />
                <span>Tümünü Okundu İşaretle</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Overview Stat Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Stat */}
        <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800/80 shadow-lg backdrop-blur-md">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Toplam Bildirim</span>
            <div className="p-2 rounded-xl bg-slate-800 text-slate-300">
              <Inbox className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-white">{totalCount}</div>
          <p className="text-[11px] text-slate-500 mt-1">Aktif ve geçmiş tüm bildirim kayıtları</p>
        </div>

        {/* Unread Stat */}
        <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800/80 shadow-lg backdrop-blur-md">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-sky-400">Okunmamış</span>
            <div className="p-2 rounded-xl bg-sky-500/10 text-sky-400 border border-sky-500/20">
              <Bell className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-sky-400">{unreadCount}</div>
          <p className="text-[11px] text-slate-500 mt-1">Aksiyon bekleyen okunmamış iletiler</p>
        </div>

        {/* Critical Alerts Stat */}
        <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800/80 shadow-lg backdrop-blur-md">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-rose-400">Kritik Akıllı Uyarılar</span>
            <div className="p-2 rounded-xl bg-rose-500/10 text-rose-400 border border-rose-500/20">
              <ShieldAlert className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-rose-400">{criticalCount}</div>
          <p className="text-[11px] text-slate-500 mt-1">Acil müdahale gerektiren sistem durumları</p>
        </div>

        {/* High Severity Stat */}
        <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800/80 shadow-lg backdrop-blur-md">
          <div className="flex items-center justify-between text-slate-400 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-amber-400">Yüksek Öncelikli</span>
            <div className="p-2 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20">
              <Sparkles className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-amber-400">{highCount}</div>
          <p className="text-[11px] text-slate-500 mt-1">Yüksek öncelikli akıllı öneriler</p>
        </div>
      </div>

      {/* Filter Toolbar & Actions */}
      <div className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800 shadow-xl space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          {/* Status Tabs */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 lg:pb-0 scrollbar-none">
            <button
              onClick={() => setStatusFilter('ALL')}
              className={cn(
                'px-3 py-1.5 rounded-xl text-xs font-semibold transition-all shrink-0',
                statusFilter === 'ALL'
                  ? 'bg-sky-500 text-white shadow-md shadow-sky-500/20'
                  : 'bg-slate-800/60 text-slate-400 hover:text-slate-200 hover:bg-slate-800',
              )}
            >
              Tümü
            </button>
            <button
              onClick={() => setStatusFilter('UNREAD')}
              className={cn(
                'px-3 py-1.5 rounded-xl text-xs font-semibold transition-all shrink-0 flex items-center gap-1.5',
                statusFilter === 'UNREAD'
                  ? 'bg-sky-500 text-white shadow-md shadow-sky-500/20'
                  : 'bg-slate-800/60 text-slate-400 hover:text-slate-200 hover:bg-slate-800',
              )}
            >
              Okunmamış
              {unreadCount > 0 && (
                <span className="px-1.5 py-0.2 rounded-full bg-sky-400/20 text-sky-200 text-[10px]">
                  {unreadCount}
                </span>
              )}
            </button>
            <button
              onClick={() => setStatusFilter('READ')}
              className={cn(
                'px-3 py-1.5 rounded-xl text-xs font-semibold transition-all shrink-0',
                statusFilter === 'READ'
                  ? 'bg-sky-500 text-white shadow-md shadow-sky-500/20'
                  : 'bg-slate-800/60 text-slate-400 hover:text-slate-200 hover:bg-slate-800',
              )}
            >
              Okunmuş
            </button>
            <button
              onClick={() => setStatusFilter('ARCHIVED')}
              className={cn(
                'px-3 py-1.5 rounded-xl text-xs font-semibold transition-all shrink-0',
                statusFilter === 'ARCHIVED'
                  ? 'bg-sky-500 text-white shadow-md shadow-sky-500/20'
                  : 'bg-slate-800/60 text-slate-400 hover:text-slate-200 hover:bg-slate-800',
              )}
            >
              Arşivlenmiş
            </button>
          </div>

          {/* Type & Search Filter */}
          <div className="flex items-center gap-2">
            <div className="relative flex-1 sm:w-64">
              <Search className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Bildirim ara..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-slate-950/80 border border-slate-800 rounded-xl pl-9 pr-4 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500"
              />
            </div>

            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value as TypeFilter)}
              className="bg-slate-950/80 border border-slate-800 rounded-xl px-3 py-1.5 text-xs text-slate-300 focus:outline-none focus:border-sky-500"
            >
              <option value="ALL">Tüm Türler</option>
              <option value="SMART">Akıllı Uyarılar</option>
              <option value="SYSTEM">Sistem Bildirimleri</option>
            </select>
          </div>
        </div>

        {/* Bulk Action Controls Bar */}
        {filteredNotifications.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-800/80 text-xs">
            <div className="flex items-center gap-3">
              <button
                onClick={toggleSelectAll}
                className="flex items-center gap-2 text-slate-400 hover:text-slate-200 transition-colors"
              >
                {selectedIds.length === filteredNotifications.length && filteredNotifications.length > 0 ? (
                  <CheckSquare className="w-4 h-4 text-sky-400" />
                ) : (
                  <Square className="w-4 h-4 text-slate-600" />
                )}
                <span>Tümünü Seç ({filteredNotifications.length})</span>
              </button>

              {selectedIds.length > 0 && (
                <span className="text-sky-400 font-semibold">
                  {selectedIds.length} öge seçildi
                </span>
              )}
            </div>

            {selectedIds.length > 0 && (
              <div className="flex items-center gap-2">
                <button
                  onClick={handleBulkRead}
                  className="px-3 py-1 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 transition-colors flex items-center gap-1.5"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>Okundu İşaretle</span>
                </button>
                <button
                  onClick={handleBulkArchive}
                  className="px-3 py-1 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/30 transition-colors flex items-center gap-1.5"
                >
                  <Archive className="w-3.5 h-3.5" />
                  <span>Arşivle</span>
                </button>
                <button
                  onClick={handleBulkDelete}
                  className="px-3 py-1 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 transition-colors flex items-center gap-1.5"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Sil</span>
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Main Notifications List Container */}
      <div className="space-y-4">
        {/* Smart Alerts Section */}
        {filteredSmartItems.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 px-1 text-amber-400 text-xs font-bold uppercase tracking-wider">
              <Sparkles className="w-4 h-4" />
              <span>Kritik & Yüksek Öncelikli Akıllı Uyarılar ({filteredSmartItems.length})</span>
            </div>

            <div className="grid grid-cols-1 gap-3">
              {filteredSmartItems.map((item) => {
                const categoryInfo = CATEGORY_MAP[item.category] || {
                  label: item.category,
                  icon: <AlertTriangle className="w-3.5 h-3.5" />,
                  color: 'text-slate-400 bg-slate-500/10 border-slate-500/20',
                };

                return (
                  <div
                    key={item.id}
                    className={cn(
                      'p-5 rounded-2xl bg-slate-900/80 border transition-all duration-200 shadow-lg relative overflow-hidden group',
                      item.severity === 'critical' && 'border-red-500/40 bg-red-950/10 hover:border-red-500/60',
                      item.severity === 'high' && 'border-amber-500/40 bg-amber-950/10 hover:border-amber-500/60',
                      item.severity === 'medium' && 'border-sky-500/30 bg-sky-950/10 hover:border-sky-500/50',
                      item.severity === 'low' && 'border-slate-800 bg-slate-900/40 hover:border-slate-700',
                    )}
                  >
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                      <div className="space-y-2 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={cn('px-2.5 py-0.5 rounded-lg text-[10px] font-bold border flex items-center gap-1.5', categoryInfo.color)}>
                            {categoryInfo.icon}
                            {categoryInfo.label}
                          </span>

                          <span className={cn(
                            'px-2 py-0.5 rounded-md text-[10px] font-extrabold uppercase tracking-wider',
                            item.severity === 'critical' && 'bg-red-500/20 text-red-300 border border-red-500/30',
                            item.severity === 'high' && 'bg-amber-500/20 text-amber-300 border border-amber-500/30',
                            item.severity === 'medium' && 'bg-sky-500/20 text-sky-300 border border-sky-500/30',
                            item.severity === 'low' && 'bg-slate-500/20 text-slate-300 border border-slate-500/30',
                          )}>
                            {item.severity}
                          </span>

                          {item.lifecycleStatus === 'acknowledged' && (
                            <span className="px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[10px] font-semibold">
                              Ele Alındı
                            </span>
                          )}

                          <span className="text-[10px] text-slate-500">
                            {formatTime(item.createdAt)}
                          </span>
                        </div>

                        <div>
                          <h3 className="text-sm font-bold text-white group-hover:text-sky-300 transition-colors">
                            {item.title}
                          </h3>
                          <p className="text-xs text-slate-300 mt-1 leading-relaxed max-w-3xl">
                            {item.message}
                          </p>
                        </div>
                      </div>

                      {/* Action Buttons */}
                      <div className="flex flex-wrap items-center gap-2 shrink-0 pt-2 md:pt-0 border-t md:border-t-0 border-slate-800">
                        <Link
                          href={item.suggestedAction.href}
                          className="px-3.5 py-1.5 rounded-xl bg-sky-500 hover:bg-sky-400 text-white text-xs font-semibold transition-all shadow-md shadow-sky-500/20 flex items-center gap-1.5"
                        >
                          <span>{item.suggestedAction.label}</span>
                          <ExternalLink className="w-3.5 h-3.5" />
                        </Link>

                        {item.lifecycleStatus !== 'acknowledged' && (
                          <button
                            onClick={() => smartAction.mutate({ id: item.id, action: 'acknowledge' })}
                            className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-emerald-500/20 text-slate-300 hover:text-emerald-400 border border-slate-700/80 transition-colors text-xs font-medium flex items-center gap-1"
                            title="Ele Al"
                          >
                            <Check className="w-3.5 h-3.5" />
                            <span>Ele Al</span>
                          </button>
                        )}

                        <button
                          onClick={() => snoozeTomorrow(item.id)}
                          className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-amber-500/20 text-slate-300 hover:text-amber-400 border border-slate-700/80 transition-colors text-xs font-medium flex items-center gap-1"
                          title="1 Gün Ertele"
                        >
                          <Clock3 className="w-3.5 h-3.5" />
                          <span>Ertele</span>
                        </button>

                        <button
                          onClick={() => smartAction.mutate({ id: item.id, action: 'complete' })}
                          className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-sky-500/20 text-slate-300 hover:text-sky-400 border border-slate-700/80 transition-colors text-xs font-medium flex items-center gap-1"
                          title="Tamamla"
                        >
                          <CheckCheck className="w-3.5 h-3.5" />
                          <span>Tamamla</span>
                        </button>

                        <button
                          onClick={() => smartAction.mutate({ id: item.id, action: 'hide' })}
                          className="p-1.5 rounded-xl bg-slate-800 hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 border border-slate-700/80 transition-colors"
                          title="Gizle"
                        >
                          <EyeOff className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* System Notifications List */}
        {filteredNotifications.length > 0 && (
          <div className="space-y-3">
            {typeFilter !== 'SYSTEM' && filteredSmartItems.length > 0 && (
              <div className="flex items-center gap-2 px-1 pt-2 text-slate-400 text-xs font-bold uppercase tracking-wider">
                <Bell className="w-4 h-4 text-sky-400" />
                <span>Sistem Bildirimleri ({filteredNotifications.length})</span>
              </div>
            )}

            <div className="rounded-2xl bg-slate-900/80 border border-slate-800 shadow-xl overflow-hidden divide-y divide-slate-800/60">
              {filteredNotifications.map((n) => {
                const isSelected = selectedIds.includes(n.id);

                return (
                  <div
                    key={n.id}
                    className={cn(
                      'p-4 transition-all flex items-start gap-4 group',
                      n.status === 'UNREAD' ? 'bg-sky-500/[0.04] hover:bg-sky-500/[0.08]' : 'hover:bg-slate-800/40',
                      isSelected && 'bg-sky-500/[0.1] border-l-4 border-sky-500',
                    )}
                  >
                    {/* Checkbox */}
                    <button
                      onClick={() => toggleSelect(n.id)}
                      className="mt-0.5 text-slate-500 hover:text-slate-300 transition-colors shrink-0"
                    >
                      {isSelected ? (
                        <CheckSquare className="w-4 h-4 text-sky-400" />
                      ) : (
                        <Square className="w-4 h-4 text-slate-700 group-hover:text-slate-500" />
                      )}
                    </button>

                    {/* Unread Indicator */}
                    <div className="mt-1.5 shrink-0">
                      {n.status === 'UNREAD' ? (
                        <div className="w-2.5 h-2.5 rounded-full bg-sky-400 shadow-lg shadow-sky-400/50 animate-pulse" />
                      ) : (
                        <div className="w-2.5 h-2.5 rounded-full bg-slate-700" />
                      )}
                    </div>

                    {/* Notification Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <h4 className={cn('text-sm font-semibold', n.status === 'UNREAD' ? 'text-white' : 'text-slate-300')}>
                            {n.title}
                          </h4>
                          {n.module && (
                            <span className="px-2 py-0.5 rounded-md bg-slate-800 border border-slate-700 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                              {n.module}
                            </span>
                          )}
                        </div>

                        <span className="text-[11px] text-slate-500 shrink-0">
                          {formatTime(n.createdAt)}
                        </span>
                      </div>

                      {n.message && (
                        <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                          {n.message}
                        </p>
                      )}
                    </div>

                    {/* Item Actions */}
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                      {n.status === 'UNREAD' && (
                        <button
                          onClick={() => markRead.mutate(n.id)}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-emerald-400 hover:bg-emerald-500/10 transition-colors"
                          title="Okundu İşaretle"
                        >
                          <Check className="w-4 h-4" />
                        </button>
                      )}
                      <button
                        onClick={() => archiveNotif.mutate(n.id)}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-amber-400 hover:bg-amber-500/10 transition-colors"
                        title="Arşivle"
                      >
                        <Archive className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => deleteNotif.mutate(n.id)}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
                        title="Sil"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Empty State */}
        {filteredSmartItems.length === 0 && filteredNotifications.length === 0 && (
          <div className="p-16 rounded-2xl bg-slate-900/60 border border-slate-800 text-center space-y-4">
            <div className="w-16 h-16 rounded-3xl bg-slate-800/80 border border-slate-700/60 flex items-center justify-center mx-auto text-slate-400 shadow-inner">
              <Inbox className="w-8 h-8" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">Bildirim bulunamadı</h3>
              <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                Seçili filtre parametrelerinize uygun bildirim veya akıllı uyarı kaydı bulunmuyor.
              </p>
            </div>
            {(statusFilter !== 'ALL' || typeFilter !== 'ALL' || searchQuery !== '') && (
              <button
                onClick={() => {
                  setStatusFilter('ALL');
                  setTypeFilter('ALL');
                  setSeverityFilter('ALL');
                  setSearchQuery('');
                }}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition-colors"
              >
                Filtreleri Sıfırla
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
