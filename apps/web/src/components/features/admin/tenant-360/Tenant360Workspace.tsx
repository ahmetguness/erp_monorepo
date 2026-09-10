'use client';

import { useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getTenant360 } from '@/services/tenant-360.service';
import { useAdminAuthStore } from '@/store/admin-auth.store';
import { TENANT_360_TABS, Tenant360Panels, type Tenant360Tab } from './Tenant360Panels';
import { TenantSupportPanel } from './TenantSupportPanel';

export function Tenant360Workspace({ tenantId, children }: { tenantId: string; children: ReactNode }) {
  const [tab, setTab] = useState<Tenant360Tab>('Genel Bakış');
  const admin = useAdminAuthStore(state => state.admin);
  const query = useQuery({ queryKey: ['admin', 'tenant-360', tenantId, admin?.id, admin?.permissions], queryFn: () => getTenant360(tenantId), enabled: admin !== null, staleTime: 0 });
  return <div className="space-y-5">
    <section className="rounded-xl border border-slate-800 bg-slate-900 p-4 text-slate-300 space-y-4">
      <div className="flex items-center justify-between gap-4"><h2 className="font-semibold text-white">Tenant 360 {query.data && `· ${query.data.companyName}`}</h2><button type="button" className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-sm text-slate-300 transition-colors hover:bg-slate-700 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:cursor-not-allowed disabled:opacity-50" disabled={query.isFetching} onClick={() => void query.refetch()}>Yenile</button></div>
      {query.isPending && <p role="status">Operasyon verileri yükleniyor…</p>}
      {query.isError && <p role="alert" className="text-red-400">Operasyon verileri alınamadı. Yenile ile tekrar deneyin.</p>}
      {query.data && <div className={query.data.health.status === 'ATTENTION' ? 'text-amber-400' : 'text-emerald-400'}><p>{query.data.health.status === 'ATTENTION' ? 'İnceleme gerekli' : 'Görüntülenebilen kontrollerde uyarı yok'}</p>{query.data.health.reasons.map(reason => <p key={reason}>{reason}</p>)}<p className="text-xs text-slate-400">Son veri: {new Date(query.data.generatedAt).toLocaleString('tr-TR')} · Sağlık özeti erişebildiğiniz kayıtlarla sınırlıdır.</p></div>}
      <nav aria-label="Tenant 360 bölümleri" className="flex flex-wrap gap-2 border-t border-slate-800 pt-4">{TENANT_360_TABS.map(item => <button key={item} type="button" aria-pressed={tab === item} className={`rounded-lg border px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${tab === item ? 'border-blue-500/40 bg-blue-500/15 text-blue-300' : 'border-slate-700 bg-slate-800 text-slate-300 hover:border-slate-600 hover:bg-slate-700 hover:text-white'}`} onClick={() => { setTab(item); void query.refetch(); }}>{item}</button>)}</nav>
    </section>
    <div hidden={tab !== 'Genel Bakış'}>{children}</div>
    {tab !== 'Genel Bakış' && query.data && <section aria-label={tab} className="rounded-xl border border-slate-800 bg-slate-900 p-4 text-sm text-slate-300 sm:p-5">{tab === 'Destek' ? <TenantSupportPanel key={tenantId} tenantId={tenantId} notes={query.data.support} /> : <Tenant360Panels tab={tab} data={query.data} />}</section>}
  </div>;
}
