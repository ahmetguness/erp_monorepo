'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { TrendingUp, TrendingDown, Package, Users, Trash2 } from 'lucide-react';
import { PageHeader } from '@/components/shared/PageHeader';
import { DataTable, type ColumnDef } from '@/components/shared/DataTable';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { FormRow } from '@/components/shared/FormField';
import { useUIStore } from '@/store/ui.store';
import { getErrorMessage } from '@/types/api.types';
import {
  getRevenueSummary, getExpenseSummary, getStockSummary, getContactBalance,
  getSavedReports, deleteSavedReport,
  type SavedReport,
} from '@/services/reporting.service';
import { formatCurrency, formatDate, todayInputDate } from '@/lib/utils';

// ─────────────────────────────────────────────
// Stat card
// ─────────────────────────────────────────────

function StatCard({ label, value, sub, icon, accent }: {
  label: string; value: string; sub?: string;
  icon: React.ReactNode; accent: string;
}) {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
      <div className="flex items-start justify-between mb-3">
        <p className="text-sm text-slate-400">{label}</p>
        <div className={`p-2 rounded-lg ${accent}`}>{icon}</div>
      </div>
      <p className="text-2xl font-semibold text-white">{value}</p>
      {sub && <p className="text-xs text-slate-500 mt-1">{sub}</p>}
    </div>
  );
}

// ─────────────────────────────────────────────
// Date range helper
// ─────────────────────────────────────────────

function getDefaultRange() {
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
  const to = todayInputDate();
  return { from, to };
}

// ─────────────────────────────────────────────
// Reports Page
// ─────────────────────────────────────────────

