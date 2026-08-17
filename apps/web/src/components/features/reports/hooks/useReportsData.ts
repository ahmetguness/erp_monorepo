'use client';

import { useState } from 'react';
import type React from 'react';
import { useQueryClient, useQuery, useMutation } from '@tanstack/react-query';
import { usePlanFeatures } from '@/hooks/usePlanFeatures';
import { useUIStore } from '@/store/ui.store';
import { useRoles } from '@/hooks/useRoles';
import { useTenantUsers } from '@/hooks/useUsers';
import { getErrorMessage } from '@/types/api.types';
import type { TenantUser } from '@/services/user.service';
import {
  getRevenueSummary,
  getExpenseSummary,
  getStockSummary,
  getContactBalance,
  getSavedReports,
  deleteSavedReport,
  createSavedReport,
  getReportingRegistry,
  previewKpi,
  recordSavedReportExportAudit,
  getCollectionList,
  getTopProducts,
  updateSavedReport,
  runSavedReportSchedule,
  KpiReportConfigSchema,
  type KpiPreview,
  type KpiReportConfig,
  type SavedReport,
  type SavedReportMutationInput,
  type RevenueSummary,
  type StockSummary,
  type ContactBalance,
  type CollectionList,
  type TopProducts,
  type ReportingRegistry,
  type ReportingDatasetDefinition,
  type ReportExportAuditResult,
  type ReportScheduleDispatchResult,
} from '@/services/reporting.service';
import { todayInputDate } from '@/lib/utils';

// ─────────────────────────────────────────────
// Constants & helpers
// ─────────────────────────────────────────────

export type ReportTab =
  | 'overview'
  | 'collections'
  | 'stock'
  | 'contacts'
  | 'topProducts'
  | 'cashflow';

