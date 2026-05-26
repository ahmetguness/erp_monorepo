'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Pin, Save, Trash2, TrendingDown, TrendingUp, Package, Users } from 'lucide-react';
import { PageHeader } from '@/components/shared/PageHeader';
import { DataTable, type ColumnDef } from '@/components/shared/DataTable';
import { Button } from '@/components/ui/Button';
import { DatePicker } from '@/components/ui/DatePicker';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { FormRow } from '@/components/shared/FormField';
import { FeatureGate } from '@/components/shared/FeatureGate';
import { useUIStore } from '@/store/ui.store';
import { getErrorMessage } from '@/types/api.types';
import {
  getRevenueSummary, getExpenseSummary, getStockSummary, getContactBalance,
  getSavedReports, deleteSavedReport, createSavedReport, getReportingRegistry, previewKpi,
  KpiReportConfigSchema,
  type KpiPreview,
  type KpiReportConfig,
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

const DEFAULT_KPI_CONFIG: KpiReportConfig = {
  reportType: 'KPI',
  dataset: 'invoices',
  metric: 'salesRevenue',
  groupBy: null,
  dateRangePreset: 'THIS_MONTH',
  dateFrom: null,
  dateTo: null,
  chartType: 'number',
  pinnedToDashboard: true,
  scheduleEmail: { enabled: false, frequency: 'WEEKLY', recipients: [] },
};

function parseKpiConfig(value: Record<string, unknown>): KpiReportConfig | null {
  const parsed = KpiReportConfigSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

function scheduleLabel(config: KpiReportConfig): string {
  if (!config.scheduleEmail.enabled) return 'Zamanlama yok';
  const frequency: Record<KpiReportConfig['scheduleEmail']['frequency'], string> = {
    DAILY: 'Günlük',
    WEEKLY: 'Haftalık',
    MONTHLY: 'Aylık',
  };
  return `${frequency[config.scheduleEmail.frequency]} e-posta`;
}

function isDateRangePreset(value: string): value is KpiReportConfig['dateRangePreset'] {
  return value === 'THIS_MONTH' || value === 'LAST_30_DAYS' || value === 'THIS_YEAR' || value === 'CUSTOM';
}

function isScheduleFrequency(value: string): value is KpiReportConfig['scheduleEmail']['frequency'] {
  return value === 'DAILY' || value === 'WEEKLY' || value === 'MONTHLY';
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
  const [kpiName, setKpiName] = useState('Aylık satış geliri');
  const [kpiConfig, setKpiConfig] = useState<KpiReportConfig>(DEFAULT_KPI_CONFIG);
  const [kpiPreview, setKpiPreview] = useState<KpiPreview | null>(null);

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
    queryFn: async () => {
      try {
        return await getSavedReports();
      } catch {
        return [];
      }
    },
  });

  const { data: registry } = useQuery({
    queryKey: ['reports', 'registry'],
    queryFn: async () => {
      try {
        return await getReportingRegistry();
      } catch {
        return { datasets: [], chartTypes: [] };
      }
    },
  });

  const selectedDataset = registry?.datasets.find((dataset) => dataset.key === kpiConfig.dataset);

  const deleteReport = useMutation({
    mutationFn: (id: string) => deleteSavedReport(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['reports', 'saved'] }); toast.success('Rapor silindi.'); },
    onError: (e: unknown) => toast.error(getErrorMessage(e)),
  });

  const previewKpiMutation = useMutation({
    mutationFn: (config: KpiReportConfig) => previewKpi(config),
    onSuccess: (preview) => setKpiPreview(preview),
    onError: (e: unknown) => toast.error(getErrorMessage(e)),
  });

  const createKpiReport = useMutation({
    mutationFn: () => createSavedReport({ name: kpiName, module: 'reporting', filters: kpiConfig, columns: [kpiConfig.metric], isShared: kpiConfig.pinnedToDashboard }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['reports', 'saved'] });
      qc.invalidateQueries({ queryKey: ['reports', 'pinned-kpi'] });
      toast.success('KPI kaydedildi.');
    },
    onError: (e: unknown) => toast.error(getErrorMessage(e)),
  });

  const savedColumns: ColumnDef<SavedReport>[] = [
    {
      key: 'name',
      header: 'Ad',
      render: (r) => {
        const config = parseKpiConfig(r.filters);
        return (
          <div>
            <span className="text-slate-200 font-medium">{r.name}</span>
            {config && <p className="mt-1 text-xs text-slate-500">{config.dataset} / {config.metric} · {scheduleLabel(config)}</p>}
          </div>
        );
      },
    },
    { key: 'module', header: 'Modül', width: '120px', render: (r) => <span className="text-slate-400 text-sm capitalize">{r.module}</span> },
    {
      key: 'pin',
      header: 'Dashboard',
      width: '120px',
      render: (r) => {
        const config = parseKpiConfig(r.filters);
        return config?.pinnedToDashboard ? (
          <span className="inline-flex items-center gap-1 rounded-lg border border-sky-500/20 bg-sky-500/10 px-2 py-1 text-xs font-medium text-sky-300">
            <Pin className="h-3 w-3" /> Sabit
          </span>
        ) : <span className="text-xs text-slate-600">-</span>;
      },
    },
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
          <DatePicker label="Başlangıç" value={dateFrom} onValueChange={(value) => setDateFrom(value ?? '')} />
          <DatePicker label="Bitiş" value={dateTo} onValueChange={(value) => setDateTo(value ?? '')} />
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

      <FeatureGate feature="customReporting">
        <div className="rounded-xl border border-slate-800 bg-slate-900 p-5">
          <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-sm font-semibold text-white">KPI Builder</h2>
              <p className="text-xs text-slate-500">Dataset, metrik, grafik ve dashboard pin ayarını tek kayıtta yönetin.</p>
            </div>
            {kpiPreview && (
              <div className="rounded-xl border border-sky-500/20 bg-sky-500/10 px-4 py-2 text-right">
                <p className="text-xs text-sky-300">{kpiPreview.metricLabel}</p>
                <p className="text-lg font-semibold text-white">{kpiPreview.formattedValue}</p>
              </div>
            )}
          </div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-slate-300">KPI adı</span>
              <input
                value={kpiName}
                onChange={(event) => setKpiName(event.target.value)}
                className="h-10 rounded-xl border border-slate-700 bg-slate-950/35 px-3 text-sm text-white outline-none focus:border-sky-500/60"
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-slate-300">Dataset</span>
              <select
                value={kpiConfig.dataset}
                onChange={(event) => {
                  const dataset = registry?.datasets.find((item) => item.key === event.target.value);
                  if (!dataset) return;
                  setKpiConfig((current) => ({ ...current, dataset: dataset.key, metric: dataset.metrics[0]?.key ?? current.metric, groupBy: null }));
                  setKpiPreview(null);
                }}
                className="h-10 rounded-xl border border-slate-700 bg-slate-950/35 px-3 text-sm text-white outline-none focus:border-sky-500/60"
              >
                {registry?.datasets.map((dataset) => <option key={dataset.key} value={dataset.key}>{dataset.label}</option>)}
              </select>
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-slate-300">Metrik</span>
              <select
                value={kpiConfig.metric}
                onChange={(event) => {
                  setKpiConfig((current) => ({ ...current, metric: event.target.value }));
                  setKpiPreview(null);
                }}
                className="h-10 rounded-xl border border-slate-700 bg-slate-950/35 px-3 text-sm text-white outline-none focus:border-sky-500/60"
              >
                {selectedDataset?.metrics.map((metric) => <option key={metric.key} value={metric.key}>{metric.label}</option>)}
              </select>
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-slate-300">Grafik</span>
              <select
                value={kpiConfig.chartType}
                onChange={(event) => {
                  const chartType = registry?.chartTypes.find((item) => item.key === event.target.value)?.key;
                  if (chartType) setKpiConfig((current) => ({ ...current, chartType }));
                }}
                className="h-10 rounded-xl border border-slate-700 bg-slate-950/35 px-3 text-sm text-white outline-none focus:border-sky-500/60"
              >
                {registry?.chartTypes.map((chart) => <option key={chart.key} value={chart.key}>{chart.label}</option>)}
              </select>
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-slate-300">Tarih</span>
              <select
                value={kpiConfig.dateRangePreset}
                onChange={(event) => {
                  const { value } = event.target;
                  if (isDateRangePreset(value)) setKpiConfig((current) => ({ ...current, dateRangePreset: value }));
                  setKpiPreview(null);
                }}
                className="h-10 rounded-xl border border-slate-700 bg-slate-950/35 px-3 text-sm text-white outline-none focus:border-sky-500/60"
              >
                <option value="THIS_MONTH">Bu ay</option>
                <option value="LAST_30_DAYS">Son 30 gün</option>
                <option value="THIS_YEAR">Bu yıl</option>
                <option value="CUSTOM">Özel</option>
              </select>
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-slate-300">Başlangıç</span>
              <input
                type="date"
                value={kpiConfig.dateFrom ?? ''}
                disabled={kpiConfig.dateRangePreset !== 'CUSTOM'}
                onChange={(event) => setKpiConfig((current) => ({ ...current, dateFrom: event.target.value || null }))}
                className="h-10 rounded-xl border border-slate-700 bg-slate-950/35 px-3 text-sm text-white outline-none focus:border-sky-500/60 disabled:opacity-50"
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-slate-300">Bitiş</span>
              <input
                type="date"
                value={kpiConfig.dateTo ?? ''}
                disabled={kpiConfig.dateRangePreset !== 'CUSTOM'}
                onChange={(event) => setKpiConfig((current) => ({ ...current, dateTo: event.target.value || null }))}
                className="h-10 rounded-xl border border-slate-700 bg-slate-950/35 px-3 text-sm text-white outline-none focus:border-sky-500/60 disabled:opacity-50"
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-slate-300">E-posta sıklığı</span>
              <select
                value={kpiConfig.scheduleEmail.frequency}
                onChange={(event) => {
                  const { value } = event.target;
                  if (isScheduleFrequency(value)) setKpiConfig((current) => ({ ...current, scheduleEmail: { ...current.scheduleEmail, frequency: value, enabled: true } }));
                }}
                className="h-10 rounded-xl border border-slate-700 bg-slate-950/35 px-3 text-sm text-white outline-none focus:border-sky-500/60"
              >
                <option value="DAILY">Günlük</option>
                <option value="WEEKLY">Haftalık</option>
                <option value="MONTHLY">Aylık</option>
              </select>
            </label>
          </div>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap gap-4 text-xs text-slate-400">
              <label className="inline-flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={kpiConfig.pinnedToDashboard}
                  onChange={(event) => setKpiConfig((current) => ({ ...current, pinnedToDashboard: event.target.checked }))}
                  className="h-4 w-4 rounded border-slate-700 bg-slate-950"
                />
                Dashboarda sabitle
              </label>
              <label className="inline-flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={kpiConfig.scheduleEmail.enabled}
                  onChange={(event) => setKpiConfig((current) => ({ ...current, scheduleEmail: { ...current.scheduleEmail, enabled: event.target.checked } }))}
                  className="h-4 w-4 rounded border-slate-700 bg-slate-950"
                />
                Zamanlanmış e-posta
              </label>
            </div>
            <div className="flex gap-2">
              <Button variant="secondary" leftIcon={<TrendingUp className="h-4 w-4" />} loading={previewKpiMutation.isPending} onClick={() => previewKpiMutation.mutate(kpiConfig)}>
                Önizle
              </Button>
              <Button leftIcon={<Save className="h-4 w-4" />} loading={createKpiReport.isPending} disabled={!kpiName.trim()} onClick={() => createKpiReport.mutate()}>
                KPI kaydet
              </Button>
            </div>
          </div>
        </div>
      </FeatureGate>

      {/* Saved reports */}
      <FeatureGate feature="customReporting">
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
      </FeatureGate>

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
