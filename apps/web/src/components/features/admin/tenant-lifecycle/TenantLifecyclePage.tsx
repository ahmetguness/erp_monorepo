'use client';

import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  RefreshCw,
  History,
  Download,
  ShieldAlert,
  ArrowLeft,
  AlertTriangle,
  Clock,
  Layers,
  FileCheck2,
} from 'lucide-react';
import { decideTenantLifecycle, exportTenantLifecycle, getTenantLifecycle } from '@/services/tenant-lifecycle.service';
import { useAdminAuthStore } from '@/store/admin-auth.store';
import { canAdmin } from '@/lib/admin/permissions';
import { toast } from '@/store/ui.store';
import { toastAdminError } from '@/lib/admin/errors';
import { TenantLifecycleForm } from './TenantLifecycleForm';
import { AdminPageHeader, AdminKpiGrid, AdminKpiCard } from '../ui';

const button = 'inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 px-3.5 py-2 text-xs font-medium text-slate-200 transition-colors hover:bg-slate-700 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer';

export function TenantLifecyclePage({ tenantId }: { tenantId: string }) {
  const admin = useAdminAuthStore(state => state.admin);
  const client = useQueryClient();
  const query = useQuery({
    queryKey: ['tenant-lifecycle', tenantId],
    queryFn: () => getTenantLifecycle(tenantId),
    refetchInterval: 15000,
  });

  const invalidate = async () => {
    await Promise.all([
      client.invalidateQueries({ queryKey: ['tenant-lifecycle', tenantId] }),
      client.invalidateQueries({ queryKey: ['admin', 'tenant', tenantId] }),
      client.invalidateQueries({ queryKey: ['admin', 'tenant-360', tenantId] }),
      client.invalidateQueries({ queryKey: ['admin', 'tenants'] }),
    ]);
  };

  const decision = useMutation({
    mutationFn: ({ id, value }: { id: string; value: 'approve' | 'reject' }) =>
      decideTenantLifecycle(tenantId, id, value),
    onSuccess: invalidate,
    onError: (err: unknown) => toastAdminError(err, 'Yaşam döngüsü kararı uygulanamadı.'),
  });

  const exportData = useMutation({
    mutationFn: () => exportTenantLifecycle(tenantId),
    onSuccess: async (exported) => {
      const url = URL.createObjectURL(new Blob([JSON.stringify(exported, null, 2)], { type: 'application/json' }));
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `tenant-export-${exported.id}.json`;
      anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      await invalidate();
      toast.success('Tenant verisi başarıyla indirildi.');
    },
    onError: (err: unknown) => toastAdminError(err, 'Export alınamadı.'),
  });

  const snapshot = query.data;
  const pendingRequests = snapshot?.requests.filter(r => r.state === 'PENDING') ?? [];

  return (
    <div className="space-y-6 pb-12">
      <AdminPageHeader
        title={`Yaşam Döngüsü · ${snapshot?.companyName ?? 'Tenant'}`}
        description="Tenant durum geçişleri, hukuki dondurma (legal hold), saklama süreleri ve veri arşivi yönetimi"
        icon={History}
        iconTone="indigo"
        badge={
          snapshot ? (
            <span
              className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-semibold ring-1 ${
                snapshot.status === 'ACTIVE'
                  ? 'bg-emerald-500/10 text-emerald-400 ring-emerald-500/20'
                  : 'bg-amber-500/10 text-amber-400 ring-amber-500/20'
              }`}
            >
              Durum: {snapshot.status}
            </span>
          ) : undefined
        }
        actions={
          <div className="flex items-center gap-2">
            <Link
              href={`/admin/tenants/${tenantId}`}
              className={button}
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              <span>Tenant Detayı</span>
            </Link>
            <button
              type="button"
              className={button}
              onClick={() => void query.refetch()}
              disabled={query.isFetching}
            >
              <RefreshCw className={`h-3.5 w-3.5 ${query.isFetching ? 'animate-spin' : ''}`} />
              <span>Yenile</span>
            </button>
          </div>
        }
      />

      {query.isError && (
        <div role="alert" className="flex items-center gap-3 rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-xs font-medium text-rose-200">
          <AlertTriangle className="h-4 w-4 shrink-0 text-rose-400" />
          <span>Yaşam döngüsü verileri alınamadı.</span>
        </div>
      )}

      {/* KPI Metric Overview */}
      <AdminKpiGrid columns={4}>
        <AdminKpiCard
          label="Mevcut Durum"
          value={snapshot?.status ?? '—'}
          subtext={`Sürüm: v${snapshot?.version ?? 1}`}
          icon={Layers}
          iconTone={snapshot?.status === 'ACTIVE' ? 'emerald' : 'amber'}
        />
        <AdminKpiCard
          label="Hukuki Bekletme"
          value={snapshot?.legalHold ? 'Aktif (Kilitli)' : 'Pasif'}
          subtext={snapshot?.legalHold ? 'Silme ve arşiv engelli' : 'Standart prosedür'}
          icon={ShieldAlert}
          iconTone={snapshot?.legalHold ? 'red' : 'slate'}
        />
        <AdminKpiCard
          label="Bekleyen Talepler"
          value={pendingRequests.length}
          subtext="Onay gerektiren geçiş talebi"
          icon={Clock}
          iconTone={pendingRequests.length > 0 ? 'amber' : 'slate'}
        />
        <AdminKpiCard
          label="Toplam İşlem Kaydı"
          value={snapshot?.requests.length ?? 0}
          subtext="Tarihsel talep ve kararlar"
          icon={FileCheck2}
          iconTone="indigo"
        />
      </AdminKpiGrid>

      {snapshot && (
        <>
          {/* Policy & Retention Notice */}
          <section className="rounded-xl border border-slate-800/80 bg-slate-900/60 p-5 backdrop-blur-sm shadow-inner text-xs text-slate-300 space-y-3">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-200">
              Saklama ve Geri Yükleme Kuralları
            </h2>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-lg border border-slate-800 bg-slate-950/40 p-3">
                <span className="text-slate-500">Saklama Bitiş Tarihi:</span>
                <p className="mt-1 font-semibold text-white">{snapshot.retentionUntil ?? 'Belirlenmedi'}</p>
              </div>
              <div className="rounded-lg border border-slate-800 bg-slate-950/40 p-3">
                <span className="text-slate-500">En Erken Silme Tarihi:</span>
                <p className="mt-1 font-semibold text-white">{snapshot.deletionNotBefore ?? 'Planlanmadı'}</p>
              </div>
            </div>
            <p className="text-[11px] text-slate-400">
              Geri yükleme politikası: Silinmiş tenant önce arşive; arşivden iptal durumuna, ardından aktif duruma kademeli olarak alınabilir. Her adım bağımsız onay gerektirir.
            </p>
            <div className="rounded-lg border border-amber-500/20 bg-amber-500/10 p-3 text-[11px] text-amber-300">
              Export yalnızca seçili iş tablolarını içerir; dosyalar ve hassas kimlik bilgileri hariçtir. Silme öncesinde tam yedek doğrulaması yapılması zorunludur.
            </div>
            {canAdmin(admin, 'tenant.export') && (
              <div className="pt-2">
                <button
                  type="button"
                  className="inline-flex items-center gap-1.5 rounded-lg border border-indigo-500/30 bg-indigo-500/20 px-3.5 py-2 text-xs font-semibold text-indigo-300 hover:bg-indigo-500/30 disabled:opacity-40"
                  disabled={exportData.isPending}
                  onClick={() => exportData.mutate()}
                >
                  <Download className="h-3.5 w-3.5" />
                  <span>{exportData.isPending ? 'Export hazırlanıyor…' : 'İş Verisini JSON İndir'}</span>
                </button>
              </div>
            )}
            {exportData.isError && (
              <p role="alert" className="text-xs text-rose-400">Export alınamadı. Büyük tenantlar için ayrı operasyonel export gerekir.</p>
            )}
          </section>

          {/* Lifecycle Request Form */}
          {canAdmin(admin, 'tenant.status.update') && !snapshot.requests.some(item => item.state === 'PENDING') && (
            <TenantLifecycleForm key={`${tenantId}:${snapshot.version}`} snapshot={snapshot} />
          )}

          {/* History / Requests List */}
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                Talepler ve Karar Geçmişi ({snapshot.requests.length})
              </h2>
            </div>

            {decision.isError && (
              <div role="alert" className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-300">
                Karar uygulanamadı; tenant durumu değişmiş, geçiş/saklama şartları sağlanmamış veya yetki yetersiz olabilir.
              </div>
            )}

            {snapshot.requests.length === 0 ? (
              <div className="rounded-xl border border-slate-800/80 bg-slate-900/60 p-8 text-center text-xs text-slate-500">
                Henüz kayıtlı bir yaşam döngüsü talebi veya geçişi bulunmuyor.
              </div>
            ) : (
              snapshot.requests.map((request) => (
                <article key={request.id} className="rounded-xl border border-slate-800/80 bg-slate-900/60 p-4 text-xs text-slate-300 backdrop-blur-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800/60 pb-2.5">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-white">{request.fromStatus} → {request.input.targetStatus ?? 'Hukuki bekletme / saklama'}</span>
                    </div>
                    <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider border ${
                      request.state === 'APPLIED'
                        ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
                        : request.state === 'REJECTED'
                        ? 'border-rose-500/30 bg-rose-500/10 text-rose-400'
                        : 'border-amber-500/30 bg-amber-500/10 text-amber-400'
                    }`}>
                      {request.state}
                    </span>
                  </div>

                  <div className="mt-3 grid gap-2 text-slate-400 sm:grid-cols-2">
                    <p><span className="text-slate-500">Talep Eden:</span> {request.requestedByName} · {new Date(request.createdAt).toLocaleString('tr-TR')}</p>
                    <p><span className="text-slate-500">Ticket / Ref:</span> {request.input.ticketId || '—'} · Etki: {request.input.impact}</p>
                    <p className="sm:col-span-2"><span className="text-slate-500">Gerekçe:</span> {request.input.reason}</p>
                    <p className="sm:col-span-2"><span className="text-slate-500">Karar Tarihi:</span> {request.decidedAt ? new Date(request.decidedAt).toLocaleString('tr-TR') : 'Bekleniyor'}</p>
                  </div>

                  {request.state === 'PENDING' && canAdmin(admin, 'tenant.status.approve') && (
                    <div className="mt-3 flex gap-2 border-t border-slate-800/60 pt-3">
                      <button
                        type="button"
                        className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/20 px-3.5 py-1.5 text-xs font-semibold text-emerald-300 hover:bg-emerald-500/30 disabled:opacity-40"
                        disabled={decision.isPending || request.requestedById === admin?.id}
                        onClick={() => decision.mutate({ id: request.id, value: 'approve' })}
                      >
                        Onayla ve Uygula
                      </button>
                      <button
                        type="button"
                        className="inline-flex items-center gap-1.5 rounded-lg border border-rose-500/30 bg-rose-500/20 px-3.5 py-1.5 text-xs font-semibold text-rose-300 hover:bg-rose-500/30 disabled:opacity-40"
                        disabled={decision.isPending || request.requestedById === admin?.id}
                        onClick={() => decision.mutate({ id: request.id, value: 'reject' })}
                      >
                        Reddet
                      </button>
                    </div>
                  )}
                </article>
              ))
            )}
          </section>
        </>
      )}
    </div>
  );
}