export const DEFAULT_KPI_CONFIG: KpiReportConfig = {
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

export function parseKpiConfig(value: Record<string, unknown>): KpiReportConfig | null {
  const parsed = KpiReportConfigSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

function getDefaultRange() {
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth(), 1)
    .toISOString()
    .split('T')[0];
  const to = todayInputDate();
  return { from, to };
}

export function isDateRangePreset(
  value: unknown,
): value is 'THIS_MONTH' | 'LAST_30_DAYS' | 'THIS_YEAR' | 'CUSTOM' {
  return (
    typeof value === 'string' &&
    ['THIS_MONTH', 'LAST_30_DAYS', 'THIS_YEAR', 'CUSTOM'].includes(value)
  );
}

// ─────────────────────────────────────────────
// Hook return type
// ─────────────────────────────────────────────

export interface UseReportsDataReturn {
  // Date range state
  dateFrom: string;
  dateTo: string;
  setDateFrom: (v: string) => void;
  setDateTo: (v: string) => void;

  // UI state
  activeTab: ReportTab;
  setActiveTab: (v: ReportTab) => void;
  deleteTarget: SavedReport | null;
  setDeleteTarget: (v: SavedReport | null) => void;

  // KPI builder state
  kpiName: string;
  setKpiName: React.Dispatch<React.SetStateAction<string>>;
  kpiConfig: KpiReportConfig;
  setKpiConfig: React.Dispatch<React.SetStateAction<KpiReportConfig>>;
  kpiPreview: KpiPreview | null;
  setKpiPreview: React.Dispatch<React.SetStateAction<KpiPreview | null>>;
  canSaveKpiReport: boolean;

  // Share / column state
  shareTarget: SavedReport | null;
  setShareTarget: React.Dispatch<React.SetStateAction<SavedReport | null>>;
  shareRoles: string[];
  setShareRoles: React.Dispatch<React.SetStateAction<string[]>>;
  shareUsers: string[];
  setShareUsers: React.Dispatch<React.SetStateAction<string[]>>;
  sharePublic: boolean;
  setSharePublic: React.Dispatch<React.SetStateAction<boolean>>;
  sharePinned: boolean;
  setSharePinned: React.Dispatch<React.SetStateAction<boolean>>;
  columnTemplateName: string;
  setColumnTemplateName: React.Dispatch<React.SetStateAction<string>>;
  selectedColumnKeys: string[];
  setSelectedColumnKeys: React.Dispatch<React.SetStateAction<string[]>>;

  // Selectors
  users: TenantUser[];
  roles: { id: string; name: string }[];
  selectedDataset: ReportingDatasetDefinition | undefined;
  registry: ReportingRegistry | undefined;

  // Queries
  revenue: RevenueSummary | undefined;
  loadingRevenue: boolean;
  expense: RevenueSummary | undefined;
  loadingExpense: boolean;
  stock: StockSummary | undefined;
  loadingStock: boolean;
  contactBalance: ContactBalance | undefined;
  loadingContactBalance: boolean;
  collectionList: CollectionList | undefined;
  loadingCollections: boolean;
  topProducts: TopProducts | undefined;
  loadingTopProducts: boolean;
  savedReports: SavedReport[];
  loadingSaved: boolean;

  // Mutations
  deleteReport: ReturnType<typeof useMutation<void, unknown, string>>;
  previewKpiMutation: ReturnType<typeof useMutation<KpiPreview, unknown, KpiReportConfig>>;
  createKpiReport: ReturnType<typeof useMutation<SavedReport, unknown, void>>;
  updateReport: ReturnType<typeof useMutation<SavedReport, unknown, { id: string; data: SavedReportMutationInput }>>;
  recordExportAudit: ReturnType<typeof useMutation<ReportExportAuditResult, unknown, string>>;
  runReportSchedule: ReturnType<typeof useMutation<ReportScheduleDispatchResult, unknown, string>>;

  // Plan features
  customReporting: boolean;
  isStarter: boolean;
}

// ─────────────────────────────────────────────
// Hook
// ─────────────────────────────────────────────

export function useReportsData(): UseReportsDataReturn {
  const qc = useQueryClient();
  const { toast } = useUIStore();
  const { customReporting, isStarter } = usePlanFeatures();
  const defaultRange = getDefaultRange();

  // ── Date range ──────────────────────────────────────────────────────────
  const [dateFrom, setDateFrom] = useState(defaultRange.from);
  const [dateTo, setDateTo] = useState(defaultRange.to);

  // ── Tab & delete state ──────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<ReportTab>('overview');
  const [deleteTarget, setDeleteTarget] = useState<SavedReport | null>(null);

  // ── KPI builder state ───────────────────────────────────────────────────
  const [kpiName, setKpiName] = useState('Aylık satış geliri');
  const [kpiConfig, setKpiConfig] = useState<KpiReportConfig>(DEFAULT_KPI_CONFIG);
  const [kpiPreview, setKpiPreview] = useState<KpiPreview | null>(null);

  // ── Share / column state ────────────────────────────────────────────────
  const [shareTarget, setShareTarget] = useState<SavedReport | null>(null);
  const [shareRoles, setShareRoles] = useState<string[]>([]);
  const [shareUsers, setShareUsers] = useState<string[]>([]);
  const [sharePublic, setSharePublic] = useState<boolean>(false);
  const [sharePinned, setSharePinned] = useState<boolean>(false);
  const [columnTemplateName, setColumnTemplateName] = useState<string>('');
  const [selectedColumnKeys, setSelectedColumnKeys] = useState<string[]>([]);

  // ── Users / Roles ───────────────────────────────────────────────────────
  const { data: usersData } = useTenantUsers();
  const users = (usersData ?? []) as TenantUser[];
  const { data: rolesData } = useRoles({ limit: 100 });
  const roles = (rolesData?.data ?? []) as { id: string; name: string }[];

  // ── Mutations ────────────────────────────────────────────────────────────
  const updateReport = useMutation({
    mutationFn: ({ id, data }: { id: string; data: SavedReportMutationInput }) =>
      updateSavedReport(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['reports', 'saved'] });
      qc.invalidateQueries({ queryKey: ['reports', 'pinned-kpi'] });
      toast.success('Rapor paylaşım ayarları güncellendi.');
      setShareTarget(null);
    },
    onError: (e: unknown) => toast.error(getErrorMessage(e)),
  });

  const deleteReport = useMutation({
    mutationFn: (id: string) => deleteSavedReport(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['reports', 'saved'] });
      toast.success('Rapor silindi.');
    },
    onError: (e: unknown) => toast.error(getErrorMessage(e)),
  });

  const previewKpiMutation = useMutation({
    mutationFn: (config: KpiReportConfig) => previewKpi(config),
    onSuccess: (preview) => setKpiPreview(preview),
    onError: (e: unknown) => toast.error(getErrorMessage(e)),
  });

  const createKpiReport = useMutation({
    mutationFn: () =>
      createSavedReport({
        name: kpiName,
        module: 'reporting',
        filters: kpiConfig,
        columns: [kpiConfig.metric],
        isShared: kpiConfig.pinnedToDashboard,
        pinnedToDashboard: kpiConfig.pinnedToDashboard,
        columnTemplateName: 'executive',
      }),
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

  const runReportSchedule = useMutation({
    mutationFn: (id: string) => runSavedReportSchedule(id),
    onSuccess: (result) => {
      toast.success(`${result.reportName} raporu ${result.mailCount} aliciya gonderildi.`);
      qc.invalidateQueries({ queryKey: ['notifications'] });
    },
    onError: (e: unknown) => toast.error(getErrorMessage(e)),
  });

  // ── Queries ──────────────────────────────────────────────────────────────
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

  const { data: topProducts, isLoading: loadingTopProducts } = useQuery({
    queryKey: ['reports', 'top-products', dateFrom, dateTo],
    queryFn: () => getTopProducts(dateFrom, dateTo, 10),
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
    enabled: customReporting,
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
    enabled: customReporting,
  });

  const selectedDataset = registry?.datasets.find(
    (dataset) => dataset.key === kpiConfig.dataset,
  ) as UseReportsDataReturn['selectedDataset'];

  const canSaveKpiReport = Boolean(
    kpiName.trim() &&
      selectedDataset &&
      (!kpiConfig.scheduleEmail.enabled ||
        kpiConfig.scheduleEmail.recipients.length > 0),
  );

  return {
    dateFrom,
    dateTo,
    setDateFrom,
    setDateTo,
    activeTab,
    setActiveTab,
    deleteTarget,
    setDeleteTarget,
    kpiName,
    setKpiName,
    kpiConfig,
    setKpiConfig,
    kpiPreview,
    setKpiPreview,
    canSaveKpiReport,
    shareTarget,
    setShareTarget,
    shareRoles,
    setShareRoles,
    shareUsers,
    setShareUsers,
    sharePublic,
    setSharePublic,
    sharePinned,
    setSharePinned,
    columnTemplateName,
    setColumnTemplateName,
    selectedColumnKeys,
    setSelectedColumnKeys,
    users,
    roles,
    selectedDataset,
    registry,
    revenue,
    loadingRevenue,
    expense,
    loadingExpense,
    stock,
    loadingStock,
    contactBalance,
    loadingContactBalance,
    collectionList,
    loadingCollections,
    topProducts,
    loadingTopProducts,
    savedReports,
    loadingSaved,
    deleteReport,
    previewKpiMutation,
    createKpiReport,
    updateReport,
    recordExportAudit,
    runReportSchedule,
    customReporting,
    isStarter,
  };
}
