'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { FileText, Building2, Search, Filter } from 'lucide-react';
import { getAdminAuditLogs, getTenants, type TenantListItem } from '@/services/admin.service';
import { Badge, type BadgeVariant } from '@/components/ui/Badge';
import { cn } from '@/lib/utils';

const ACTION_MAP: Record<string, { label: string; variant: BadgeVariant }> = {
  CREATE: { label: 'Oluşturma', variant: 'success' },
  UPDATE: { label: 'Güncelleme', variant: 'info' },
  DELETE: { label: 'Silme', variant: 'danger' },
  APPROVE: { label: 'Onay', variant: 'success' },
  REJECT: { label: 'Red', variant: 'warning' },
  LOGIN: { label: 'Giriş', variant: 'neutral' },
  LOGOUT: { label: 'Çıkış', variant: 'neutral' },
  EXPORT: { label: 'Dışa Aktarma', variant: 'info' },
  OTHER: { label: 'Diğer', variant: 'neutral' },
};

export default function AdminAuditPage() {
  const [page, setPage] = useState(1);
  const [selectedTenantId, setSelectedTenantId] = useState('');
  const [actionFilter, setActionFilter] = useState('');

  // Fetch tenants for the selector
  const { data: tenantsData } = useQuery({
    queryKey: ['admin', 'tenants-for-filter'],
    queryFn: () => getTenants({ page: 1, limit: 100 }),
  });
  const tenants = tenantsData?.data ?? [];

  // Fetch audit logs
  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'audit', page, selectedTenantId, actionFilter],
    queryFn: () => getAdminAuditLogs({
      page, limit: 30,
      tenantId: selectedTenantId || undefined,
      action: actionFilter || undefined,
    }),
  });

  const selectedTenant = tenants.find((t) => t.id === selectedTenantId);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-lg font-semibold text-white flex items-center gap-2">
          <FileText className="w-5 h-5 text-red-400" />
          Denetim Kayıtları
        </h1>
        <p className="text-sm text-slate-500">Tüm tenant işlem geçmişi (sınırsız).</p>
      </div>

      {/* ── Filters ─────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Tenant selector */}
        <div className="flex items-center gap-2 bg-slate-900 border border-slate-800 rounded-lg px-3 py-1.5">
          <Building2 className="w-3.5 h-3.5 text-slate-500" />
          <select value={selectedTenantId} onChange={(e) => { setSelectedTenantId(e.target.value); setPage(1); }}
            className="bg-transparent text-xs text-slate-300 focus:outline-none min-w-[180px]">
            <option value="">Tüm Tenantlar</option>
            {tenants.map((t) => (
              <option key={t.id} value={t.id}>{t.companyName} ({t.slug})</option>
            ))}
          </select>
        </div>

        {/* Action filter */}
        <div className="flex items-center gap-2 bg-slate-900 border border-slate-800 rounded-lg px-3 py-1.5">
          <Filter className="w-3.5 h-3.5 text-slate-500" />
          <select value={actionFilter} onChange={(e) => { setActionFilter(e.target.value); setPage(1); }}
            className="bg-transparent text-xs text-slate-300 focus:outline-none">
            <option value="">Tüm İşlemler</option>
            {Object.entries(ACTION_MAP).map(([key, { label }]) => (
              <option key={key} value={key}>{label}</option>
            ))}
          </select>
        </div>

        {/* Active filter indicator */}
        {selectedTenant && (
          <div className="flex items-center gap-1.5 bg-red-500/10 border border-red-500/20 rounded-lg px-2.5 py-1.5">
            <span className="text-xs text-red-400 font-medium">{selectedTenant.companyName}</span>
            <button onClick={() => setSelectedTenantId('')} className="text-red-400 hover:text-red-300 text-xs">✕</button>
          </div>
        )}

        <span className="text-[10px] text-slate-600 ml-auto">{data?.meta.total ?? 0} kayıt</span>
      </div>

      {/* ── Table ───────────────────────────────── */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
        <div className="grid grid-cols-12 gap-2 px-5 py-2.5 bg-slate-800/30 text-[10px] font-semibold text-slate-500 uppercase tracking-wider border-b border-slate-800/40">
          <div className="col-span-2">Tarih</div>
          <div className="col-span-1">İşlem</div>
          <div className="col-span-2">Modül</div>
          <div className="col-span-2">Kaynak</div>
          <div className="col-span-3">Tenant</div>
          <div className="col-span-2">Kullanıcı</div>
        </div>

        {isLoading ? (
          <div className="py-16 text-center text-sm text-slate-600">Yükleniyor…</div>
        ) : !data || data.data.length === 0 ? (
          <div className="py-16 text-center">
            <FileText className="w-6 h-6 text-slate-700 mx-auto mb-2" />
            <p className="text-sm text-slate-600">Kayıt bulunamadı</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-800/40">
            {data.data.map((log) => {
              const action = ACTION_MAP[String(log.action)] ?? ACTION_MAP.OTHER;
              const tenant = tenants.find((t) => t.id === String(log.tenantId));

              return (
                <div key={String(log.id)} className="grid grid-cols-12 gap-2 px-5 py-2.5 items-center hover:bg-slate-800/20 transition-colors text-xs">
                  <div className="col-span-2 text-slate-400 tabular-nums">
                    {new Date(String(log.createdAt)).toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                  </div>
                  <div className="col-span-1">
                    <Badge variant={action.variant}>{action.label}</Badge>
                  </div>
                  <div className="col-span-2 text-slate-400">{String(log.module)}</div>
                  <div className="col-span-2 text-slate-500 font-mono text-[10px]">{String(log.entityType)}</div>
                  <div className="col-span-3">
                    {tenant ? (
                      <span className="text-slate-300 text-xs">{tenant.companyName}</span>
                    ) : (
                      <span className="text-slate-600 font-mono text-[10px]">{String(log.tenantId).slice(0, 16)}…</span>
                    )}
                  </div>
                  <div className="col-span-2 text-slate-600 font-mono text-[10px] truncate">
                    {log.userId ? String(log.userId).slice(0, 12) + '…' : '—'}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Pagination ──────────────────────────── */}
      {data && data.meta.totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}
            className="px-3 py-1.5 rounded-lg text-xs text-slate-500 hover:text-white hover:bg-slate-800 disabled:opacity-30 transition-colors">← Önceki</button>
          <span className="text-xs text-slate-500 tabular-nums">{page} / {data.meta.totalPages}</span>
          <button onClick={() => setPage((p) => Math.min(data.meta.totalPages, p + 1))} disabled={page === data.meta.totalPages}
            className="px-3 py-1.5 rounded-lg text-xs text-slate-500 hover:text-white hover:bg-slate-800 disabled:opacity-30 transition-colors">Sonraki →</button>
        </div>
      )}
    </div>
  );
}
