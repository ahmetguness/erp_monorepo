'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Check,
  ShieldAlert,
  X,
  UserCheck,
  Clock,
  Building2,
  Users,
  Search,
  FilterX,
  RefreshCw,
  ArrowRight,
  RotateCcw,
  CheckCircle2,
  XCircle,
  FileCode,
  Tag,
  AlertTriangle,
} from 'lucide-react';
import type { AdminChangeRequest, AdminChangeRequestType, AdminChangeRequestStatus } from '@repo/types';
import {
  approveAdminChangeRequest,
  getAdminChangeRequests,
  rejectAdminChangeRequest,
  rollbackAdminChangeRequest,
} from '@/services/admin.service';
import { useAdminAuthStore } from '@/store/admin-auth.store';
import { canAdmin } from '@/lib/admin/permissions';
import { toast } from '@/store/ui.store';
import { toastAdminError } from '@/lib/admin/errors';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { cn } from '@/lib/utils';

const TYPE_LABELS: Record<AdminChangeRequestType, { label: string; tone: string }> = {
  TENANT_PLAN_UPDATE: {
    label: 'Enterprise Plan Değişikliği',
    tone: 'text-amber-400 bg-amber-500/10 border-amber-500/30',
  },
  TENANT_STATUS_UPDATE: {
    label: 'Kritik Tenant Durum Değişikliği',
    tone: 'text-rose-400 bg-rose-500/10 border-rose-500/30',
  },
  PLAN_FEATURE_UPDATE: {
    label: 'Plan Özelliği Değişikliği',
    tone: 'text-sky-400 bg-sky-500/10 border-sky-500/30',
  },
  FEATURE_OVERRIDE_UPSERT: {
    label: 'Kalıcı Özellik Override Tanımı',
    tone: 'text-violet-400 bg-violet-500/10 border-violet-500/30',
  },
  FEATURE_OVERRIDE_DELETE: {
    label: 'Kalıcı Özellik Override Kaldırma',
    tone: 'text-rose-400 bg-rose-500/10 border-rose-500/30',
  },
  FEATURE_ROLLOUT_ACTIVATE: {
    label: 'Feature Rollout Aktivasyonu',
    tone: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30',
  },
};

const STATUS_CONFIG: Record<
  AdminChangeRequestStatus,
  { label: string; badge: string; icon: typeof Clock }
> = {
  DRAFT: {
    label: 'Taslak',
    badge: 'border-slate-700 bg-slate-800 text-slate-300',
    icon: Clock,
  },
  PENDING: {
    label: 'Onay Bekliyor',
    badge: 'border-amber-500/30 bg-amber-500/10 text-amber-300',
    icon: Clock,
  },
  APPROVED: {
    label: 'Onaylandı',
    badge: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400',
    icon: CheckCircle2,
  },
  APPLIED: {
    label: 'Uygulandı',
    badge: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400',
    icon: CheckCircle2,
  },
  REJECTED: {
    label: 'Reddedildi',
    badge: 'border-rose-500/30 bg-rose-500/10 text-rose-400',
    icon: XCircle,
  },
  ROLLED_BACK: {
    label: 'Geri Alındı',
    badge: 'border-violet-500/30 bg-violet-500/10 text-violet-400',
    icon: RotateCcw,
  },
};

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
    });
  } catch {
    return '—';
  }
}