export function ReportsPage() {
  const qc = useQueryClient();
  const { toast } = useUIStore();
  const defaultRange = getDefaultRange();
  const [dateFrom, setDateFrom] = useState(defaultRange.from);
  const [dateTo, setDateTo] = useState(defaultRange.to);
  const [deleteTarget, setDeleteTarget] = useState<SavedReport | null>(null);

  const { data: revenue, isLoading: loadingRevenue } = useQuery({
    queryKey: ['reports', 'revenue', dateFrom, dateTo],
    queryFn: () => getRevenueSummary(dateFrom, dateTo),
    enabled: !!dateFrom && !!dateTo,
  });

  const { data: expense, isLoading: loadingExpense } = useQuery({
    queryKey: ['reports', 'expense', dateFrom, dateTo],
    queryFn: () => getExpenseSummary(dateFrom, dateTo),
    enabled: !!dateFrom && !!dateTo,
  });

  const { data: stock } = useQuery({
    queryKey: ['reports', 'stock'],
    queryFn: getStockSummary,
  });

  const { data: contactBalance } = useQuery({
    queryKey: ['reports', 'contact-balance'],
    queryFn: getContactBalance,
  });

  const { data: savedReports = [], isLoading: loadingSaved } = useQuery({
    queryKey: ['reports', 'saved'],
    queryFn: getSavedReports,
  });

  const deleteReport = useMutation({
    mutationFn: (id: string) => deleteSavedReport(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['reports', 'saved'] }); toast.success('Rapor silindi.'); },
    onError: (e: unknown) => toast.error(getErrorMessage(e)),
  });

  const savedColumns: ColumnDef<SavedReport>[] = [
    { key: 'name', header: 'Ad', render: (r) => <span className="text-slate-200 font-medium">{r.name}</span> },
    { key: 'module', header: 'Modül', width: '120px', render: (r) => <span className="text-slate-400 text-sm capitalize">{r.module}</span> },
    { key: 'createdAt', header: 'Oluşturulma', width: '120px', render: (r) => <span className="text-slate-400">{formatDate(r.createdAt)}</span> },
    {
      key: 'actions', header: '', width: '60px', align: 'right',
      render: (r) => (
        <button onClick={(e) => { e.stopPropagation(); setDeleteTarget(r); }}
          className="p-1.5 rounded-lg text-slate-500 hover:text-red-400 hover:bg-red-500/10 transition-colors">
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      ),
    },
  ];

  const profit = (revenue?.totalGross ?? 0) - (expense?.totalGross ?? 0);

  return (
    <div className="space-y-8">
      <PageHeader title="Raporlar" subtitle="İşletmenizin finansal ve operasyonel özetleri." />

      {/* Date range filter */}
      <div className="flex flex-wrap items-end gap-3">
        <FormRow cols={2} className="w-auto">
          <Input label="Başlangıç" type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
          <Input label="Bitiş" type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
        </FormRow>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard
          label="Gelir"
          value={loadingRevenue ? '…' : formatCurrency(revenue?.totalGross ?? 0)}
          sub={revenue ? `${revenue.invoiceCount} satış faturası` : undefined}
          icon={<TrendingUp className="w-4 h-4 text-emerald-400" />}
          accent="bg-emerald-500/10"
        />
        <StatCard
          label="Gider"
          value={loadingExpense ? '…' : formatCurrency(expense?.totalGross ?? 0)}
          sub={expense ? `${expense.invoiceCount} alış faturası` : undefined}
          icon={<TrendingDown className="w-4 h-4 text-red-400" />}
          accent="bg-red-500/10"
        />
        <StatCard
          label="Net Kar/Zarar"
          value={formatCurrency(profit)}
          sub={profit >= 0 ? 'Kârlı dönem' : 'Zararlı dönem'}
          icon={<TrendingUp className="w-4 h-4 text-sky-400" />}
          accent="bg-sky-500/10"
        />
        <StatCard
          label="Stok Değeri"
          value={stock ? formatCurrency(stock.summary.totalStockValue) : '—'}
          sub={stock ? `${stock.summary.belowMinStockCount} kritik ürün` : undefined}
          icon={<Package className="w-4 h-4 text-amber-400" />}
          accent="bg-amber-500/10"
        />
      </div>

      {/* Cari bakiye özeti */}
      {contactBalance && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
            <div className="flex items-center gap-2 mb-3">
              <Users className="w-4 h-4 text-sky-400" />
              <h3 className="text-sm font-semibold text-white">Cari Bakiye Özeti</h3>
            </div>
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-slate-400">Toplam Alacak</span>
                <span className="text-emerald-400 font-medium">{formatCurrency(contactBalance.summary.totalReceivable)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-400">Toplam Borç</span>
                <span className="text-red-400 font-medium">{formatCurrency(contactBalance.summary.totalPayable)}</span>
              </div>
              <div className="flex justify-between text-sm border-t border-slate-800 pt-2">
                <span className="text-slate-300 font-medium">Net Pozisyon</span>
                <span className={`font-semibold ${contactBalance.summary.totalReceivable - contactBalance.summary.totalPayable >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                  {formatCurrency(contactBalance.summary.totalReceivable - contactBalance.summary.totalPayable)}
                </span>
              </div>
            </div>
          </div>

          {/* Kritik stok */}
          {stock && stock.belowMinStock.length > 0 && (
            <div className="bg-amber-950/30 border border-amber-800/40 rounded-xl p-5">
              <h3 className="text-sm font-semibold text-amber-300 mb-3">Kritik Stok ({stock.belowMinStock.length})</h3>
              <div className="space-y-2">
                {stock.belowMinStock.slice(0, 5).map((item) => (
                  <div key={item.productId} className="flex items-center justify-between text-sm">
                    <div>
                      <p className="text-amber-200">{item.productName}</p>
                      <p className="text-xs text-amber-600">{item.warehouseName}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-red-400 font-medium">{item.quantity}</p>
                      <p className="text-xs text-amber-600">min: {item.minStockLevel}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Saved reports */}
      <div>
        <h2 className="text-sm font-semibold text-white mb-3">Kayıtlı Raporlar</h2>
        <DataTable
          columns={savedColumns}
          data={savedReports}
          keyExtractor={(r) => r.id}
          isLoading={loadingSaved}
          emptyTitle="Kayıtlı rapor yok"
          emptyDescription="Raporları kaydetmek için ilgili rapor sayfasından 'Kaydet' butonunu kullanın."
        />
      </div>

      <ConfirmDialog
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => deleteReport.mutate(deleteTarget!.id, { onSuccess: () => setDeleteTarget(null) })}
        message={`"${deleteTarget?.name}" raporunu silmek istediğinize emin misiniz?`}
        isLoading={deleteReport.isPending}
      />
    </div>
  );
}
