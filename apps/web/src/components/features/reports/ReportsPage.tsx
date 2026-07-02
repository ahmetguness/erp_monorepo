'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Download, Pin, Save, Trash2, TrendingDown, TrendingUp, Package, Users, Coins, BarChart3, Lock, Share2, Mail, Calendar, Shield } from 'lucide-react';
import { PageHeader } from '@/components/shared/PageHeader';
import { usePlanFeatures } from '@/hooks/usePlanFeatures';
import { CashflowForecastPanel } from './CashflowForecastPanel';
import { DataTable, type ColumnDef } from '@/components/shared/DataTable';
import { Button } from '@/components/ui/Button';
import { DatePicker } from '@/components/ui/DatePicker';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { FormRow } from '@/components/shared/FormField';
import { FeatureGate } from '@/components/shared/FeatureGate';
import { Modal } from '@/components/ui/Modal';
import { useUIStore } from '@/store/ui.store';
import { useRoles } from '@/hooks/useRoles';
import { useTenantUsers } from '@/hooks/useUsers';
import { getErrorMessage } from '@/types/api.types';
import {
  getRevenueSummary, getExpenseSummary, getStockSummary, getContactBalance,
  getSavedReports, deleteSavedReport, createSavedReport, getReportingRegistry, previewKpi, recordSavedReportExportAudit,
  getCollectionList, updateSavedReport,
  KpiReportConfigSchema,
  type KpiPreview,
  type KpiReportConfig,
  type SavedReport,
  type CollectionList,
  type StockSummary,
  type ContactBalance,
} from '@/services/reporting.service';
import { cn, formatCurrency, formatDate, todayInputDate } from '@/lib/utils';

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