function ChangeRequestCard({
  request,
  onActionSuccess,
}: {
  request: AdminChangeRequest;
  onActionSuccess: () => void;
}) {
  const admin = useAdminAuthStore((state) => state.admin);
  const isMaker = admin?.id === request.requestedBy.id;
  const canApprove = !isMaker && canAdmin(admin, request.requiredPermission);
  const canReject = canApprove && canAdmin(admin, 'change-request.reject');
  const canRollback = request.canRollback && canAdmin(admin, request.requiredPermission);

  const [isRejectModalOpen, setIsRejectModalOpen] = useState(false);
  const [isApproveModalOpen, setIsApproveModalOpen] = useState(false);
  const [decisionNote, setDecisionNote] = useState('');

  const decide = useMutation({
    mutationFn: ({
      action,
      note,
    }: {
      action: 'approve' | 'reject' | 'rollback';
      note?: string;
    }) => {
      if (action === 'approve') return approveAdminChangeRequest(request.id, note);
      if (action === 'reject') return rejectAdminChangeRequest(request.id, note);
      return rollbackAdminChangeRequest(
        request.id,
        note || `Geri alma: ${request.reason}`,
        request.ticketId ?? undefined,
      );
    },
    onSuccess: async (_, variables) => {
      setIsApproveModalOpen(false);
      setIsRejectModalOpen(false);
      setDecisionNote('');
      toast.success(
        variables.action === 'approve'
          ? 'Değişiklik talebi onaylandı ve sisteme uygulandı.'
          : variables.action === 'reject'
            ? 'Değişiklik talebi reddedildi.'
            : 'Değişiklik başarıyla geri alındı.',
      );
      onActionSuccess();
    },
    onError: (err: unknown) => {
      toastAdminError(err, 'İşlem gerçekleştirilemedi. Lütfen tekrar deneyin.');
    },
  });

  const typeConfig = TYPE_LABELS[request.type] ?? {
    label: request.type,
    tone: 'text-slate-300 bg-slate-800 border-slate-700',
  };
  const statusConfig = STATUS_CONFIG[request.status] ?? STATUS_CONFIG.PENDING;
  const StatusIcon = statusConfig.icon;

  return (
    <article
      className={cn(
        'rounded-2xl border bg-slate-900/50 p-5 shadow-sm transition-all duration-200 backdrop-blur hover:border-slate-700/80 hover:bg-slate-900/80',
        request.status === 'PENDING'
          ? 'border-amber-500/30 ring-1 ring-amber-500/20'
          : 'border-slate-800/80',
      )}
    >
      {/* Header Bar */}
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-800/80 pb-4">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-950 border border-slate-800 text-slate-300">
            <Tag className="h-5 w-5 text-amber-400" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className={cn('rounded-lg border px-2.5 py-0.5 text-xs font-semibold', typeConfig.tone)}>
                {typeConfig.label}
              </span>
              <h2 className="text-base font-bold text-white tracking-tight">{request.targetLabel}</h2>
            </div>
            <p className="mt-1 text-xs text-slate-400">
              Talep No: <span className="font-mono text-slate-300">{request.id}</span> • Oluşturulma:{' '}
              {formatDateTime(request.createdAt)}
            </p>
          </div>
        </div>

        <span
          className={cn(
            'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold',
            statusConfig.badge,
          )}
        >
          <StatusIcon className="h-3.5 w-3.5" />
          <span>{statusConfig.label}</span>
        </span>
      </div>

      {/* Meta Grid: Requester, Impact & Ticket */}
      <div className="mt-4 grid gap-3 text-xs sm:grid-cols-3">
        <div className="rounded-xl border border-slate-800/80 bg-slate-950/50 p-3">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 block">
            Talep Eden Yönetici
          </span>
          <div className="mt-1 flex items-center gap-2">
            <div className="flex h-6 w-6 items-center justify-center rounded-full bg-red-500/20 text-[10px] font-bold text-red-300">
              {request.requestedBy.name.charAt(0)}
            </div>
            <span className="font-semibold text-slate-200 truncate">{request.requestedBy.name}</span>
          </div>
          <p className="mt-0.5 text-[11px] text-slate-400 truncate">{request.requestedBy.email}</p>
        </div>

        <div className="rounded-xl border border-slate-800/80 bg-slate-950/50 p-3">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 block">
            Etki Kapsamı
          </span>
          <div className="mt-1 flex items-center gap-3 text-slate-300 font-medium">
            <span className="flex items-center gap-1">
              <Building2 className="h-3.5 w-3.5 text-sky-400" />
              <strong>{request.affectedTenantCount}</strong> tenant
            </span>
            <span className="flex items-center gap-1">
              <Users className="h-3.5 w-3.5 text-emerald-400" />
              <strong>{request.affectedUserCount}</strong> kullanıcı
            </span>
          </div>
        </div>

        <div className="rounded-xl border border-slate-800/80 bg-slate-950/50 p-3">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 block">
            Gerekçe & Destek Bileti
          </span>
          <p className="mt-1 text-slate-200 line-clamp-2" title={request.reason}>
            {request.reason}
          </p>
          {request.ticketId && (
            <p className="mt-1 text-[11px] font-mono text-amber-400">Bilet: {request.ticketId}</p>
          )}
        </div>
      </div>

      {/* Side-by-side Payload Diff Viewer */}
      <div className="mt-4 rounded-xl border border-slate-800 bg-slate-950/80 p-4">
        <div className="flex items-center gap-2 text-xs font-semibold text-slate-300 mb-3">
          <FileCode className="h-4 w-4 text-sky-400" />
          <span>Değer Karşılaştırması & Değişiklik Önizlemesi</span>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 text-xs">
          <div className="rounded-lg border border-slate-800 bg-slate-900/80 p-3">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 block mb-1.5">
              Önceki / Mevcut Değer
            </span>
            <pre className="overflow-auto whitespace-pre-wrap font-mono text-[11px] text-rose-300/90 max-h-40 scrollbar-thin">
              {JSON.stringify(request.previousValues, null, 2)}
            </pre>
          </div>

          <div className="rounded-lg border border-slate-800 bg-slate-900/80 p-3">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 block mb-1.5">
              Talep Edilen / Yeni Değer
            </span>
            <pre className="overflow-auto whitespace-pre-wrap font-mono text-[11px] text-emerald-300/90 max-h-40 scrollbar-thin">
              {JSON.stringify(request.payload, null, 2)}
            </pre>
          </div>
        </div>
      </div>

      {/* Maker / Checker Principle Notice */}
      {request.status === 'PENDING' && isMaker && (
        <div className="mt-4 flex items-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-300">
          <ShieldAlert className="h-4 w-4 shrink-0" />
          <span>
            <strong>4-Göz Prensibi:</strong> Bu talebi siz oluşturdunuz. Güvenlik politikaları gereği kendi oluşturduğunuz talepleri onaylayamaz veya reddedemezsiniz; ikinci bir yönetici onayı gereklidir.
          </span>
        </div>
      )}

      {/* Action Buttons Footer */}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-800/80 pt-3">
        <div className="text-[11px] text-slate-500">
          {request.status === 'PENDING' ? (
            <span>Yetkili admin değerlendirmesi bekleniyor</span>
          ) : (
            <span>İşlem tamamlandı</span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {request.status === 'PENDING' && canReject && (
            <Button
              variant="outline"
              size="sm"
              disabled={decide.isPending}
              onClick={() => setIsRejectModalOpen(true)}
              className="border-rose-500/30 text-rose-300 hover:bg-rose-500/10"
              leftIcon={<X className="h-3.5 w-3.5" />}
            >
              Reddet
            </Button>
          )}

          {request.status === 'PENDING' && canApprove && (
            <Button
              variant="primary"
              size="sm"
              disabled={decide.isPending}
              onClick={() => setIsApproveModalOpen(true)}
              className="bg-emerald-600 hover:bg-emerald-500 text-white"
              leftIcon={<Check className="h-3.5 w-3.5" />}
            >
              Onayla ve Uygula
            </Button>
          )}

          {canRollback && (
            <Button
              variant="outline"
              size="sm"
              disabled={decide.isPending}
              onClick={() => decide.mutate({ action: 'rollback' })}
              className="border-amber-500/30 text-amber-300 hover:bg-amber-500/10"
              leftIcon={<RotateCcw className="h-3.5 w-3.5" />}
            >
              Geri Al
            </Button>
          )}
        </div>
      </div>

      {/* Approve Confirmation Modal */}
      {isApproveModalOpen && (
        <Modal
          isOpen={true}
          onClose={() => setIsApproveModalOpen(false)}
          title="Değişiklik Talebini Onayla"
          description={request.targetLabel}
          size="md"
          footer={
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => setIsApproveModalOpen(false)}>
                Vazgeç
              </Button>
              <Button
                variant="primary"
                loading={decide.isPending}
                className="bg-emerald-600 hover:bg-emerald-500 text-white"
                onClick={() => decide.mutate({ action: 'approve', note: decisionNote })}
              >
                Onayla ve Uygula
              </Button>
            </div>
          }
        >
          <div className="space-y-3 text-xs">
            <p className="text-slate-300">
              Bu talebi onayladığınızda yeni yapılandırma veya durum anında canlı sisteme yansıtılacaktır.
            </p>
            <div>
              <label className="block text-slate-400 font-semibold mb-1">Onay Notu (Opsiyonel):</label>
              <textarea
                value={decisionNote}
                onChange={(e) => setDecisionNote(e.target.value)}
                placeholder="Örn: Ticket #4892 kapsamında incelenip onaylandı."
                className="w-full rounded-xl border border-slate-800 bg-slate-950 p-2.5 text-slate-200 outline-none focus:border-emerald-500"
                rows={3}
              />
            </div>
          </div>
        </Modal>
      )}

      {/* Reject Confirmation Modal */}
      {isRejectModalOpen && (
        <Modal
          isOpen={true}
          onClose={() => setIsRejectModalOpen(false)}
          title="Değişiklik Talebini Reddet"
          description={request.targetLabel}
          size="md"
          footer={
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => setIsRejectModalOpen(false)}>
                Vazgeç
              </Button>
              <Button
                variant="danger"
                loading={decide.isPending}
                onClick={() => decide.mutate({ action: 'reject', note: decisionNote })}
              >
                Talebi Reddet
              </Button>
            </div>
          }
        >
          <div className="space-y-3 text-xs">
            <p className="text-slate-300">
              Bu talep reddedilecek ve değişiklik yapılmayacaktır. Lütfen ret gerekçesini belirtin.
            </p>
            <div>
              <label className="block text-slate-400 font-semibold mb-1">Ret Gerekçesi:</label>
              <textarea
                value={decisionNote}
                onChange={(e) => setDecisionNote(e.target.value)}
                placeholder="Örn: Gerekli güvenlik onayları eksik veya bilet no doğrulanmadı."
                className="w-full rounded-xl border border-slate-800 bg-slate-950 p-2.5 text-slate-200 outline-none focus:border-rose-500"
                rows={3}
              />
            </div>
          </div>
        </Modal>
      )}
    </article>
  );
}

