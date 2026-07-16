"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Plus,
  Eye,
  Pencil,
  Receipt,
  ArrowDownLeft,
  ArrowUpRight,
  AlertTriangle,
  Filter,
  X,
  Shield,
  ShieldAlert,
  ShieldCheck,
  TrendingUp,
  TrendingDown,
  Users,
  FileText,
  Info,
  UploadCloud,
} from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";
import { DataTable, type ColumnDef } from "@/components/shared/DataTable";
import { BulkActionBar } from "@/components/shared/BulkActionBar";
import { createBulkActionPresets } from "@/components/shared/bulkActionPresets";
import { ListStandardControls } from "@/components/shared/ListStandardControls";
import { SearchInput } from "@/components/shared/SearchInput";
import { ActiveBadge } from "@/components/shared/StatusBadge";
import { RowActions, type RowAction } from "@/components/shared/RowActions";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Select } from "@/components/ui/Select";
import { CustomerTrackingPanel } from "@/components/features/contacts/CustomerTrackingPanel";
import { StarterCsvImportWizard } from "@/components/shared/StarterCsvImportWizard";
import {
  CONTACT_RISK_SCORE_LABELS,
  CONTACT_RISK_SCORE_VARIANTS,
  CONTACT_TYPE_LABELS,
  CONTACT_TYPE_VARIANTS,
  formatMissingInfo,
} from "@/components/features/contacts/contact-display";
import { useCurrentUser } from "@/hooks/useAuth";
import { useBulkSelection } from "@/hooks/useBulkSelection";
import { useContacts } from "@/hooks/useContacts";
import { useUIStore } from "@/store/ui.store";
import { createListSavedViewState, getSavedViewPageSize, getVisibleColumns, normalizeColumnKeys } from "@/lib/list-standard";
import { formatCurrency, formatDate } from "@/lib/utils";
import type {
  ContactListItem,
  ContactType,
  RiskLevel,
} from "@/services/contact.service";
import { getSavedViewFilterString, type SavedViewState } from "@/services/saved-view.service";

// ─────────────────────────────────────────────
// Config
// ─────────────────────────────────────────────

const TYPE_OPTIONS = [
  { value: "", label: "Tüm Tipler" },
  { value: "CUSTOMER", label: "Müşteri" },
  { value: "SUPPLIER", label: "Tedarikçi" },
  { value: "BOTH", label: "Her İkisi" },
];

const STATUS_OPTIONS = [
  { value: "", label: "Tüm Durumlar" },
  { value: "true", label: "Aktif" },
  { value: "false", label: "Pasif" },
];

const BALANCE_OPTIONS = [
  { value: "", label: "Tüm Bakiyeler" },
  { value: "receivable", label: "Alacaklıyız (Borç)" },
  { value: "payable", label: "Borçluyuz (Alacak)" },
  { value: "risky", label: "Riskli Hesaplar" },
];

const DEFAULT_PAGE_SIZE = 25;
const CONTACT_COLUMN_KEYS = ['name', 'type', 'taxNumber', 'balance', 'openInvoices', 'risk', 'missingInfo', 'lastTx', 'isActive', 'actions'] as const;

function parseContactType(value: string): ContactType | "" {
  return value === "CUSTOMER" || value === "SUPPLIER" || value === "BOTH" ? value : "";
}

function parseActiveStatus(value: string): string {
  return value === "true" || value === "false" ? value : "";
}

function parseBalanceFilter(value: string): "" | "receivable" | "payable" | "risky" {
  return value === "receivable" || value === "payable" || value === "risky" ? value : "";
}

const RISK_CONFIG: Record<
  RiskLevel,
  { icon: typeof Shield; color: string; label: string; bg: string }
