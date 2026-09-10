'use client';

import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { decideTenantLifecycle, exportTenantLifecycle, getTenantLifecycle } from '@/services/tenant-lifecycle.service';
import { useAdminAuthStore } from '@/store/admin-auth.store';
import { canAdmin } from '@/lib/admin/permissions';
import { TenantLifecycleForm } from './TenantLifecycleForm';

const button = 'rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-200 hover:bg-slate-700 disabled:opacity-40';
export function TenantLifecyclePage({ tenantId }: { tenantId: string }) {
  const admin = useAdminAuthStore(state => state.admin);
  const client = useQueryClient();
  const query = useQuery({ queryKey: ['tenant-lifecycle', tenantId], queryFn: () => getTenantLifecycle(tenantId), refetchInterval: 15000 });
  const invalidate = async () => {
    await Promise.all([
      client.invalidateQueries({ queryKey: ['tenant-lifecycle', tenantId] }),
      client.invalidateQueries({ queryKey: ['admin', 'tenant', tenantId] }),
      client.invalidateQueries({ queryKey: ['admin', 'tenant-360', tenantId] }),
      client.invalidateQueries({ queryKey: ['admin', 'tenants'] }),
    ]);
  };
  const decision = useMutation({ mutationFn: ({ id, value }: { id: string; value: 'approve' | 'reject' }) => decideTenantLifecycle(tenantId, id, value), onSuccess: invalidate });
  const exportData = useMutation({ mutationFn: () => exportTenantLifecycle(tenantId), onSuccess: async exported => {
    const url = URL.createObjectURL(new Blob([JSON.stringify(exported, null, 2)], { type: 'application/json' }));
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = `tenant-export-${exported.id}.json`; anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    await invalidate();
  } });
  const snapshot = query.data;
  return <div className="space-y-5 text-sm text-slate-300">
    <Link className="text-blue-400" href="/admin/tenants">← Tenant listesi</Link>
    <div className="flex justify-between"><h1 className="text-xl font-semibold text-white">Tenant yaşam döngüsü · {snapshot?.companyName}</h1><button className={button} onClick={() => void query.refetch()} disabled={query.isFetching}>Yenile</button></div>
    {query.isPending && <p>Yükleniyor…</p>}{query.isError && <p role="alert" className="text-red-400">Yaşam döngüsü alınamadı.</p>}
    {snapshot && <>
      <section className="space-y-2 rounded-xl border border-slate-800 bg-slate-900 p-4">
        <p>Durum: <strong>{snapshot.status}</strong> · Sürüm: {snapshot.version}</p>
        <p>Hukuki bekletme: {snapshot.legalHold ? 'Aktif — silme engelli' : 'Pasif'}</p>
        <p>Saklama bitişi: {snapshot.retentionUntil ?? 'Belirlenmedi'} · Silme en erken: {snapshot.deletionNotBefore ?? 'Planlanmadı'}</p>
        <p>Geri yükleme: silinmiş tenant önce arşive; arşivden iptal durumuna, ardından aktife alınabilir. Her adım ayrıca onaylanır.</p>
        <p className="text-amber-300">Export yalnızca seçili iş tablolarını içerir; dosyalar, JSON alanları ve kimlik bilgileri hariçtir. Silme öncesi ayrıca tam yedek doğrulaması gerekir.</p>
        {canAdmin(admin, 'tenant.export') && <button className={button} disabled={exportData.isPending} onClick={() => exportData.mutate()}>{exportData.isPending ? 'Export hazırlanıyor…' : 'İş verisini JSON indir'}</button>}
        {exportData.isError && <p role="alert" className="text-red-400">Export alınamadı. Büyük tenantlar için ayrı operasyonel export gerekir.</p>}
      </section>
      {canAdmin(admin, 'tenant.status.update') && !snapshot.requests.some(item => item.state === 'PENDING') && <TenantLifecycleForm key={`${tenantId}:${snapshot.version}`} snapshot={snapshot} />}
      <h2 className="font-semibold text-white">Talepler ve geçmiş (son 100)</h2>
      {decision.isError && <p role="alert" className="text-red-400">Karar uygulanamadı; tenant değişmiş, geçiş/saklama şartları sağlanmamış veya yetki yetersiz olabilir.</p>}
      {snapshot.requests.map(request => <article key={request.id} className="space-y-2 rounded-lg border border-slate-800 bg-slate-900 p-4">
        <h3>{request.fromStatus} → {request.input.targetStatus ?? 'Hukuki bekletme / saklama'} · {request.state}</h3>
        <p>Talep eden: {request.requestedByName} · {new Date(request.createdAt).toLocaleString('tr-TR')}</p>
        <p>Gerekçe: {request.input.reason} · Etki: {request.input.impact} · Ticket: {request.input.ticketId}</p>
        <p>Onay/ret tarihi: {request.decidedAt ?? 'Bekleniyor'} · Karar veren: {request.decidedById ?? '—'}</p>
        {request.state === 'PENDING' && canAdmin(admin, 'tenant.status.approve') && <div className="flex gap-2"><button className={button} disabled={decision.isPending || request.requestedById === admin?.id} onClick={() => decision.mutate({ id: request.id, value: 'approve' })}>Onayla ve uygula</button><button className={button} disabled={decision.isPending || request.requestedById === admin?.id} onClick={() => decision.mutate({ id: request.id, value: 'reject' })}>Reddet</button></div>}
      </article>)}
    </>}
  </div>;
}
