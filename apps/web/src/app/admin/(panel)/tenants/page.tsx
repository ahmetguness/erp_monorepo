'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { Search, Building2 } from 'lucide-react';
import { getTenants, type TenantListItem } from '@/services/admin.service';
import { Badge, type BadgeVariant } from '@/components/ui/Badge';
import { cn } from '@/lib/utils';

const STATUS_MAP: Record<string, { label: string; variant: BadgeVariant }> = {
  TRIAL: { label: 'Deneme', variant: 'warning' },
  ACTIVE: { label: 'Aktif', variant: 'success' },
  SUSPENDED: { label: 'Askıda', variant: 'danger' },
  CANCELLED: { label: 'İptal', variant: 'neutral' },
};

const PLAN_MAP: Record<string, { label: string; color: string }> = {
  STARTER: { label: 'Starter', color: 'text-sky-400 bg-sky-500/10' },
  PROFESSIONAL: { label: 'Professional', color: 'text-violet-400 bg-violet-500/10' },
  ENTERPRISE: { label: 'Enterprise', color: 'text-amber-400 bg-amber-500/10' },
};

export default function AdminTenantsPage() {
  const router = useRouter();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [planFilter, setPlanFilter] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'tenants', page, search, statusFilter, planFilter],
    queryFn: () => getTenants({ page, limit: 20, search: search || undefined, status: statusFilter || undefined, plan: planFilter || undefined }),
  });

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-lg font-semibold text-white">Tenantlar</h1>
        <p className="text-sm text-slate-500">Tüm şirket hesaplarını yönetin.</p>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
          <input value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            placeholder="Şirket adı, slug veya email…"
            className="w-full bg-slate-900 border border-slate-800 rounded-lg text-sm text-white pl-9 pr-3 py-2 focus:outline-none focus:ring-2 focus:ring-red-500/50" />
        </div>
        <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
          className="bg-slate-900 border border-slate-800 rounded-lg text-xs text-slate-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-red-500/50">
          <option value="">Tüm Durumlar</option>
          <option value="TRIAL">Deneme</option>
          <option value="ACTIVE">Aktif</option>
          <option value="SUSPENDED">Askıda</option>
          <option value="CANCELLED">İptal</option>
        </select>
        <select value={planFilter} onChange={(e) => { setPlanFilter(e.target.value); setPage(1); }}
          className="bg-slate-900 border border-slate-800 rounded-lg text-xs text-slate-300 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-red-500/50">
          <option value="">Tüm Planlar</option>
          <option value="STARTER">Starter</option>
          <option value="PROFESSIONAL">Professional</option>
          <option value="ENTERPRISE">Enterprise</option>
        </select>
      </div>

      {/* Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
        <div className="grid grid-cols-12 gap-2 px-5 py-2.5 bg-slate-800/30 text-[10px] font-semibold text-slate-500 uppercase tracking-wider border-b border-slate-800/40">
          <div className="col-span-3">Şirket</div>
          <div className="col-span-2">Plan</div>
          <div className="col-span-2">Durum</div>
          <div className="col-span-1 text-center">Kullanıcı</div>
          <div className="col-span-1 text-center">Ürün</div>
          <div className="col-span-1 text-center">Fatura</div>
          <div className="col-span-2 text-right">Kayıt</div>
        </div>

        {isLoading ? (
          <div className="py-16 text-center text-sm text-slate-600">Yükleniyor…</div>
        ) : !data || data.data.length === 0 ? (
          <div className="py-16 text-center text-sm text-slate-600">Tenant bulunamadı</div>
        ) : (
          <div className="divide-y divide-slate-800/40">
            {data.data.map((t) => {
              const plan = PLAN_MAP[t.plan];
              const status = STATUS_MAP[t.status];
              return (
                <div key={t.id} onClick={() => router.push(`/admin/tenants/${t.id}`)}
                  className="grid grid-cols-12 gap-2 px-5 py-3 items-center hover:bg-slate-800/20 transition-colors cursor-pointer">
                  <div className="col-span-3 min-w-0">
                    <p className="text-sm font-medium text-slate-200 truncate">{t.companyName}</p>
                    <p className="text-[10px] text-slate-500">{t.slug} · {t.email}</p>
                  </div>
                  <div className="col-span-2">
                    <span className={cn('text-xs font-medium px-2 py-0.5 rounded-full', plan?.color ?? 'text-slate-400')}>{plan?.label ?? t.plan}</span>
                  </div>
                  <div className="col-span-2">
                    {status ? <Badge variant={status.variant}>{status.label}</Badge> : <span className="text-xs text-slate-400">{t.status}</span>}
                  </div>
                  <div className="col-span-1 text-center text-sm text-slate-300">{t._count.users}</div>
                  <div className="col-span-1 text-center text-sm text-slate-300">{t._count.products}</div>
                  <div className="col-span-1 text-center text-sm text-slate-300">{t._count.invoices}</div>
                  <div className="col-span-2 text-right text-xs text-slate-500">{new Date(t.createdAt).toLocaleDateString('tr-TR')}</div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Pagination */}
      {data && data.meta.totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          {Array.from({ length: data.meta.totalPages }, (_, i) => (
            <button key={i} onClick={() => setPage(i + 1)}
              className={cn('w-8 h-8 rounded-lg text-xs font-medium transition-colors',
                page === i + 1 ? 'bg-red-500/15 text-red-400' : 'text-slate-500 hover:bg-slate-800')}>
              {i + 1}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