function isDateRangePreset(value: unknown): value is 'THIS_MONTH' | 'LAST_30_DAYS' | 'THIS_YEAR' | 'CUSTOM' {
  return typeof value === 'string' && ['THIS_MONTH', 'LAST_30_DAYS', 'THIS_YEAR', 'CUSTOM'].includes(value);
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

type CollectionPaymentItem = CollectionList['payments'][number];
type StockReportItem = StockSummary['belowMinStock'][number];
type ContactReportItem = ContactBalance['contacts'][number];

// ─────────────────────────────────────────────
// Reports Page
// ─────────────────────────────────────────────

export function ReportsPage() {
  const router = useRouter();
  const { isStarter } = usePlanFeatures();
  const qc = useQueryClient();
  const { toast } = useUIStore();
  const defaultRange = getDefaultRange();
  const [dateFrom, setDateFrom] = useState(defaultRange.from);
  const [dateTo, setDateTo] = useState(defaultRange.to);
  const [deleteTarget, setDeleteTarget] = useState<SavedReport | null>(null);
  const [kpiName, setKpiName] = useState('Aylık satış geliri');
  const [kpiConfig, setKpiConfig] = useState<KpiReportConfig>(DEFAULT_KPI_CONFIG);
  const [kpiPreview, setKpiPreview] = useState<KpiPreview | null>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'collections' | 'stock' | 'contacts' | 'cashflow'>('overview');

  const [shareTarget, setShareTarget] = useState<SavedReport | null>(null);
  const [shareRoles, setShareRoles] = useState<string[]>([]);
  const [shareUsers, setShareUsers] = useState<string[]>([]);
  const [sharePublic, setSharePublic] = useState<boolean>(false);

  // Queries for users and roles to populate selectors
  const { data: usersData } = useTenantUsers();
  const users = usersData ?? [];
  const { data: rolesData } = useRoles({ limit: 100 });
  const roles = rolesData?.data ?? [];

  const updateReport = useMutation({
    mutationFn: ({ id, data }: { id: string; data: { name?: string; filters?: Record<string, unknown>; columns?: string[]; isShared?: boolean } }) =>
      updateSavedReport(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['reports', 'saved'] });
      toast.success('Rapor paylaşım ayarları güncellendi.');
      setShareTarget(null);
    },
    onError: (e: unknown) => toast.error(getErrorMessage(e)),
  });

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

  const { data: stock, isLoading: loadingStock } = useQuery({
    queryKey: ['reports', 'stock'],
    queryFn: getStockSummary,
  });

  const { data: contactBalance, isLoading: loadingContactBalance } = useQuery({
    queryKey: ['reports', 'contact-balance'],
    queryFn: getContactBalance,
  });

  const { data: collectionList, isLoading: loadingCollections } = useQuery({
    queryKey: ['reports', 'collections', dateFrom, dateTo],
    queryFn: () => getCollectionList(dateFrom, dateTo),
    enabled: !!dateFrom && !!dateTo,
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
        return {
          datasets: [],
          chartTypes: [],
          capabilities: {
            savedKpi: false,
            dashboardPinning: false,
            scheduledReportEmail: false,
            exportAudit: false,
            permissionAwareDatasetFields: false,
          },
        };
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

  const recordExportAudit = useMutation({
    mutationFn: (id: string) => recordSavedReportExportAudit(id),
    onSuccess: () => toast.success('Export audit kaydı oluşturuldu.'),
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
            {config && <p className="mt-1 text-xs text-slate-500">{config.dataset} / {config.metric} · {config.scheduleEmail.enabled ? 'Zamanlanmış' : 'Zamanlama yok'}</p>}
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
      key: 'actions', header: '', width: '88px', align: 'right',
      render: (r) => (
        <div className="flex justify-end gap-1">
          <button
            aria-label="Paylaş ve Zamanla"
            onClick={(e) => {
              e.stopPropagation();
              setShareTarget(r);
              setSharePublic(r.isShared);
              setShareRoles((r.filters.sharedRoles as string[]) ?? []);
              setShareUsers((r.filters.sharedUsers as string[]) ?? []);
            }}
            className="p-1.5 rounded-lg text-slate-500 hover:text-amber-400 hover:bg-amber-500/10 transition-colors"
            title="Paylaşım & Zamanlama Ayarları"
          >
            <Share2 className="w-3.5 h-3.5" />
          </button>
          <button
            aria-label="Export audit"
            onClick={(e) => { e.stopPropagation(); recordExportAudit.mutate(r.id); }}
            className="p-1.5 rounded-lg text-slate-500 hover:text-sky-400 hover:bg-sky-500/10 transition-colors"
          >
            <Download className="w-3.5 h-3.5" />
          </button>
          <button onClick={(e) => { e.stopPropagation(); setDeleteTarget(r); }}
            className="p-1.5 rounded-lg text-slate-500 hover:text-red-400 hover:bg-red-500/10 transition-colors">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      ),
    },
  ];

  const collectionColumns: ColumnDef<CollectionPaymentItem>[] = [
    { key: 'contact', header: 'Cari', render: (r) => <span className="text-slate-200 font-medium">{r.contact?.name}</span> },
    {
      key: 'account',
      header: 'Hesap',
      render: (r) => <span className="text-slate-400 text-xs">{r.bankAccount?.name ?? r.cashAccount?.name ?? '—'}</span>,
    },
    { key: 'date', header: 'Tarih', width: '120px', render: (r) => <span className="text-slate-400 text-xs">{formatDate(r.date)}</span> },
    { key: 'description', header: 'Açıklama', render: (r) => <span className="text-slate-400 text-xs truncate max-w-xs">{r.description ?? '—'}</span> },
    {
      key: 'amount',
      header: 'Tutar',
      width: '150px',
      align: 'right',
      render: (r) => <span className="font-mono font-bold text-emerald-400">{formatCurrency(r.amount)}</span>,
    },
  ];

  const stockReportColumns: ColumnDef<StockReportItem>[] = [
    { key: 'productCode', header: 'Ürün Kodu', width: '120px', render: (r) => <span className="font-mono text-slate-400 text-xs">{r.productCode}</span> },
    { key: 'productName', header: 'Ürün Adı', render: (r) => <span className="text-slate-200 font-medium">{r.productName}</span> },
    { key: 'warehouseName', header: 'Depo', render: (r) => <span className="text-slate-400 text-xs">{r.warehouseName}</span> },
    {
      key: 'quantity',
      header: 'Stok Miktarı',
      width: '120px',
      align: 'right',
      render: (r) => <span className="font-mono text-red-400 font-bold">{r.quantity}</span>,
    },
    {
      key: 'minStockLevel',
      header: 'Kritik Seviye',
      width: '120px',
      align: 'right',
      render: (r) => <span className="font-mono text-slate-500 text-xs">{r.minStockLevel}</span>,
    },
  ];

  const contactReportColumns: ColumnDef<ContactReportItem>[] = [
    { key: 'code', header: 'Cari Kodu', width: '120px', render: (r) => <span className="font-mono text-slate-400 text-xs">{r.code ?? '—'}</span> },
    { key: 'name', header: 'Cari Adı', render: (r) => <span className="text-slate-200 font-medium">{r.name}</span> },
    {
      key: 'type',
      header: 'Tür',
      width: '100px',
      render: (r) => <span className="text-slate-400 text-xs uppercase">{r.type === 'CUSTOMER' ? 'Müşteri' : r.type === 'SUPPLIER' ? 'Tedarikçi' : 'Diğer'}</span>,
    },
    {
      key: 'balance',
      header: 'Bakiye',
      width: '150px',
      align: 'right',
      render: (r) => {
        const val = Number(r.balance);
        return (
          <span className={cn('font-mono font-bold', val > 0 ? 'text-emerald-400' : val < 0 ? 'text-red-400' : 'text-slate-400')}>
            {val > 0 ? '+' : ''}{formatCurrency(val)}
          </span>
        );
      },
    },
    { key: 'lastEntryDate', header: 'Son İşlem', width: '120px', render: (r) => <span className="text-slate-500 text-xs">{r.lastEntryDate ? formatDate(r.lastEntryDate) : '—'}</span> },
  ];

  const profit = (revenue?.totalGross ?? 0) - (expense?.totalGross ?? 0);

  return (
    <div className="space-y-6">
      <PageHeader title="Raporlar" subtitle="İşletmenizin finansal ve operasyonel özetleri." />

      {/* Tabs */}
      <div className="flex gap-2 border-b border-slate-800 pb-px">
        {[
          { id: 'overview', label: 'Finansal Özet', icon: BarChart3, locked: false },
          { id: 'collections', label: 'Tahsilat Listesi', icon: Coins, locked: false },
          { id: 'stock', label: 'Kritik Stok Raporu', icon: Package, locked: false },
          { id: 'contacts', label: 'Cari Bakiye Raporu', icon: Users, locked: false },
          { id: 'cashflow', label: 'Nakit Akış Tahmini', icon: Coins, locked: isStarter },
        ].map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as typeof activeTab)}
              className={cn(
                'flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-all outline-none',
                activeTab === tab.id
                  ? 'border-sky-500 text-sky-400 font-semibold bg-sky-500/5 rounded-t-lg'
                  : 'border-transparent text-slate-400 hover:text-slate-200'
              )}
            >
              <Icon className="w-4 h-4" />
              {tab.label}
              {tab.locked && <Lock className="w-3 h-3 text-amber-500 shrink-0 ml-0.5" />}
            </button>
          );
        })}
      </div>

      {activeTab === 'overview' && (
        <div className="space-y-6">
          {/* Date range filter */}
          <div className="flex flex-wrap items-end gap-3 bg-slate-900/40 p-4 border border-slate-800 rounded-xl">
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

          {/* Cari bakiye ve stok özet */}
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

              {stock && stock.belowMinStock.length > 0 && (
                <div className="bg-amber-950/30 border border-amber-800/40 rounded-xl p-5">
                  <h3 className="text-sm font-semibold text-amber-300 mb-3">Kritik Stok Önizleme ({stock.belowMinStock.length})</h3>
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
                    value={selectedDataset?.key ?? ''}
                    onChange={(event) => {
                      const dataset = registry?.datasets.find((item) => item.key === event.target.value);
                      if (!dataset) return;
                      setKpiConfig((current) => ({ ...current, dataset: dataset.key, metric: dataset.metrics[0]?.key ?? current.metric, groupBy: null }));
                      setKpiPreview(null);
                    }}
                    className="h-10 rounded-xl border border-slate-700 bg-slate-950/35 px-3 text-sm text-white outline-none focus:border-sky-500/60"
                  >
                    {!selectedDataset && <option value="" disabled>Dataset seçin</option>}
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
                  <span className="text-xs font-medium text-slate-300">Gruplama</span>
                  <select
                    value={kpiConfig.groupBy ?? ''}
                    onChange={(event) => {
                      setKpiConfig((current) => ({ ...current, groupBy: event.target.value || null }));
                      setKpiPreview(null);
                    }}
                    className="h-10 rounded-xl border border-slate-700 bg-slate-950/35 px-3 text-sm text-white outline-none focus:border-sky-500/60"
                  >
                    <option value="">Gruplama yok</option>
                    {selectedDataset?.groupBy.map((group) => <option key={group.key} value={group.key}>{group.label}</option>)}
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
                  <Button variant="secondary" leftIcon={<TrendingUp className="h-4 w-4" />} loading={previewKpiMutation.isPending} disabled={!selectedDataset} onClick={() => previewKpiMutation.mutate(kpiConfig)}>
                    Önizle
                  </Button>
                  <Button leftIcon={<Save className="h-4 w-4" />} loading={createKpiReport.isPending} disabled={!kpiName.trim() || !selectedDataset} onClick={() => createKpiReport.mutate()}>
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
        </div>
      )}

      {activeTab === 'collections' && (
        <div className="space-y-6">
          {/* Date range filter */}
          <div className="flex flex-wrap items-end gap-3 bg-slate-900/40 p-4 border border-slate-800 rounded-xl">
            <FormRow cols={2} className="w-auto">
              <DatePicker label="Başlangıç" value={dateFrom} onValueChange={(value) => setDateFrom(value ?? '')} />
              <DatePicker label="Bitiş" value={dateTo} onValueChange={(value) => setDateTo(value ?? '')} />
            </FormRow>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <StatCard
              label="Toplam Tahsilat Tutarı"
              value={loadingCollections ? '…' : formatCurrency(collectionList?.summary.totalCollected ?? 0)}
              sub="Belirtilen tarih aralığındaki toplam tahsilatlar"
              icon={<Coins className="w-4 h-4 text-emerald-400" />}
              accent="bg-emerald-500/10"
            />
            <StatCard
              label="İşlem Sayısı"
              value={loadingCollections ? '…' : String(collectionList?.summary.count ?? 0)}
              sub="Toplam başarılı tahsilat makbuzu"
              icon={<TrendingUp className="w-4 h-4 text-sky-400" />}
              accent="bg-sky-500/10"
            />
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
            <h3 className="text-sm font-semibold text-white mb-4">Tahsilat İşlemleri Listesi</h3>
            <DataTable
              columns={collectionColumns}
              data={collectionList?.payments ?? []}
              keyExtractor={(r) => r.id}
              isLoading={loadingCollections}
              emptyTitle="Tahsilat kaydı bulunamadı"
              emptyDescription="Bu tarih aralığında kaydedilmiş tahsilat işlemi yok."
            />
          </div>
        </div>
      )}

      {activeTab === 'stock' && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4">
          <div>
            <h3 className="text-sm font-semibold text-white">Kritik Stok Seviyesindeki Ürünler</h3>
            <p className="text-xs text-slate-500 mt-1">Stok seviyesi belirlenen minimum sınırın altına düşen tüm ürünlerin listesi.</p>
          </div>
          <DataTable
            columns={stockReportColumns}
            data={stock?.belowMinStock ?? []}
            keyExtractor={(r) => r.productId + r.warehouseName}
            isLoading={loadingStock}
            emptyTitle="Kritik stokta ürün yok"
            emptyDescription="Harika! Tüm ürünlerinizin stok miktarı minimum limitlerin üzerinde."
          />
        </div>
      )}

      {activeTab === 'contacts' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <StatCard
              label="Toplam Alacaklar"
              value={loadingContactBalance ? '…' : formatCurrency(contactBalance?.summary.totalReceivable ?? 0)}
              sub="Müşterilerden beklenen toplam ödemeler"
              icon={<TrendingUp className="w-4 h-4 text-emerald-400" />}
              accent="bg-emerald-500/10"
            />
            <StatCard
              label="Toplam Borçlar"
              value={loadingContactBalance ? '…' : formatCurrency(contactBalance?.summary.totalPayable ?? 0)}
              sub="Tedarikçilere yapılacak toplam ödemeler"
              icon={<TrendingDown className="w-4 h-4 text-red-400" />}
              accent="bg-red-500/10"
            />
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
            <h3 className="text-sm font-semibold text-white mb-4">Cari Bakiyeler Listesi</h3>
            <DataTable
              columns={contactReportColumns}
              data={contactBalance?.contacts ?? []}
              keyExtractor={(r) => r.contactId}
              isLoading={loadingContactBalance}
              emptyTitle="Cari bakiye kaydı bulunamadı"
              emptyDescription="Sistemde bakiye kaydı bulunan cari hesap yok."
            />
          </div>
        </div>
      )}

      {activeTab === 'cashflow' && isStarter && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 max-w-2xl mx-auto text-center space-y-6 my-10 relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-violet-600/5 to-sky-600/5 pointer-events-none" />
          <div className="w-16 h-16 bg-amber-500/10 border border-amber-500/20 text-amber-500 rounded-full flex items-center justify-center mx-auto shadow-lg">
            <Lock className="w-8 h-8" />
          </div>
          <div className="space-y-2">
            <h3 className="text-xl font-bold text-white">Gelişmiş Nakit Akışı Tahmini</h3>
            <p className="text-xs text-slate-400 max-w-md mx-auto">
              Professional paket ile açılır. Vadesi gelen alacak/borç, çek/senet ve banka hareketlerinden 30/60/90 günlük otomatik projeksiyon ve nakit akış analizi.
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-left max-w-lg mx-auto pt-2">
            <div className="bg-slate-950/40 p-3 rounded-xl border border-slate-800/60 text-xs">
              <span className="font-bold text-slate-300 block mb-1">30/60/90 Günlük Tahmin</span>
              <p className="text-slate-500 text-[10px] leading-relaxed">Gelecek 3 aydaki tüm likit durumunuzu otomatik öngörün.</p>
            </div>
            <div className="bg-slate-950/40 p-3 rounded-xl border border-slate-800/60 text-xs">
              <span className="font-bold text-slate-300 block mb-1">Çek / Senet Entegrasyonu</span>
              <p className="text-slate-500 text-[10px] leading-relaxed">Portföyünüzdeki çek ve senetlerin vade tarihlerini nakit akışına dahil edin.</p>
            </div>
            <div className="bg-slate-950/40 p-3 rounded-xl border border-slate-800/60 text-xs">
              <span className="font-bold text-slate-300 block mb-1">Anlık Banka & Kasa</span>
              <p className="text-slate-500 text-[10px] leading-relaxed">Banka hareketlerinize ve kasa bakiyelerinize göre başlangıç likiditesini güncelleyin.</p>
            </div>
          </div>
          <div className="pt-4">
            <button
              onClick={() => router.push('/dashboard/upgrade-preview?feature=Gelişmiş Nakit Akışı Tahmini')}
              className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl font-medium text-sm text-white bg-gradient-to-r from-sky-500 to-sky-600 hover:from-sky-400 hover:to-sky-500 shadow-lg shadow-sky-500/20 active:scale-[0.98] transition-all"
            >
              Professional Plana Yükselt
            </button>
          </div>
        </div>
      )}

      {activeTab === 'cashflow' && !isStarter && (
        <CashflowForecastPanel />
      )}

      <ConfirmDialog
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => deleteReport.mutate(deleteTarget!.id, { onSuccess: () => setDeleteTarget(null) })}
        message={`"${deleteTarget?.name}" raporunu silmek istediğinize emin misiniz?`}
        isLoading={deleteReport.isPending}
      />

      {/* ── Share & Schedule Modal ── */}
      <Modal
        isOpen={!!shareTarget}
        onClose={() => setShareTarget(null)}
        title="Rapor Paylaşım & Zamanlama Ayarları"
        description="Özel raporların kullanıcı/rol bazlı paylaşımını ve e-posta zamanlamalarını düzenleyin."
        size="md"
        footer={
          <>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShareTarget(null)}
            >
              İptal
            </Button>
            <Button
              size="sm"
              loading={updateReport.isPending}
              onClick={() => {
                if (!shareTarget) return;
                const originalFilters = shareTarget.filters;
                const updatedFilters = {
                  ...originalFilters,
                  sharedRoles: shareRoles,
                  sharedUsers: shareUsers,
                };
                updateReport.mutate({
                  id: shareTarget.id,
                  data: {
                    isShared: sharePublic,
                    filters: updatedFilters,
                  },
                });
              }}
            >
              Değişiklikleri Kaydet
            </Button>
          </>
        }
      >
        <div className="space-y-6">
          {/* Bölüm 1: Paylaşım Ayarları */}
          <div className="space-y-4">
            <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
              <Share2 className="w-3.5 h-3.5" />
              Erişim & Paylaşım Yetkileri
            </h4>

            <div className="bg-slate-950/40 border border-slate-800 rounded-xl p-4 space-y-4">
              <label className="flex items-center gap-2 text-sm text-slate-300 font-medium cursor-pointer">
                <input
                  type="checkbox"
                  checked={sharePublic}
                  onChange={(e) => setSharePublic(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-700 bg-slate-900"
                />
                Herkese Açık (Tüm tenant ile paylaş)
              </label>

              <div className="space-y-3 pt-2 border-t border-slate-800/60">
                <div className="space-y-1.5">
                  <span className="text-xs text-slate-400 font-medium">Rol Yetkilendirmesi</span>
                  <div className="flex flex-wrap gap-2 max-h-24 overflow-y-auto bg-slate-900/50 p-2.5 rounded-lg border border-slate-850">
                    {roles.length === 0 ? (
                      <span className="text-slate-500 text-[11px]">Rol bulunamadı.</span>
                    ) : (
                      roles.map((role) => {
                        const isSelected = shareRoles.includes(role.id);
                        return (
                          <button
                            key={role.id}
                            type="button"
                            onClick={() => {
                              setShareRoles((prev) =>
                                isSelected ? prev.filter((r) => r !== role.id) : [...prev, role.id]
                              );
                            }}
                            className={cn(
                              "inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium transition-all border",
                              isSelected
                                ? "bg-sky-500/10 border-sky-500/30 text-sky-400"
                                : "bg-slate-800 border-slate-750 text-slate-400 hover:border-slate-700"
                            )}
                          >
                            <Shield className="w-3 h-3" />
                            {role.name}
                          </button>
                        );
                      })
                    )}
                  </div>
                </div>

                <div className="space-y-1.5 pt-2">
                  <span className="text-xs text-slate-400 font-medium">Kullanıcı Bazlı Yetkilendirme</span>
                  <div className="flex flex-col gap-1.5 max-h-32 overflow-y-auto bg-slate-900/50 p-2.5 rounded-lg border border-slate-850">
                    {users.length === 0 ? (
                      <span className="text-slate-500 text-[11px]">Kullanıcı bulunamadı.</span>
                    ) : (
                      users.map((user) => {
                        const isSelected = shareUsers.includes(user.userId);
                        return (
                          <label key={user.id} className="flex items-center gap-2 text-[11px] text-slate-300 font-medium cursor-pointer hover:text-white transition-colors">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => {
                                setShareUsers((prev) =>
                                  isSelected ? prev.filter((u) => u !== user.userId) : [...prev, user.userId]
                                );
                              }}
                              className="h-3.5 w-3.5 rounded border-slate-700 bg-slate-900"
                            />
                            {user.user.name} <span className="text-slate-500 font-normal">({user.user.email})</span>
                          </label>
                        );
                      })
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Bölüm 2: E-posta Zamanlama (Enterprise Upgrade Path) */}
          <div className="space-y-3">
            <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
              <Mail className="w-3.5 h-3.5" />
              Zamanlanmış Rapor Gönderimi
            </h4>

            <div className="bg-slate-950/40 border border-slate-800 rounded-xl p-4 space-y-4 relative overflow-hidden">
              <div className="flex items-start gap-2.5 text-xs text-amber-500/90 bg-amber-500/10 border border-amber-500/20 p-3 rounded-lg leading-relaxed">
                <Lock className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                <div>
                  <span className="font-bold block mb-0.5">Enterprise Özelliği</span>
                  Periyodik e-posta gönderimi ve rapor zamanlama özellikleri yalnızca **Enterprise** planında yer alan kurumsal mail entegrasyonu ile kullanılabilir.
                </div>
              </div>

              <div className="opacity-40 pointer-events-none space-y-3 select-none">
                <label className="flex items-center gap-2 text-xs text-slate-300 font-medium">
                  <input type="checkbox" checked={false} readOnly className="h-4 w-4 rounded border-slate-700 bg-slate-900" />
                  E-posta raporlamasını etkinleştir
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <span className="text-[10px] text-slate-500">Gönderim Sıklığı</span>
                    <div className="h-8 rounded bg-slate-900 border border-slate-800" />
                  </div>
                  <div className="space-y-1">
                    <span className="text-[10px] text-slate-500">Gönderim Saati</span>
                    <div className="h-8 rounded bg-slate-900 border border-slate-800" />
                  </div>
                </div>
              </div>

              <div className="pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setShareTarget(null);
                    router.push('/dashboard/upgrade-preview?feature=Rapor Zamanlama ve Enterprise Mail Entegrasyonu');
                  }}
                  className="w-full text-center py-2 rounded-lg text-xs font-bold text-sky-400 bg-sky-500/10 border border-sky-500/20 hover:bg-sky-500/20 transition-all duration-200"
                >
                  Enterprise Plana Yükselt
                </button>
              </div>
            </div>
          </div>
        </div>
      </Modal>
    </div>
  );
}
