'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import {
  LifeBuoy,
  Search,
  MessageSquare,
  Clock,
  AlertTriangle,
  User,
  Building2,
  FolderOpen,
  RefreshCw,
  X,
  ExternalLink,
  ShieldCheck,
  ChevronRight,
  Filter,
} from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { AdminPageHeader, AdminKpiCard, AdminKpiGrid } from '@/components/features/admin/ui';
import { listAdminTickets } from '@/services/support-ticket.service';
import type { PlatformSupportTicketSummaryDto } from '@repo/types';
import { formatDateTime } from '@/lib/utils';
import {
  CATEGORY_LABELS,
  STATUS_CONFIG,
  PRIORITY_CONFIG,
  formatRelativeTime,
} from '@/components/features/support-tickets/ticket-ui';

export function AdminTicketListPage() {
  const [search, setSearch] = useState('');
  const [selectedStatus, setSelectedStatus] = useState<string>('ALL');
  const [selectedPriority, setSelectedPriority] = useState<string>('ALL');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');

  const { data: tickets = [], isLoading, isFetching, refetch } = useQuery({
    queryKey: ['admin-tickets', selectedStatus, selectedPriority, selectedCategory, search],
    queryFn: () =>
      listAdminTickets({
        status: selectedStatus === 'ALL' ? undefined : selectedStatus,
        priority: selectedPriority === 'ALL' ? undefined : selectedPriority,
        category: selectedCategory === 'ALL' ? undefined : selectedCategory,
        search: search.trim() || undefined,
      }),
    refetchInterval: 15000,
  });

  const stats = {
    total: tickets.length,
    open: tickets.filter((t) => t.status === 'OPEN').length,
    inProgress: tickets.filter((t) => t.status === 'IN_PROGRESS').length,
    waitingTenant: tickets.filter((t) => t.status === 'WAITING_TENANT').length,
    urgentOrHigh: tickets.filter(
      (t) => (t.priority === 'HIGH' || t.priority === 'URGENT') && t.status !== 'CLOSED' && t.status !== 'RESOLVED'
    ).length,
  };

  const isFiltered = search || selectedStatus !== 'ALL' || selectedPriority !== 'ALL' || selectedCategory !== 'ALL';

  return (
    <div className="space-y-4 pb-10">
      {/* Header */}
      <AdminPageHeader
        title="Destek Biletleri Masası"
        description="Tüm tenant işletmelerinden gelen teknik, operasyonel ve fatura taleplerini merkezi kuyruktan yönetin."
        icon={LifeBuoy}
        iconTone="sky"
        badge={
          stats.open > 0 ? (
            <span className="rounded-full bg-sky-500/20 px-2 py-0.5 text-[10px] font-bold text-sky-300 ring-1 ring-sky-500/30">
              {stats.open} Açık Talep
            </span>
          ) : undefined
        }
        actions={
          <Button
            variant="outline"
            size="sm"
            onClick={() => void refetch()}
            disabled={isLoading || isFetching}
            leftIcon={<RefreshCw className={`h-3.5 w-3.5 ${isFetching ? 'animate-spin text-sky-400' : ''}`} />}
          >
            Yenile
          </Button>
        }
      />

      {/* KPI Cards */}
      <AdminKpiGrid columns={4}>
        <AdminKpiCard
          label="Kuyruktaki Toplam"
          value={stats.total}
          icon={FolderOpen}
          iconTone="slate"
          subtext="Tüm destek talepleri"
        />

        <AdminKpiCard
          label="Açık / Yeni Bilet"
          value={stats.open}
          icon={Clock}
          iconTone="sky"
          subtext={<span className="text-sky-400">Müdahale sırasını bekliyor</span>}
        />

        <AdminKpiCard
          label="Müşteri Bekleniyor"
          value={stats.waitingTenant}
          icon={MessageSquare}
          iconTone="amber"
          subtext="Tenant kullanıcısından dönüş bekleniyor"
        />

        <AdminKpiCard
          label="Kritik / Acil Talepler"
          value={stats.urgentOrHigh}
          icon={AlertTriangle}
          iconTone="red"
          subtext={<span className={stats.urgentOrHigh > 0 ? 'text-rose-400 font-semibold' : 'text-slate-400'}>Yüksek öncelikli aktif bilet</span>}
        />
      </AdminKpiGrid>

      {/* Filters Bar */}
      <div className="flex flex-col gap-3 rounded-2xl border border-slate-800 bg-slate-900/70 p-3.5 backdrop-blur-sm sm:flex-row sm:items-center sm:justify-between">
        {/* Status Tab Pills */}
        <div className="flex flex-wrap gap-1.5">
          {[
            { key: 'ALL', label: 'Tümü' },
            { key: 'OPEN', label: 'Açık' },
            { key: 'IN_PROGRESS', label: 'İşlemde' },
            { key: 'WAITING_TENANT', label: 'Müşteri Bekleniyor' },
            { key: 'RESOLVED', label: 'Çözüldü' },
            { key: 'CLOSED', label: 'Kapatıldı' },
          ].map((tab) => (
            <button
              key={tab.key}
              onClick={() => setSelectedStatus(tab.key)}
              className={`rounded-xl px-3 py-1.5 text-xs font-medium transition-all ${
                selectedStatus === tab.key
                  ? 'bg-sky-600 text-white shadow-md shadow-sky-600/30'
                  : 'text-slate-400 hover:bg-slate-800/80 hover:text-slate-200'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Dropdowns and Search */}
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={selectedPriority}
            onChange={(e) => setSelectedPriority(e.target.value)}
            className="rounded-xl border border-slate-700/80 bg-slate-800/90 px-2.5 py-1.5 text-xs text-slate-300 outline-none focus:border-sky-500"
          >
            <option value="ALL">Tüm Öncelikler</option>
            <option value="URGENT">Acil</option>
            <option value="HIGH">Yüksek</option>
            <option value="MEDIUM">Orta</option>
            <option value="LOW">Düşük</option>
          </select>

          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="rounded-xl border border-slate-700/80 bg-slate-800/90 px-2.5 py-1.5 text-xs text-slate-300 outline-none focus:border-sky-500"
          >
            <option value="ALL">Tüm Kategoriler</option>
            <option value="TECHNICAL">Teknik</option>
            <option value="BILLING">Fatura & Plan</option>
            <option value="ACCOUNT">Hesap & Giriş</option>
            <option value="FEATURE_REQUEST">Özellik</option>
            <option value="OTHER">Diğer</option>
          </select>

          <div className="relative w-full sm:w-56">
            <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" />
            <input
              type="text"
              placeholder="Bilet, işletme, konu..."
              className="w-full rounded-xl border border-slate-700/80 bg-slate-800/90 py-1.5 pl-8 pr-8 text-xs text-slate-200 placeholder-slate-500 outline-none focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          {isFiltered && (
            <button
              onClick={() => {
                setSearch('');
                setSelectedStatus('ALL');
                setSelectedPriority('ALL');
                setSelectedCategory('ALL');
              }}
              className="text-xs text-slate-400 hover:text-rose-400 transition-colors px-1"
            >
              Temizle
            </button>
          )}
        </div>
      </div>

      {/* Tickets Table / List */}
      <div className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/50 shadow-sm backdrop-blur-sm">
        <table className="w-full text-left text-xs">
          <thead className="border-b border-slate-800 bg-slate-950/80 text-slate-400 font-semibold">
            <tr>
              <th className="p-3.5 pl-4">Bilet No</th>
              <th className="p-3.5">İşletme (Tenant)</th>
              <th className="p-3.5">Konu</th>
              <th className="p-3.5">Kategori</th>
              <th className="p-3.5">Öncelik</th>
              <th className="p-3.5">Durum</th>
              <th className="p-3.5">Atanan Uzman</th>
              <th className="p-3.5">Son İşlem</th>
              <th className="p-3.5 pr-4 text-right">Aksiyon</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60">
            {isLoading && (
              <tr>
                <td colSpan={9} className="p-12 text-center text-slate-400">
                  <div className="flex flex-col items-center justify-center">
                    <div className="h-7 w-7 animate-spin rounded-full border-2 border-sky-500 border-t-transparent mb-2" />
                    <span>Destek biletleri yükleniyor...</span>
                  </div>
                </td>
              </tr>
            )}

            {!isLoading && tickets.length === 0 && (
              <tr>
                <td colSpan={9} className="p-12 text-center">
                  <LifeBuoy className="mx-auto h-8 w-8 text-slate-600 mb-2" />
                  <p className="text-sm font-semibold text-slate-300">Kriterlere uygun bilet bulunamadı</p>
                  <p className="mt-1 text-xs text-slate-500">
                    Filtreleri gevşeterek veya arama terimini temizleyerek tekrar deneyin.
                  </p>
                </td>
              </tr>
            )}

            {!isLoading &&
              tickets.map((ticket) => {
                const statusConfig = STATUS_CONFIG[ticket.status] || {
                  label: ticket.status,
                  variant: 'neutral',
                  dotClass: 'bg-slate-400',
                  badgeClass: 'border-slate-700 bg-slate-800 text-slate-300',
                  description: '',
                };

                const priorityConfig = PRIORITY_CONFIG[ticket.priority] || {
                  label: ticket.priority,
                  variant: 'neutral',
                  borderColor: 'border-slate-700',
                  textColor: 'text-slate-400',
                  dotColor: 'bg-slate-400',
                  bgSoft: 'bg-slate-800/40',
                };

                const isWaitingTenant = ticket.status === 'WAITING_TENANT';
                const isUrgent = ticket.priority === 'URGENT';

                return (
                  <tr
                    key={ticket.id}
                    className={`hover:bg-slate-800/40 transition-colors group ${
                      isUrgent && ticket.status !== 'CLOSED' ? 'bg-rose-950/10' : ''
                    }`}
                  >
                    <td className="p-3.5 pl-4 font-mono font-bold text-sky-400">
                      <Link
                        href={`/admin/tickets/${ticket.id}`}
                        className="hover:underline flex items-center gap-1.5"
                      >
                        {ticket.ticketNumber}
                      </Link>
                    </td>

                    <td className="p-3.5">
                      <div className="flex items-center gap-2">
                        <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-slate-800 text-slate-400 border border-slate-700/60">
                          <Building2 className="h-3.5 w-3.5" />
                        </div>
                        <div>
                          <span className="font-semibold text-slate-200 block truncate max-w-[150px]">
                            {ticket.tenantName || 'Tenant'}
                          </span>
                          {ticket.tenantSlug && (
                            <span className="text-[10px] text-slate-500 font-mono">
                              /{ticket.tenantSlug}
                            </span>
                          )}
                        </div>
                      </div>
                    </td>

                    <td className="p-3.5">
                      <Link
                        href={`/admin/tickets/${ticket.id}`}
                        className="font-medium text-slate-100 hover:text-sky-300 block max-w-xs truncate"
                      >
                        {ticket.title}
                      </Link>
                      <span className="text-[11px] text-slate-500 flex items-center gap-1 mt-0.5">
                        <User className="h-3 w-3" />
                        {ticket.createdByUser?.name || '-'}
                      </span>
                    </td>

                    <td className="p-3.5 text-slate-300">
                      <span className="inline-block rounded-md bg-slate-800/60 px-2 py-0.5 text-[11px] border border-slate-700/50">
                        {CATEGORY_LABELS[ticket.category] || ticket.category}
                      </span>
                    </td>

                    <td className="p-3.5">
                      <Badge variant={priorityConfig.variant}>{priorityConfig.label}</Badge>
                    </td>

                    <td className="p-3.5">
                      <span
                        className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium border ${statusConfig.badgeClass}`}
                      >
                        <span className={`h-1.5 w-1.5 rounded-full ${statusConfig.dotClass}`} />
                        {statusConfig.label}
                      </span>
                    </td>

                    <td className="p-3.5">
                      {ticket.assignedAdmin ? (
                        <span className="inline-flex items-center gap-1 text-sky-300 font-semibold bg-sky-950/30 px-2 py-0.5 rounded border border-sky-800/40">
                          <ShieldCheck className="h-3 w-3 text-sky-400" />
                          {ticket.assignedAdmin.name}
                        </span>
                      ) : (
                        <span className="text-slate-500 italic text-[11px]">Atanmadı</span>
                      )}
                    </td>

                    <td className="p-3.5 text-slate-400 text-[11px] whitespace-nowrap" title={ticket.updatedAt}>
                      {formatRelativeTime(ticket.updatedAt)}
                    </td>

                    <td className="p-3.5 pr-4 text-right">
                      <Link href={`/admin/tickets/${ticket.id}`}>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs hover:border-sky-500/50 hover:text-sky-300"
                        >
                          İncele
                          <ChevronRight className="h-3.5 w-3.5 ml-1" />
                        </Button>
                      </Link>
                    </td>
                  </tr>
                );
              })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
