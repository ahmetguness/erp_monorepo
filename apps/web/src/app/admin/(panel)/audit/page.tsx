'use client';

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  FileText,
  Building2,
  Search,
  Filter,
  RefreshCw,
  Clock,
  ShieldCheck,
  User,
  Bot,
  AlertTriangle,
  PlusCircle,
  Trash2,
  CheckCircle2,
  XCircle,
  KeyRound,
  LogOut,
  Download,
  Activity,
  Layers,
  ChevronRight,
  Eye,
  FilterX,
  ExternalLink,
  Code,
  Sparkles,
} from 'lucide-react';
import { getAdminAuditLogs, getTenants } from '@/services/admin.service';
import type { AdminAuditLog } from '@repo/types';
import { Badge, type BadgeVariant } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Pagination } from '@/components/ui/Pagination';
import { cn } from '@/lib/utils';

const ACTION_MAP: Record<
  string,
  { label: string; variant: BadgeVariant; icon: typeof PlusCircle; badgeClass: string }
> = {
  CREATE: {
    label: 'Oluşturma',
    variant: 'success',
    icon: PlusCircle,
    badgeClass: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  },
  UPDATE: {
    label: 'Güncelleme',
    variant: 'info',
    icon: RefreshCw,
    badgeClass: 'bg-sky-500/10 text-sky-400 border-sky-500/20',
  },
  DELETE: {
    label: 'Silme',
    variant: 'danger',
    icon: Trash2,
    badgeClass: 'bg-rose-500/10 text-rose-400 border-rose-500/20',
  },
  APPROVE: {
    label: 'Onay',
    variant: 'success',
    icon: CheckCircle2,
    badgeClass: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  },
  REJECT: {
    label: 'Red',
    variant: 'warning',
    icon: XCircle,
    badgeClass: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  },
  LOGIN: {
    label: 'Giriş',
    variant: 'purple',
    icon: KeyRound,
    badgeClass: 'bg-indigo-500/10 text-indigo-300 border-indigo-500/20',
  },
  LOGOUT: {
    label: 'Çıkış',
    variant: 'neutral',
    icon: LogOut,
    badgeClass: 'bg-slate-800 text-slate-400 border-slate-700',
  },
  EXPORT: {
    label: 'Dışa Aktarma',
    variant: 'purple',
    icon: Download,
    badgeClass: 'bg-violet-500/10 text-violet-400 border-violet-500/20',
  },
  OTHER: {
    label: 'İşlem',
    variant: 'neutral',
    icon: Activity,
    badgeClass: 'bg-slate-800 text-slate-300 border-slate-700',
  },
};

const MODULE_OPTIONS = [
  'AUTH',
  'TENANT',
  'FEATURE',
  'OPERATIONS',
  'SECURITY',
  'BILLING',
  'WORKFLOW',
  'AUDIT',
  'INVOICE',
  'SETTINGS',
];