export default function AdminChangeRequestsPage() {
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<AdminChangeRequestStatus | 'ALL'>('ALL');
  const [searchTerm, setSearchTerm] = useState('');

  const { data = [], isLoading, isFetching } = useQuery({
    queryKey: ['admin', 'change-requests'],
    queryFn: () => getAdminChangeRequests(),
    refetchInterval: 30_000,
  });

  const refreshList = async () => {
    await queryClient.invalidateQueries({ queryKey: ['admin', 'change-requests'] });
  };

  // Metrics
  const metrics = useMemo(() => {
    const total = data.length;
    const pending = data.filter((r) => r.status === 'PENDING').length;
    const approved = data.filter((r) => r.status === 'APPROVED').length;
    const rejected = data.filter((r) => r.status === 'REJECTED').length;

    return { total, pending, approved, rejected };
  }, [data]);

  // Filtered requests
  const filteredRequests = useMemo(() => {
    return data.filter((req) => {
      const search = searchTerm.toLowerCase().trim();
      const matchesSearch =
        !search ||
        req.targetLabel.toLowerCase().includes(search) ||
        req.reason.toLowerCase().includes(search) ||
        req.requestedBy.name.toLowerCase().includes(search) ||
        (req.ticketId && req.ticketId.toLowerCase().includes(search));

      const matchesStatus = statusFilter === 'ALL' || req.status === statusFilter;

      return matchesSearch && matchesStatus;
    });
  }, [data, searchTerm, statusFilter]);

  const hasActiveFilters = Boolean(searchTerm) || statusFilter !== 'ALL';

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-amber-500/20 to-orange-600/20 text-amber-400 ring-1 ring-amber-500/30">
            <UserCheck className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-white sm:text-2xl">
              Onay Talepleri (Change Governance)
            </h1>
            <p className="text-xs text-slate-400">
              Kritik tenant planları, durum değişiklikleri ve kalıcı override işlemleri için 4-göz prensibi yönetim akışı.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <Button
            variant="outline"
            size="md"
            onClick={refreshList}
            loading={isFetching}
            leftIcon={<RefreshCw className={cn('h-4 w-4', isFetching && 'animate-spin')} />}
          >
            Yenile
          </Button>
        </div>
      </div>

      {/* KPI Metrics Strip */}
      <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-2xl border border-slate-800/80 bg-slate-900/50 p-4 shadow-sm backdrop-blur">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400">Toplam Talep</span>
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-sky-500/10 text-sky-400">
              <Tag className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2 text-2xl font-bold text-white tracking-tight">{metrics.total}</div>
          <div className="mt-1 text-[11px] text-slate-400">Sistemdeki tüm onay süreçleri</div>
        </div>

        <div className="rounded-2xl border border-slate-800/80 bg-slate-900/50 p-4 shadow-sm backdrop-blur">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400">Onay Bekleyen</span>
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-500/10 text-amber-400">
              <Clock className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2 text-2xl font-bold text-white tracking-tight flex items-center gap-2">
            <span className={metrics.pending > 0 ? 'text-amber-400' : 'text-slate-200'}>
              {metrics.pending}
            </span>
            {metrics.pending > 0 && (
              <span className="h-2 w-2 rounded-full bg-amber-400 animate-pulse" />
            )}
          </div>
          <div className="mt-1 text-[11px] text-slate-400">
            {metrics.pending > 0 ? 'İkinci yönetici incelemesi bekliyor' : 'Tüm onaylar güncel'}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-800/80 bg-slate-900/50 p-4 shadow-sm backdrop-blur">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400">Onaylanan & Uygulanan</span>
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-400">
              <CheckCircle2 className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2 text-2xl font-bold text-white tracking-tight">{metrics.approved}</div>
          <div className="mt-1 text-[11px] text-emerald-400 font-medium">Başarıyla yürürlüğe girdi</div>
        </div>

        <div className="rounded-2xl border border-slate-800/80 bg-slate-900/50 p-4 shadow-sm backdrop-blur">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400">Reddedilen</span>
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-rose-500/10 text-rose-400">
              <XCircle className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2 text-2xl font-bold text-white tracking-tight">{metrics.rejected}</div>
          <div className="mt-1 text-[11px] text-slate-400">Politika gereği reddedilenler</div>
        </div>
      </div>

      {/* Search & Filter Toolbar */}
      <div className="rounded-2xl border border-slate-800/80 bg-slate-900/60 p-4 backdrop-blur space-y-3">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="relative flex-1">
            <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-slate-500">
              <Search className="h-4 w-4" />
            </div>
            <input
              type="text"
              placeholder="Hedef, gerekçe, talep eden veya bilet no ile ara…"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full rounded-xl border border-slate-800 bg-slate-950/70 py-2 pl-9 pr-8 text-sm text-slate-100 placeholder-slate-500 transition-colors focus:border-amber-500 focus:bg-slate-950 focus:outline-none focus:ring-1 focus:ring-amber-500"
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

          {hasActiveFilters && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setSearchTerm('');
                setStatusFilter('ALL');
              }}
              leftIcon={<FilterX className="h-3.5 w-3.5" />}
              className="text-xs text-slate-400 hover:text-slate-200"
            >
              Filtreleri Sıfırla
            </Button>
          )}
        </div>

        {/* Status Filter Tabs */}
        <div className="flex items-center gap-1.5 border-t border-slate-800/80 pt-3">
          <span className="text-xs font-medium text-slate-400 mr-1.5">Durum:</span>
          {(
            [
              { key: 'ALL', label: `Tümü (${data.length})` },
              { key: 'PENDING', label: `Onay Bekleyen (${metrics.pending})` },
              { key: 'APPROVED', label: `Onaylanan (${metrics.approved})` },
              { key: 'REJECTED', label: `Reddedilen (${metrics.rejected})` },
            ] as const
          ).map((tab) => {
            const isSelected = statusFilter === tab.key;
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => setStatusFilter(tab.key)}
                className={cn(
                  'rounded-lg px-2.5 py-1 text-xs font-medium transition-colors',
                  isSelected
                    ? 'bg-amber-500/15 text-amber-300 ring-1 ring-amber-500/30 font-semibold'
                    : 'text-slate-400 hover:bg-slate-800/60 hover:text-slate-200',
                )}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Loading State */}
      {isLoading && (
        <div className="space-y-4">
          {[1, 2].map((n) => (
            <div
              key={n}
              className="animate-pulse rounded-2xl border border-slate-800/80 bg-slate-900/40 p-6 space-y-4"
            >
              <div className="h-5 w-48 rounded bg-slate-800" />
              <div className="h-4 w-96 rounded bg-slate-800/60" />
              <div className="h-20 w-full rounded bg-slate-800/40" />
            </div>
          ))}
        </div>
      )}

      {/* Empty State */}
      {!isLoading && filteredRequests.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-800 bg-slate-900/30 p-12 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-800/70 text-slate-400">
            <UserCheck className="h-6 w-6" />
          </div>
          <h3 className="mt-4 text-base font-semibold text-slate-200">
            Kriterlere uygun onay talebi bulunamadı
          </h3>
          <p className="mt-1 text-xs text-slate-400 max-w-sm">
            {hasActiveFilters
              ? 'Arama teriminizi veya durum filtresini sıfırlayarak tekrar deneyebilirsiniz.'
              : 'Şu anda onay kuyruğunda bekleyen veya kaydedilmiş bir talep bulunmuyor.'}
          </p>
        </div>
      )}

      {/* Change Requests List */}
      {!isLoading && filteredRequests.length > 0 && (
        <div className="space-y-4">
          {filteredRequests.map((request) => (
            <ChangeRequestCard
              key={request.id}
              request={request}
              onActionSuccess={refreshList}
            />
          ))}
        </div>
      )}
    </div>
  );
}