> = {
  safe: {
    icon: ShieldCheck,
    color: "text-emerald-400",
    label: "Güvenli",
    bg: "bg-emerald-500/10",
  },
  warning: {
    icon: ShieldAlert,
    color: "text-amber-400",
    label: "Uyarı",
    bg: "bg-amber-500/10",
  },
  exceeded: {
    icon: AlertTriangle,
    color: "text-red-400",
    label: "Aşıldı",
    bg: "bg-red-500/10",
  },
  none: { icon: Shield, color: "text-slate-600", label: "—", bg: "" },
};

// ─────────────────────────────────────────────
// Summary Bar
// ─────────────────────────────────────────────

function SummaryBar({
  summary,
}: {
  summary: {
    totalReceivable?: number;
    totalPayable?: number;
    netBalance?: number;
    riskyAccountCount?: number;
    missingInfoCount?: number;
    customerCount?: number;
    supplierCount?: number;
    bothCount?: number;
    totalAccounts?: number;
  };
}) {
  const recv = Number(summary.totalReceivable) || 0;
  const pay = Number(summary.totalPayable) || 0;
  const net = Number(summary.netBalance) || 0;
  const risky = Number(summary.riskyAccountCount) || 0;
  const missing = Number(summary.missingInfoCount) || 0;
  const customers = Number(summary.customerCount) || 0;
  const suppliers = Number(summary.supplierCount) || 0;
  const both = Number(summary.bothCount) || 0;
  const total = Number(summary.totalAccounts) || 0;

  return (
    <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 mb-4">
      <div className="bg-slate-900 border border-slate-800 rounded-xl px-4 py-3 flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-sky-500/10 flex items-center justify-center">
          <Users className="w-4 h-4 text-sky-400" />
        </div>
        <div>
          <p className="text-[10px] text-slate-500 uppercase tracking-wider">
            Toplam Hesap
          </p>
          <p className="text-base font-semibold text-white">{total}</p>
        </div>
      </div>
      <div className="bg-slate-900 border border-slate-800 rounded-xl px-4 py-3 flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-violet-500/10 flex items-center justify-center">
          <Users className="w-4 h-4 text-violet-400" />
        </div>
        <div>
          <p className="text-[10px] text-slate-500 uppercase tracking-wider">
            Müşteri / Satıcı
          </p>
          <p className="text-base font-semibold text-white">
            {customers} / {suppliers}
            {both > 0 ? <span className="text-xs text-violet-300"> +{both}</span> : null}
          </p>
        </div>
      </div>
      <div className="bg-slate-900 border border-slate-800 rounded-xl px-4 py-3 flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center">
          <TrendingUp className="w-4 h-4 text-emerald-400" />
        </div>
        <div>
          <p className="text-[10px] text-slate-500 uppercase tracking-wider">
            Toplam Alacak
          </p>
          <p className="text-base font-semibold text-emerald-400">
            {formatCurrency(recv)}
          </p>
        </div>
      </div>
      <div className="bg-slate-900 border border-slate-800 rounded-xl px-4 py-3 flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-red-500/10 flex items-center justify-center">
          <TrendingDown className="w-4 h-4 text-red-400" />
        </div>
        <div>
          <p className="text-[10px] text-slate-500 uppercase tracking-wider">
            Toplam Borç
          </p>
          <p className="text-base font-semibold text-red-400">
            {formatCurrency(pay)}
          </p>
        </div>
      </div>
      <div className="bg-slate-900 border border-slate-800 rounded-xl px-4 py-3 flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-sky-500/10 flex items-center justify-center">
          <FileText className="w-4 h-4 text-sky-400" />
        </div>
        <div>
          <p className="text-[10px] text-slate-500 uppercase tracking-wider">
            Net Bakiye
          </p>
          <p
            className={`text-base font-semibold ${net >= 0 ? "text-emerald-400" : "text-red-400"}`}
          >
            {formatCurrency(Math.abs(net))}
          </p>
        </div>
      </div>
      <div className="bg-slate-900 border border-slate-800 rounded-xl px-4 py-3 flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-red-500/10 flex items-center justify-center">
          <AlertTriangle className="w-4 h-4 text-red-400" />
        </div>
        <div>
          <p className="text-[10px] text-slate-500 uppercase tracking-wider">
            Riskli Hesap
          </p>
          <p className="text-base font-semibold text-red-400">{risky}</p>
        </div>
      </div>
      <div className="bg-slate-900 border border-slate-800 rounded-xl px-4 py-3 flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-amber-500/10 flex items-center justify-center">
          <Info className="w-4 h-4 text-amber-400" />
        </div>
        <div>
          <p className="text-[10px] text-slate-500 uppercase tracking-wider">
            Eksik Bilgi
          </p>
          <p className="text-base font-semibold text-amber-400">{missing}</p>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────

export function ContactsListPage() {
  const router = useRouter();
  const { user } = useCurrentUser();
  const { toast } = useUIStore();
  const [search, setSearch] = useState("");
  const [type, setType] = useState<ContactType | "">("");
  const [status, setStatus] = useState("");
  const [balanceFilter, setBalanceFilter] = useState<
    "" | "receivable" | "payable" | "risky"
  >("");
  const [showFilters, setShowFilters] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [visibleColumnKeys, setVisibleColumnKeys] = useState<string[]>([...CONTACT_COLUMN_KEYS]);
  const [tableDensity, setTableDensity] = useState<"comfortable" | "compact">("compact");
  const importRef = useRef<HTMLDivElement>(null);

  const { data, isLoading } = useContacts({
    page,
    limit: pageSize,
    search: search || undefined,
    type: type || undefined,
    isActive: status ? status === "true" : undefined,
    balanceFilter: balanceFilter || undefined,
  });

  const contacts = data?.data ?? [];
  const bulkSelection = useBulkSelection(contacts.map((contact) => contact.id));
  const summary = data?.summary;
  const hasActiveFilters = !!type || !!status || !!balanceFilter;
  const isEmptyFirstUse = !isLoading && !search && !hasActiveFilters && (data?.meta.total ?? 0) === 0;
  const activeFilterChips = [
    type ? { key: "type", label: TYPE_OPTIONS.find((option) => option.value === type)?.label ?? type, clear: () => setType("") } : null,
    status ? { key: "status", label: STATUS_OPTIONS.find((option) => option.value === status)?.label ?? status, clear: () => setStatus("") } : null,
    balanceFilter ? { key: "balance", label: BALANCE_OPTIONS.find((option) => option.value === balanceFilter)?.label ?? balanceFilter, clear: () => setBalanceFilter("") } : null,
  ].filter((chip): chip is { key: string; label: string; clear: () => void } => Boolean(chip));
  const viewState = useMemo<SavedViewState>(() => createListSavedViewState({
    filters: { search, type, status, balanceFilter },
    columns: visibleColumnKeys,
    pageSize,
  }), [balanceFilter, pageSize, search, status, type, visibleColumnKeys]);

  const applyView = (state: SavedViewState) => {
    setSearch(getSavedViewFilterString(state, 'search'));
    setType(parseContactType(getSavedViewFilterString(state, 'type')));
    setStatus(parseActiveStatus(getSavedViewFilterString(state, 'status')));
    setBalanceFilter(parseBalanceFilter(getSavedViewFilterString(state, 'balanceFilter')));
    setPageSize(getSavedViewPageSize(state, DEFAULT_PAGE_SIZE));
    setVisibleColumnKeys(normalizeColumnKeys(columns, state.columns));
    setPage(1);
  };

  const clearFilters = () => {
    setType("");
    setStatus("");
    setBalanceFilter("");
    setPage(1);
  };

  const bulkActions = createBulkActionPresets({
    module: "contacts",
    entityName: "cari hesap",
    notify: toast.info,
    include: ["export", "mail", "task", "tag", "status", "archive"],
  });

  const getRowActions = (contact: ContactListItem): RowAction[] => [
    {
      label: "Görüntüle",
      icon: <Eye className="w-4 h-4" />,
      onClick: () => router.push(`/dashboard/contacts/${contact.id}`),
    },
    {
      label: "Düzenle",
      icon: <Pencil className="w-4 h-4" />,
      onClick: () => router.push(`/dashboard/contacts/${contact.id}/edit`),
    },
    {
      label: "Fatura Oluştur",
      icon: <Receipt className="w-4 h-4" />,
      onClick: () =>
        router.push(`/dashboard/invoices/new?contactId=${contact.id}`),
      separator: true,
    },
    {
      label: "Tahsilat Al",
      icon: <ArrowDownLeft className="w-4 h-4" />,
      onClick: () =>
        router.push(
          `/dashboard/payments/new?type=receive&contactId=${contact.id}`,
        ),
    },
    {
      label: "Ödeme Yap",
      icon: <ArrowUpRight className="w-4 h-4" />,
      onClick: () =>
        router.push(
          `/dashboard/payments/new?type=send&contactId=${contact.id}`,
        ),
    },
  ];

  const columns: ColumnDef<ContactListItem>[] = [
    {
      key: "name",
      header: "Cari Hesap",
      exportValue: (r) => r.name,
      render: (r) => (
        <div>
          <p className="font-medium text-slate-200 text-sm leading-tight">
            {r.name}
          </p>
          <p className="text-[11px] text-slate-500">{r.code ?? "—"}</p>
        </div>
      ),
    },
    {
      key: "type",
      header: "Tip",
      width: "125px",
      exportValue: (r) => CONTACT_TYPE_LABELS[r.type],
      render: (r) => (
        <Badge variant={CONTACT_TYPE_VARIANTS[r.type]}>{CONTACT_TYPE_LABELS[r.type]}</Badge>
      ),
    },
    {
      key: "taxNumber",
      header: "Vergi No",
      width: "115px",
      exportValue: (r) => r.taxNumber ?? "",
      render: (r) => (
        <span className="text-xs text-slate-400 font-mono">
          {r.taxNumber ?? "—"}
        </span>
      ),
    },
    {
      key: "balance",
      header: "Bakiye",
      width: "150px",
      align: "right",
      exportValue: (r) => Number(r.currentBalance) || 0,
      render: (r) => {
        const bal = Number(r.currentBalance) || 0;
        if (bal === 0)
          return <span className="text-xs text-slate-600">₺0,00</span>;
        const isReceivable = bal > 0;
        return (
          <div className="text-right">
            <span
              className={`text-sm font-semibold tabular-nums ${isReceivable ? "text-emerald-400" : "text-red-400"}`}
            >
              {formatCurrency(Math.abs(bal))}
            </span>
            <p
              className={`text-[10px] ${isReceivable ? "text-emerald-500/70" : "text-red-500/70"}`}
            >
              {isReceivable ? "Alacaklıyız" : "Borçluyuz"}
            </p>
          </div>
        );
      },
    },
    {
      key: "openInvoices",
      header: "Açık Fatura",
      width: "90px",
      align: "center",
      render: (r) => {
        if (r.openInvoiceCount === 0)
          return <span className="text-xs text-slate-600">—</span>;
        return (
          <div className="text-center">
            <span className="text-sm font-medium text-slate-200">
              {r.openInvoiceCount}
            </span>
            {r.overdueInvoiceCount > 0 && (
              <p className="text-[10px] text-red-400">
                {r.overdueInvoiceCount} gecikmiş
              </p>
            )}
          </div>
        );
      },
    },
    {
      key: "risk",
      header: "Risk",
      width: "100px",
      align: "center",
      exportValue: (r) => r.riskScore,
      render: (r) => {
        const cfg = RISK_CONFIG[r.riskLevel as RiskLevel];
        if (!cfg || r.riskLevel === "none")
          return (
            <Badge variant={CONTACT_RISK_SCORE_VARIANTS[r.riskScoreLevel]}>
              {CONTACT_RISK_SCORE_LABELS[r.riskScoreLevel]} %{r.riskScore}
            </Badge>
          );
        const Icon = cfg.icon;
        return (
          <span
            className={`inline-flex h-7 items-center justify-center gap-1.5 rounded-lg px-2 ${cfg.bg}`}
            title={`${cfg.label} (%${r.riskRatio}) - risk skoru %${r.riskScore}`}
          >
            <Icon className={`w-3.5 h-3.5 ${cfg.color}`} />
            <span className="text-[11px] font-semibold text-slate-300">%{r.riskScore}</span>
          </span>
        );
      },
    },
    {
      key: "missingInfo",
      header: "Bilgi Uyarisi",
      width: "140px",
      exportValue: (r) => formatMissingInfo(r.missingInfoKeys, 6),
      render: (r) => (
        r.hasMissingInfo ? (
          <Badge variant="warning" className="max-w-[132px] truncate">
            {formatMissingInfo(r.missingInfoKeys)}
          </Badge>
        ) : (
          <Badge variant="success">Tam</Badge>
        )
      ),
    },
    {
      key: "lastTx",
      header: "Son İşlem",
      width: "95px",
      render: (r) => (
        <span className="text-xs text-slate-500">
          {r.lastTransactionDate ? formatDate(r.lastTransactionDate) : "—"}
        </span>
      ),
    },
    {
      key: "isActive",
      header: "Durum",
      width: "70px",
      align: "center",
      exportValue: (r) => r.isActive ? "Aktif" : "Pasif",
      render: (r) => <ActiveBadge isActive={r.isActive} />,
    },
    {
      key: "actions",
      header: "",
      width: "40px",
      align: "center",
      hideable: false,
      render: (r) => <RowActions actions={getRowActions(r)} />,
    },
  ];
  const visibleColumns = getVisibleColumns(columns, visibleColumnKeys);

  return (
    <div>
      <PageHeader
        title="Cari Hesaplar"
        subtitle="Müşteri ve tedarikçi hesaplarını yönetin"
        action={
          <div className="flex gap-2">
            <Button
              variant="outline"
              leftIcon={<UploadCloud className="w-4 h-4" />}
              onClick={() => importRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })}
            >
              İçe Aktar
            </Button>
            <Button
              leftIcon={<Plus className="w-4 h-4" />}
              onClick={() => router.push("/dashboard/contacts/new")}
            >
              Yeni Cari
            </Button>
          </div>
        }
      />

      {isEmptyFirstUse && (
        <div ref={importRef}>
          <StarterCsvImportWizard entity="contacts" />
        </div>
      )}

      <CustomerTrackingPanel />

      {/* Summary Bar */}
      {summary && <SummaryBar summary={summary} />}

      {/* Search + Filter Bar */}
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <SearchInput
          value={search}
          onChange={(v) => {
            setSearch(v);
            setPage(1);
          }}
          placeholder="Ad, kod, vergi no, telefon, e-posta ara…"
          className="w-72"
        />
        <Button
          variant={showFilters ? "secondary" : "ghost"}
          size="sm"
          leftIcon={<Filter className="w-3.5 h-3.5" />}
          onClick={() => setShowFilters((o) => !o)}
        >
          Filtreler
          {hasActiveFilters && (
            <span className="ml-1 w-4 h-4 rounded-full bg-sky-500 text-white text-[10px] flex items-center justify-center">
              {[type, status, balanceFilter].filter(Boolean).length}
            </span>
          )}
        </Button>
        {hasActiveFilters && (
          <Button
            variant="ghost"
            size="sm"
            leftIcon={<X className="w-3.5 h-3.5" />}
            onClick={clearFilters}
          >
            Temizle
          </Button>
        )}
        <ListStandardControls
          module="contacts"
          listKey="contacts.list"
          currentState={viewState}
          onApplyView={applyView}
          columns={columns}
          visibleColumnKeys={visibleColumnKeys}
          onVisibleColumnKeysChange={setVisibleColumnKeys}
          pageSize={pageSize}
          onPageSizeChange={(nextPageSize) => {
            setPageSize(nextPageSize);
            setPage(1);
          }}
          exportRows={contacts}
          exportFilename="cari-hesaplar.csv"
        />
        <div className="flex rounded-lg border border-slate-800 bg-slate-900/60 p-0.5">
          <button
            type="button"
            onClick={() => setTableDensity("compact")}
            className={`h-8 rounded-md px-3 text-xs font-medium transition-colors ${tableDensity === "compact" ? "bg-slate-700 text-white" : "text-slate-400 hover:text-slate-200"}`}
          >
            Kompakt
          </button>
          <button
            type="button"
            onClick={() => setTableDensity("comfortable")}
            className={`h-8 rounded-md px-3 text-xs font-medium transition-colors ${tableDensity === "comfortable" ? "bg-slate-700 text-white" : "text-slate-400 hover:text-slate-200"}`}
          >
            Rahat
          </button>
        </div>
      </div>

      {activeFilterChips.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-2">
          {activeFilterChips.map((chip) => (
            <button
              key={chip.key}
              type="button"
              onClick={() => {
                chip.clear();
                setPage(1);
              }}
              className="inline-flex h-7 items-center gap-1.5 rounded-lg border border-sky-500/25 bg-sky-500/10 px-2.5 text-xs font-medium text-sky-200 hover:border-sky-400/40 hover:bg-sky-500/15"
            >
              {chip.label}
              <X className="h-3 w-3" />
            </button>
          ))}
        </div>
      )}

      {/* Advanced Filters */}
      {showFilters && (
        <div className="flex flex-wrap gap-2 mb-4 p-3 bg-slate-900/50 border border-slate-800/60 rounded-xl">
          <Select
            options={TYPE_OPTIONS}
            value={type}
            onChange={(e) => {
              setType(e.target.value as ContactType | "");
              setPage(1);
            }}
            className="w-36 !py-1.5 text-xs"
          />
          <Select
            options={STATUS_OPTIONS}
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(1);
            }}
            className="w-36 !py-1.5 text-xs"
          />
          <Select
            options={BALANCE_OPTIONS}
            value={balanceFilter}
            onChange={(e) => {
              setBalanceFilter(e.target.value as "" | "receivable" | "payable" | "risky");
              setPage(1);
            }}
            className="w-48 !py-1.5 text-xs"
          />
        </div>
      )}

      <BulkActionBar
        selectedIds={bulkSelection.selectedIdList}
        actions={bulkActions}
        user={user}
        onClear={bulkSelection.clearSelection}
      />

      <DataTable
        columns={visibleColumns}
        data={contacts}
        keyExtractor={(r) => r.id}
        selection={{
          selectedIds: bulkSelection.selectedIds,
          isPageSelected: bulkSelection.isPageSelected,
          isPagePartiallySelected: bulkSelection.isPagePartiallySelected,
          onToggleRow: bulkSelection.toggleOne,
          onTogglePage: bulkSelection.togglePage,
        }}
        isLoading={isLoading}
        density={tableDensity}
        onRowClick={(r) => router.push(`/dashboard/contacts/${r.id}`)}
        emptyTitle="Cari hesap bulunamadı"
        emptyDescription="Yeni bir cari hesap ekleyerek başlayın."
        pagination={
          data
            ? {
                page,
                pageSize,
                total: data.meta.total,
                totalPages: data.meta.totalPages,
                onChange: setPage,
              }
            : undefined
        }
      />

      {!isEmptyFirstUse && (
        <div ref={importRef} className="mt-4">
          <StarterCsvImportWizard entity="contacts" />
        </div>
      )}
    </div>
  );
}