function formatDateTime(value: string | null): string {
  if (!value) return '—';
  try {
    const date = new Date(value);
    if (isNaN(date.getTime())) return '—';
    return date.toLocaleString('tr-TR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  } catch {
    return '—';
  }
}

export default function AdminAuditPage() {
  const [page, setPage] = useState(1);
  const [selectedTenantId, setSelectedTenantId] = useState('');
  const [actionFilter, setActionFilter] = useState('');
  const [moduleFilter, setModuleFilter] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedLog, setSelectedLog] = useState<AdminAuditLog | null>(null);

  // Fetch tenants for dropdown
  const { data: tenantsData } = useQuery({
    queryKey: ['admin', 'tenants-for-filter'],
    queryFn: () => getTenants({ page: 1, limit: 100 }),
  });
  const tenants = tenantsData?.data ?? [];

  // Fetch audit logs
  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ['admin', 'audit', page, selectedTenantId, actionFilter, moduleFilter],
    queryFn: () =>
      getAdminAuditLogs({
        page,
        limit: 25,
        tenantId: selectedTenantId || undefined,
        action: actionFilter || undefined,
        module: moduleFilter || undefined,
      }),
  });

  const selectedTenant = tenants.find((t) => t.id === selectedTenantId);
  const auditLogs = data?.data ?? [];
  const meta = data?.meta ?? { total: 0, totalPages: 1, page: 1, pageSize: 25 };

  // Client-side search filtering if search term entered
  const filteredLogs = useMemo(() => {
    if (!searchTerm.trim()) return auditLogs;
    const term = searchTerm.toLowerCase().trim();
    return auditLogs.filter((log) => {
      const tenant = tenants.find((t) => t.id === log.tenantId);
      return (
        log.module.toLowerCase().includes(term) ||
        log.entityType.toLowerCase().includes(term) ||
        log.entityId.toLowerCase().includes(term) ||
        (log.reason && log.reason.toLowerCase().includes(term)) ||
        (log.ticketId && log.ticketId.toLowerCase().includes(term)) ||
        (log.requestId && log.requestId.toLowerCase().includes(term)) ||
        (log.admin && log.admin.name.toLowerCase().includes(term)) ||
        (log.admin && log.admin.email.toLowerCase().includes(term)) ||
        (tenant && tenant.companyName.toLowerCase().includes(term))
      );
    });
  }, [auditLogs, searchTerm, tenants]);

  // Key Metrics
  const metrics = useMemo(() => {
    const total = meta.total;
    const adminActions = auditLogs.filter((l) => Boolean(l.admin)).length;
    const criticalActions = auditLogs.filter(
      (l) => l.action === 'DELETE' || l.action === 'APPROVE' || l.action === 'REJECT',
    ).length;

    return {
      total,
      adminActions,
      criticalActions,
    };
  }, [meta.total, auditLogs]);

  const hasActiveFilters =
    Boolean(selectedTenantId) ||
    Boolean(actionFilter) ||
    Boolean(moduleFilter) ||
    Boolean(searchTerm);

  const resetFilters = () => {
    setSelectedTenantId('');
    setActionFilter('');
    setModuleFilter('');
    setSearchTerm('');
    setPage(1);
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-red-500/20 to-rose-600/20 text-rose-400 ring-1 ring-rose-500/30">
            <FileText className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-white sm:text-2xl">
              Platform Denetim & İşlem Kayıtları
            </h1>
            <p className="text-xs text-slate-400">
              Tenantlar, yöneticiler ve sistem süreçleri tarafından gerçekleştirilen tüm hassas eylemlerin güvenli denetim kayıtları.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <Button
            variant="outline"
            size="md"
            onClick={() => refetch()}
            loading={isFetching}
            leftIcon={<RefreshCw className={cn('h-4 w-4', isFetching && 'animate-spin')} />}
          >
            Yenile
          </Button>
        </div>
      </div>

      {/* KPI Metrics Strip */}
      <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
        {/* Metric 1: Total Logs */}
        <div className="rounded-2xl border border-slate-800/80 bg-slate-900/50 p-4 shadow-sm backdrop-blur">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400">Toplam Denetim Kaydı</span>
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-sky-500/10 text-sky-400">
              <FileText className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2 text-2xl font-bold text-white tracking-tight">
            {meta.total.toLocaleString('tr-TR')}
          </div>
          <div className="mt-1 text-[11px] text-slate-400">
            Değiştirilemez ve sınırsız saklanan audit izleri
          </div>
        </div>

        {/* Metric 2: Admin Actions */}
        <div className="rounded-2xl border border-slate-800/80 bg-slate-900/50 p-4 shadow-sm backdrop-blur">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400">Yönetici İşlemleri</span>
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-400">
              <ShieldCheck className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2 text-2xl font-bold text-white tracking-tight">
            {metrics.adminActions} <span className="text-xs font-normal text-slate-400">Sayfadaki</span>
          </div>
          <div className="mt-1 text-[11px] text-emerald-400 font-medium">
            Platform idarecileri tarafından tetiklenen eylemler
          </div>
        </div>

        {/* Metric 3: Critical Governance Actions */}
        <div className="rounded-2xl border border-slate-800/80 bg-slate-900/50 p-4 shadow-sm backdrop-blur">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400">Kritik & Onay İşlemleri</span>
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-500/10 text-amber-400">
              <AlertTriangle className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2 text-2xl font-bold text-white tracking-tight">
            {metrics.criticalActions}
          </div>
          <div className="mt-1 text-[11px] text-slate-400">
            Silme, onay ve red kararları
          </div>
        </div>

        {/* Metric 4: Active Filter Scope */}
        <div className="rounded-2xl border border-slate-800/80 bg-slate-900/50 p-4 shadow-sm backdrop-blur">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400">Filtre Kapsamı</span>
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-violet-500/10 text-violet-400">
              <Layers className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2 truncate text-sm font-semibold text-white">
            {selectedTenant ? selectedTenant.companyName : 'Tüm Tenantlar'}
          </div>
          <div className="mt-1 text-[11px] text-slate-400">
            {actionFilter ? `İşlem: ${ACTION_MAP[actionFilter]?.label || actionFilter}` : 'Tüm Eylemler'}
          </div>
        </div>
      </div>

      {/* Filters Toolbar */}
      <div className="rounded-2xl border border-slate-800/80 bg-slate-900/60 p-4 backdrop-blur space-y-3">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          {/* Free Text Search */}
          <div className="relative flex-1">
            <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-slate-500">
              <Search className="h-4 w-4" />
            </div>
            <input
              type="text"
              placeholder="Varlık ID, modül, aktör, gerekçe veya bilet no ile ara…"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full rounded-xl border border-slate-800 bg-slate-950/70 py-2 pl-9 pr-8 text-sm text-slate-100 placeholder-slate-500 transition-colors focus:border-rose-500 focus:bg-slate-950 focus:outline-none focus:ring-1 focus:ring-rose-500"
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm('')}
                className="absolute inset-y-0 right-0 flex items-center pr-3 text-slate-500 hover:text-slate-300"
              >
                <FilterX className="h-4 w-4" />
              </button>
            )}
          </div>

          {/* Dropdown Selectors */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Tenant Selector */}
            <div className="flex items-center gap-2 rounded-xl border border-slate-800 bg-slate-950/80 px-2.5 py-1.5">
              <Building2 className="h-3.5 w-3.5 text-slate-500 shrink-0" />
              <select
                value={selectedTenantId}
                onChange={(e) => {
                  setSelectedTenantId(e.target.value);
                  setPage(1);
                }}
                className="bg-transparent text-xs text-slate-200 focus:outline-none max-w-[180px]"
              >
                <option value="">Tüm Tenantlar</option>
                {tenants.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.companyName} ({t.slug})
                  </option>
                ))}
              </select>
            </div>

            {/* Module Filter */}
            <div className="flex items-center gap-2 rounded-xl border border-slate-800 bg-slate-950/80 px-2.5 py-1.5">
              <Layers className="h-3.5 w-3.5 text-slate-500 shrink-0" />
              <select
                value={moduleFilter}
                onChange={(e) => {
                  setModuleFilter(e.target.value);
                  setPage(1);
                }}
                className="bg-transparent text-xs text-slate-200 focus:outline-none"
              >
                <option value="">Tüm Modüller</option>
                {MODULE_OPTIONS.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </div>

            {/* Action Filter */}
            <div className="flex items-center gap-2 rounded-xl border border-slate-800 bg-slate-950/80 px-2.5 py-1.5">
              <Filter className="h-3.5 w-3.5 text-slate-500 shrink-0" />
              <select
                value={actionFilter}
                onChange={(e) => {
                  setActionFilter(e.target.value);
                  setPage(1);
                }}
                className="bg-transparent text-xs text-slate-200 focus:outline-none"
              >
                <option value="">Tüm İşlemler</option>
                {Object.entries(ACTION_MAP).map(([key, { label }]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </select>
            </div>

            {hasActiveFilters && (
              <Button
                variant="ghost"
                size="sm"
                onClick={resetFilters}
                leftIcon={<FilterX className="h-3.5 w-3.5" />}
                className="text-xs text-slate-400 hover:text-slate-200"
              >
                Temizle
              </Button>
            )}
          </div>
        </div>

        {/* Active Filters Tag Bar */}
        {hasActiveFilters && (
          <div className="flex flex-wrap items-center gap-2 border-t border-slate-800/80 pt-2.5 text-xs">
            <span className="text-slate-500">Aktif Filtreler:</span>
            {selectedTenant && (
              <span className="inline-flex items-center gap-1.5 rounded-lg border border-sky-500/30 bg-sky-500/10 px-2.5 py-1 text-sky-300">
                <Building2 className="h-3 w-3" />
                <span>{selectedTenant.companyName}</span>
                <button
                  type="button"
                  onClick={() => setSelectedTenantId('')}
                  className="hover:text-white"
                >
                  ✕
                </button>
              </span>
            )}
            {moduleFilter && (
              <span className="inline-flex items-center gap-1.5 rounded-lg border border-violet-500/30 bg-violet-500/10 px-2.5 py-1 text-violet-300">
                <Layers className="h-3 w-3" />
                <span>Modül: {moduleFilter}</span>
                <button
                  type="button"
                  onClick={() => setModuleFilter('')}
                  className="hover:text-white"
                >
                  ✕
                </button>
              </span>
            )}
            {actionFilter && (
              <span className="inline-flex items-center gap-1.5 rounded-lg border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-amber-300">
                <Activity className="h-3 w-3" />
                <span>İşlem: {ACTION_MAP[actionFilter]?.label || actionFilter}</span>
                <button
                  type="button"
                  onClick={() => setActionFilter('')}
                  className="hover:text-white"
                >
                  ✕
                </button>
              </span>
            )}
          </div>
        )}
      </div>

      {/* Audit Logs Table / Grid View */}
      <div className="overflow-hidden rounded-2xl border border-slate-800/80 bg-slate-900/50 shadow-sm backdrop-blur">
        {/* Table Header */}
        <div className="grid grid-cols-12 gap-3 border-b border-slate-800/80 bg-slate-950/60 px-5 py-3 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
          <div className="col-span-3 sm:col-span-2">Zaman Damgası</div>
          <div className="col-span-2 sm:col-span-2">İşlem & Modül</div>
          <div className="col-span-3 sm:col-span-2">Hedef Varlık</div>
          <div className="col-span-2 sm:col-span-3">Tenant</div>
          <div className="col-span-2 sm:col-span-2">Aktör (Yapan)</div>
          <div className="col-span-0 sm:col-span-1 text-right">Detay</div>
        </div>

        {/* Loading State */}
        {isLoading && (
          <div className="divide-y divide-slate-800/40 p-2">
            {[1, 2, 3, 4, 5].map((n) => (
              <div key={n} className="animate-pulse grid grid-cols-12 gap-3 p-4">
                <div className="col-span-2 h-4 rounded bg-slate-800" />
                <div className="col-span-2 h-4 rounded bg-slate-800/70" />
                <div className="col-span-2 h-4 rounded bg-slate-800/60" />
                <div className="col-span-3 h-4 rounded bg-slate-800/50" />
                <div className="col-span-2 h-4 rounded bg-slate-800/60" />
                <div className="col-span-1 h-4 rounded bg-slate-800/40" />
              </div>
            ))}
          </div>
        )}

        {/* Empty State */}
        {!isLoading && filteredLogs.length === 0 && (
          <div className="flex flex-col items-center justify-center p-16 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-800/70 text-slate-400">
              <FileText className="h-6 w-6" />
            </div>
            <h3 className="mt-4 text-base font-semibold text-slate-200">
              Denetim kaydı bulunamadı
            </h3>
            <p className="mt-1 text-xs text-slate-400 max-w-sm">
              {hasActiveFilters
                ? 'Arama kriterlerinizi veya filtrelerinizi sıfırlayarak tüm kayıtları görüntüleyebilirsiniz.'
                : 'Sistemde henüz kaydedilmiş bir denetim kaydı bulunmuyor.'}
            </p>
            {hasActiveFilters && (
              <Button
                variant="outline"
                size="sm"
                onClick={resetFilters}
                className="mt-4 text-xs"
                leftIcon={<FilterX className="h-3.5 w-3.5" />}
              >
                Filtreleri Temizle
              </Button>
            )}
          </div>
        )}

        {/* Audit Log Rows */}
        {!isLoading && (
          <div className="divide-y divide-slate-800/50">
            {filteredLogs.map((log) => {
              const actionMeta = ACTION_MAP[String(log.action)] ?? ACTION_MAP.OTHER;
              const ActionIcon = actionMeta.icon;
              const tenant = tenants.find((t) => t.id === String(log.tenantId));

              return (
                <div
                  key={String(log.id)}
                  onClick={() => setSelectedLog(log)}
                  className="group grid grid-cols-12 gap-3 items-center px-5 py-3.5 text-xs transition-colors hover:bg-slate-800/40 cursor-pointer"
                >
                  {/* Timestamp */}
                  <div className="col-span-3 sm:col-span-2 text-slate-300 font-mono text-[11px]">
                    <div className="flex items-center gap-1.5">
                      <Clock className="h-3 w-3 text-slate-500 shrink-0" />
                      <span>{formatDateTime(String(log.createdAt))}</span>
                    </div>
                  </div>

                  {/* Action & Module */}
                  <div className="col-span-2 sm:col-span-2 space-y-1">
                    <span
                      className={cn(
                        'inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-semibold border',
                        actionMeta.badgeClass,
                      )}
                    >
                      <ActionIcon className="h-3 w-3" />
                      <span>{actionMeta.label}</span>
                    </span>
                    <p className="text-[11px] text-slate-400 font-medium truncate">{log.module}</p>
                  </div>

                  {/* Entity */}
                  <div className="col-span-3 sm:col-span-2 min-w-0">
                    <span className="block font-mono text-xs font-semibold text-slate-200 truncate">
                      {log.entityType}
                    </span>
                    <span className="block truncate font-mono text-[10px] text-slate-500" title={log.entityId}>
                      {log.entityId}
                    </span>
                  </div>

                  {/* Tenant */}
                  <div className="col-span-2 sm:col-span-3 min-w-0">
                    {tenant ? (
                      <div>
                        <p className="font-semibold text-slate-200 text-xs truncate">
                          {tenant.companyName}
                        </p>
                        <p className="font-mono text-[10px] text-slate-500 truncate">{tenant.slug}</p>
                      </div>
                    ) : (
                      <span className="font-mono text-[11px] text-slate-500 truncate block">
                        {String(log.tenantId).slice(0, 16)}…
                      </span>
                    )}
                  </div>

                  {/* Actor */}
                  <div className="col-span-2 sm:col-span-2 min-w-0">
                    {log.admin ? (
                      <div className="flex items-center gap-2">
                        <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-rose-500/20 text-[10px] font-bold text-rose-300 border border-rose-500/30">
                          {log.admin.name.charAt(0)}
                        </div>
                        <div className="min-w-0">
                          <p className="truncate font-semibold text-slate-200 text-xs">
                            {log.admin.name}
                          </p>
                          <p className="truncate text-[10px] text-slate-500">Admin</p>
                        </div>
                      </div>
                    ) : log.userId ? (
                      <div className="flex items-center gap-1.5 text-slate-400 text-[11px]">
                        <User className="h-3 w-3 text-slate-500 shrink-0" />
                        <span className="font-mono truncate">{log.userId.slice(0, 10)}…</span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5 text-slate-500 text-[11px]">
                        <Bot className="h-3 w-3 text-slate-600 shrink-0" />
                        <span>Sistem</span>
                      </div>
                    )}
                  </div>

                  {/* Detail Arrow */}
                  <div className="col-span-0 sm:col-span-1 text-right">
                    <button
                      type="button"
                      aria-label="Detayları İncele"
                      className="p-1.5 rounded-lg text-slate-500 group-hover:text-slate-200 group-hover:bg-slate-800 transition-colors"
                    >
                      <ChevronRight className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Pagination */}
      {meta.totalPages > 1 && (
        <div className="rounded-2xl border border-slate-800/80 bg-slate-900/50 p-4">
          <Pagination
            page={page}
            pageSize={meta.pageSize}
            total={meta.total}
            totalPages={meta.totalPages}
            onChange={(newPage) => setPage(newPage)}
          />
        </div>
      )}

      {/* Audit Detail Modal */}
      {selectedLog && (
        <Modal
          isOpen={true}
          onClose={() => setSelectedLog(null)}
          title="Denetim Kaydı Detayı"
          description={`ID: ${selectedLog.id}`}
          size="lg"
          footer={
            <Button variant="secondary" onClick={() => setSelectedLog(null)}>
              Kapat
            </Button>
          }
        >
          <div className="space-y-4">
            {/* Summary Banner */}
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-800 bg-slate-900/80 p-4">
              <div className="flex items-center gap-2.5">
                <span
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-semibold border',
                    ACTION_MAP[selectedLog.action]?.badgeClass || 'bg-slate-800 text-slate-300',
                  )}
                >
                  <span>{ACTION_MAP[selectedLog.action]?.label || selectedLog.action}</span>
                </span>
                <span className="font-semibold text-slate-200 text-sm">
                  {selectedLog.module} / {selectedLog.entityType}
                </span>
              </div>
              <span className="text-xs text-slate-400 font-mono">
                {formatDateTime(selectedLog.createdAt)}
              </span>
            </div>

            {/* Grid of details */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 text-xs">
              <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
                <span className="text-slate-500 font-medium block">Hedef Varlık ID (Entity ID)</span>
                <span className="font-mono text-slate-200 font-semibold mt-1 block select-all">
                  {selectedLog.entityId}
                </span>
              </div>

              <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
                <span className="text-slate-500 font-medium block">Tenant ID</span>
                <span className="font-mono text-slate-200 font-semibold mt-1 block select-all">
                  {selectedLog.tenantId}
                </span>
              </div>

              {selectedLog.admin && (
                <div className="col-span-2 rounded-xl border border-slate-800 bg-slate-950/60 p-3">
                  <span className="text-slate-500 font-medium block">Yetkili Yönetici (Admin)</span>
                  <div className="mt-1 flex items-center justify-between">
                    <span className="font-semibold text-slate-200">{selectedLog.admin.name}</span>
                    <span className="text-slate-400 font-mono">{selectedLog.admin.email}</span>
                  </div>
                </div>
              )}

              {selectedLog.reason && (
                <div className="col-span-2 rounded-xl border border-sky-500/20 bg-sky-500/5 p-3.5 text-xs">
                  <span className="font-semibold text-sky-300 block mb-1">Gerekçe / Açıklama:</span>
                  <p className="text-slate-200 leading-relaxed">{selectedLog.reason}</p>
                </div>
              )}

              {selectedLog.ticketId && (
                <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
                  <span className="text-slate-500 font-medium block">Ticket / Bilet No</span>
                  <span className="font-mono text-amber-400 font-semibold mt-1 block">
                    {selectedLog.ticketId}
                  </span>
                </div>
              )}

              {selectedLog.requestId && (
                <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
                  <span className="text-slate-500 font-medium block">Request / Correlation ID</span>
                  <span className="font-mono text-slate-300 text-[11px] mt-1 block select-all">
                    {selectedLog.requestId}
                  </span>
                </div>
              )}

              {selectedLog.approvalId && (
                <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
                  <span className="text-slate-500 font-medium block">Onay Kaydı (Approval ID)</span>
                  <span className="font-mono text-emerald-400 font-semibold mt-1 block select-all">
                    {selectedLog.approvalId}
                  </span>
                </div>
              )}

              {selectedLog.rollbackOfId && (
                <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
                  <span className="text-slate-500 font-medium block">Geri Alma Kaydı (Rollback Of)</span>
                  <span className="font-mono text-rose-400 font-semibold mt-1 block select-all">
                    {selectedLog.rollbackOfId}
                  </span>
                </div>
              )}
            </div>

            {/* Raw JSON viewer */}
            <div className="rounded-xl border border-slate-800 bg-slate-950 p-3.5 space-y-2">
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span className="flex items-center gap-1.5 font-semibold text-slate-300">
                  <Code className="h-3.5 w-3.5 text-sky-400" />
                  <span>Ham JSON Verisi</span>
                </span>
              </div>
              <pre className="overflow-x-auto rounded-lg bg-slate-900 p-3 font-mono text-[11px] text-slate-300 max-h-48">
                {JSON.stringify(selectedLog, null, 2)}
              </pre>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
