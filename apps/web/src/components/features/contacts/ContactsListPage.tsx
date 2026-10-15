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
  Filter,
  X,
  UploadCloud,
} from "lucide-react";
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
  formatMissingInfo,
} from "@/components/features/contacts/contact-display";
import { useCurrentUser } from "@/hooks/useAuth";
import { useBulkSelection } from "@/hooks/useBulkSelection";
import { useContacts } from "@/hooks/useContacts";
import { useUIStore } from "@/store/ui.store";
import {
  createListSavedViewState,
  getSavedViewPageSize,
  getVisibleColumns,
  normalizeColumnKeys,
} from "@/lib/list-standard";
import { cn, formatCurrency, formatDate } from "@/lib/utils";
import type {
  ContactListItem,
  ContactType,
  RiskLevel,
} from "@/services/contact.service";
import {
  getSavedViewFilterString,
  type SavedViewState,
} from "@/services/saved-view.service";

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
const CONTACT_COLUMN_KEYS = [
  "name",
  "type",
  "taxNumber",
  "balance",
  "openInvoices",
  "risk",
  "missingInfo",
  "lastTx",
  "isActive",
  "actions",
] as const;

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
  { dotColor: string; label: string; textTone: string; borderTone: string; bgTone: string }
> = {
  safe: {
    dotColor: "bg-emerald-400",
    label: "Güvenli",
    textTone: "text-slate-300",
    borderTone: "border-slate-800",
    bgTone: "bg-slate-900/60",
  },
  warning: {
    dotColor: "bg-amber-400",
    label: "Uyarı",
    textTone: "text-amber-300",
    borderTone: "border-amber-500/20",
    bgTone: "bg-amber-500/10",
  },
  exceeded: {
    dotColor: "bg-rose-400",
    label: "Aşıldı",
    textTone: "text-rose-300",
    borderTone: "border-rose-500/20",
    bgTone: "bg-rose-500/10",
  },
  none: {
    dotColor: "bg-slate-500",
    label: "—",
    textTone: "text-slate-400",
    borderTone: "border-slate-800",
    bgTone: "bg-slate-900/60",
  },
};

// ─────────────────────────────────────────────
// Financial Summary Strip
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
    <div className="mb-3 overflow-hidden rounded-xl border border-slate-800/80 bg-slate-900/60 shadow-sm">
      <div className="grid grid-cols-2 divide-y divide-slate-800/60 sm:grid-cols-4 sm:divide-y-0 sm:divide-x lg:grid-cols-7">
        {/* Toplam Hesap */}
        <div className="flex flex-col justify-between p-3 min-w-0">
          <span className="text-[10px] font-medium uppercase tracking-wider text-slate-400 truncate">
            Toplam Hesap
          </span>
          <div className="mt-1 flex items-baseline gap-1.5">
            <span className="text-base font-semibold text-slate-100 tabular-nums">
              {total}
            </span>
            <span className="text-[11px] text-slate-500">cari</span>
          </div>
        </div>

        {/* Müşteri / Satıcı */}
        <div className="flex flex-col justify-between p-3 min-w-0">
          <span className="text-[10px] font-medium uppercase tracking-wider text-slate-400 truncate">
            Müşteri / Satıcı
          </span>
          <div className="mt-1 flex items-baseline gap-1.5">
            <span className="text-base font-semibold text-slate-100 tabular-nums">
              {customers} <span className="text-slate-500 font-normal">/</span> {suppliers}
            </span>
            {both > 0 && (
              <span className="text-[11px] text-indigo-300 font-medium">+{both} ikisi</span>
            )}
          </div>
        </div>

        {/* Toplam Alacak */}
        <div className="flex flex-col justify-between p-3 min-w-0">
          <span className="text-[10px] font-medium uppercase tracking-wider text-slate-400 truncate">
            Toplam Alacak
          </span>
          <div className="mt-1">
            <span className="text-base font-semibold text-emerald-400 tabular-nums">
              {formatCurrency(recv)}
            </span>
            <span className="block text-[11px] text-slate-500">Müşteri borcu</span>
          </div>
        </div>

        {/* Toplam Borç */}
        <div className="flex flex-col justify-between p-3 min-w-0">
          <span className="text-[10px] font-medium uppercase tracking-wider text-slate-400 truncate">
            Toplam Borç
          </span>
          <div className="mt-1">
            <span className="text-base font-semibold text-rose-400 tabular-nums">
              {formatCurrency(pay)}
            </span>
            <span className="block text-[11px] text-slate-500">Tedarikçi alacağı</span>
          </div>
        </div>

        {/* Net Bakiye */}
        <div className="flex flex-col justify-between p-3 min-w-0">
          <span className="text-[10px] font-medium uppercase tracking-wider text-slate-400 truncate">
            Net Bakiye
          </span>
          <div className="mt-1">
            <span
              className={cn(
                "text-base font-semibold tabular-nums",
                net >= 0 ? "text-emerald-400" : "text-rose-400"
              )}
            >
              {formatCurrency(Math.abs(net))}
            </span>
            <span className="block text-[11px] text-slate-400 font-medium">
              {net >= 0 ? "Net Alacaklı" : "Net Borçlu"}
            </span>
          </div>
        </div>

        {/* Riskli Hesap */}
        <div className="flex flex-col justify-between p-3 min-w-0">
          <span className="text-[10px] font-medium uppercase tracking-wider text-slate-400 truncate">
            Riskli Hesap
          </span>
          <div className="mt-1">
            <span
              className={cn(
                "text-base font-semibold tabular-nums",
                risky > 0 ? "text-amber-400" : "text-slate-300"
              )}
            >
              {risky}
            </span>
            <span className="block text-[11px] text-slate-500">
              {risky > 0 ? "Limit aşımı" : "Risk yok"}
            </span>
          </div>
        </div>

        {/* Eksik Bilgi */}
        <div className="flex flex-col justify-between p-3 min-w-0">
          <span className="text-[10px] font-medium uppercase tracking-wider text-slate-400 truncate">
            Eksik Bilgi
          </span>
          <div className="mt-1">
            <span
              className={cn(
                "text-base font-semibold tabular-nums",
                missing > 0 ? "text-amber-400" : "text-slate-300"
              )}
            >
              {missing}
            </span>
            <span className="block text-[11px] text-slate-500">
              {missing > 0 ? "Eksik kart" : "Kayıtlar tam"}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// Main Component
// ─────────────────────────────────────────────

export function ContactsListPage() {
  const router = useRouter();
  const { user } = useCurrentUser();
  const { toast } = useUIStore();
  const [search, setSearch] = useState("");
  const [type, setType] = useState<ContactType | "">("");
  const [status, setStatus] = useState("");
  const [balanceFilter, setBalanceFilter] = useState<"" | "receivable" | "payable" | "risky">("");
  const [showFilters, setShowFilters] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const [visibleColumnKeys, setVisibleColumnKeys] = useState<string[]>([...CONTACT_COLUMN_KEYS]);
  const [tableDensity, setTableDensity] = useState<"comfortable" | "compact">("compact");
  const [isImportOpen, setIsImportOpen] = useState(false);
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
    type
      ? {
          key: "type",
          label: TYPE_OPTIONS.find((option) => option.value === type)?.label ?? type,
          clear: () => setType(""),
        }
      : null,
    status
      ? {
          key: "status",
          label: STATUS_OPTIONS.find((option) => option.value === status)?.label ?? status,
          clear: () => setStatus(""),
        }
      : null,
    balanceFilter
      ? {
          key: "balance",
          label: BALANCE_OPTIONS.find((option) => option.value === balanceFilter)?.label ?? balanceFilter,
          clear: () => setBalanceFilter(""),
        }
      : null,
  ].filter((chip): chip is { key: string; label: string; clear: () => void } => Boolean(chip));

  const viewState = useMemo<SavedViewState>(
    () =>
      createListSavedViewState({
        filters: { search, type, status, balanceFilter },
        columns: visibleColumnKeys,
        pageSize,
      }),
    [balanceFilter, pageSize, search, status, type, visibleColumnKeys]
  );

  const applyView = (state: SavedViewState) => {
    setSearch(getSavedViewFilterString(state, "search"));
    setType(parseContactType(getSavedViewFilterString(state, "type")));
    setStatus(parseActiveStatus(getSavedViewFilterString(state, "status")));
    setBalanceFilter(parseBalanceFilter(getSavedViewFilterString(state, "balanceFilter")));
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

  const toggleImport = () => {
    setIsImportOpen((prev) => {
      const next = !prev;
      if (next) {
        setTimeout(() => {
          importRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
        }, 50);
      }
      return next;
    });
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
      onClick: () => router.push(`/dashboard/invoices/new?contactId=${contact.id}`),
      separator: true,
    },
    {
      label: "Tahsilat Al",
      icon: <ArrowDownLeft className="w-4 h-4" />,
      onClick: () => router.push(`/dashboard/payments/new?type=receive&contactId=${contact.id}`),
    },
    {
      label: "Ödeme Yap",
      icon: <ArrowUpRight className="w-4 h-4" />,
      onClick: () => router.push(`/dashboard/payments/new?type=send&contactId=${contact.id}`),
    },
  ];

  const columns: ColumnDef<ContactListItem>[] = [
    {
      key: "name",
      header: "Cari Hesap",
      exportValue: (r) => r.name,
      render: (r) => (
        <div className="min-w-0">
          <p
            className="font-medium text-slate-200 text-xs sm:text-sm leading-tight truncate group-hover:text-sky-300 transition-colors"
            title={r.name}
          >
            {r.name}
          </p>
          <p className="text-[11px] text-slate-500 font-mono mt-0.5">{r.code ?? "—"}</p>
        </div>
      ),
    },
    {
      key: "type",
      header: "Tip",
      width: "120px",
      exportValue: (r) => CONTACT_TYPE_LABELS[r.type],
      render: (r) => {
        const typeStyle =
          r.type === "CUSTOMER"
            ? "border-sky-500/20 bg-sky-500/10 text-sky-300"
            : r.type === "SUPPLIER"
            ? "border-amber-500/20 bg-amber-500/10 text-amber-300"
            : "border-indigo-500/20 bg-indigo-500/10 text-indigo-300";
        return (
          <span
            className={cn(
              "inline-flex items-center rounded border px-2 py-0.5 text-[11px] font-medium",
              typeStyle
            )}
          >
            {CONTACT_TYPE_LABELS[r.type]}
          </span>
        );
      },
    },
    {
      key: "taxNumber",
      header: "Vergi No",
      width: "115px",
      exportValue: (r) => r.taxNumber ?? "",
      render: (r) => (
        <span className="text-xs text-slate-400 font-mono">{r.taxNumber ?? "—"}</span>
      ),
    },
    {
      key: "balance",
      header: "Bakiye",
      width: "145px",
      align: "right",
      exportValue: (r) => Number(r.currentBalance) || 0,
      render: (r) => {
        const bal = Number(r.currentBalance) || 0;
        if (bal === 0)
          return <span className="text-xs text-slate-500 tabular-nums font-mono">₺0,00</span>;
        const isReceivable = bal > 0;
        return (
          <div className="text-right">
            <span
              className={cn(
                "text-xs sm:text-sm font-semibold tabular-nums font-mono",
                isReceivable ? "text-emerald-400" : "text-rose-400"
              )}
            >
              {formatCurrency(Math.abs(bal))}
            </span>
            <span
              className={cn(
                "block text-[10px]",
                isReceivable ? "text-emerald-500/75" : "text-rose-500/75"
              )}
            >
              {isReceivable ? "Alacaklıyız" : "Borçluyuz"}
            </span>
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
            <span className="text-xs sm:text-sm font-medium text-slate-200 tabular-nums">
              {r.openInvoiceCount}
            </span>
            {r.overdueInvoiceCount > 0 && (
              <span className="block text-[10px] text-rose-400 font-medium">
                {r.overdueInvoiceCount} gecikmiş
              </span>
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
        if (!cfg || r.riskLevel === "none") {
          return (
            <Badge variant={CONTACT_RISK_SCORE_VARIANTS[r.riskScoreLevel]}>
              {CONTACT_RISK_SCORE_LABELS[r.riskScoreLevel]} %{r.riskScore}
            </Badge>
          );
        }
        return (
          <span
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs font-medium",
              cfg.borderTone,
              cfg.bgTone,
              cfg.textTone
            )}
            title={`${cfg.label} (%${r.riskRatio}) - risk skoru %${r.riskScore}`}
          >
            <span className={cn("h-1.5 w-1.5 rounded-full", cfg.dotColor)} />
            <span className="tabular-nums">%{r.riskScore}</span>
          </span>
        );
      },
    },
    {
      key: "missingInfo",
      header: "Bilgi Uyarısı",
      width: "135px",
      exportValue: (r) => formatMissingInfo(r.missingInfoKeys, 6),
      render: (r) =>
        r.hasMissingInfo ? (
          <span
            className="inline-flex max-w-[130px] items-center truncate rounded border border-amber-500/25 bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium text-amber-300"
            title={formatMissingInfo(r.missingInfoKeys, 6)}
          >
            {formatMissingInfo(r.missingInfoKeys)}
          </span>
        ) : (
          <span className="inline-flex items-center rounded border border-slate-800 bg-slate-900/50 px-2 py-0.5 text-[11px] font-medium text-slate-400">
            Tam
          </span>
        ),
    },
    {
      key: "lastTx",
      header: "Son İşlem",
      width: "95px",
      render: (r) => (
        <span className="text-xs text-slate-400 font-mono">
          {r.lastTransactionDate ? formatDate(r.lastTransactionDate) : "—"}
        </span>
      ),
    },
    {
      key: "isActive",
      header: "Durum",
      width: "70px",
      align: "center",
      exportValue: (r) => (r.isActive ? "Aktif" : "Pasif"),
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
      {/* 1. Page Header */}
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold text-slate-100 tracking-tight">Cari Hesaplar</h1>
          <p className="mt-0.5 text-xs text-slate-400">Müşteri ve tedarikçi hesapları</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            leftIcon={<UploadCloud className="w-3.5 h-3.5" />}
            onClick={toggleImport}
            className={cn(
              "h-8 text-xs transition-colors",
              isImportOpen && "border-sky-500/50 bg-slate-800 text-white"
            )}
          >
            İçe Aktar
          </Button>
          <Button
            size="sm"
            leftIcon={<Plus className="w-3.5 h-3.5" />}
            onClick={() => router.push("/dashboard/contacts/new")}
            className="h-8 text-xs"
          >
            Yeni Cari
          </Button>
        </div>
      </div>

      {/* CSV Import Panel (Collapsible, state preserved via hidden) */}
      <div
        ref={importRef}
        className={cn(
          "transition-all duration-200 mb-3",
          !isImportOpen && !isEmptyFirstUse && "hidden"
        )}
      >
        <div className="rounded-xl border border-slate-800/80 bg-slate-900/90 p-4 shadow-sm">
          <div className="flex items-center justify-between pb-3 mb-3 border-b border-slate-800/80">
            <div className="flex items-center gap-2">
              <UploadCloud className="w-4 h-4 text-sky-400" />
              <h2 className="text-sm font-semibold text-slate-200">
                Cari Hesaplar — CSV İçe Aktarma
              </h2>
            </div>
            {!isEmptyFirstUse && (
              <button
                type="button"
                onClick={() => setIsImportOpen(false)}
                className="p-1 rounded-md text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                aria-label="Kapat"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
          <StarterCsvImportWizard entity="contacts" />
        </div>
      </div>

      {/* 2. Financial Summary Strip */}
      {summary && <SummaryBar summary={summary} />}

      {/* 3. Customer Tracking Overview */}
      <CustomerTrackingPanel defaultExpanded={false} />

      {/* 4. Table Toolbar */}
      <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
        {/* Left Toolbar Controls */}
        <div className="flex flex-wrap items-center gap-2">
          <SearchInput
            value={search}
            onChange={(v) => {
              setSearch(v);
              setPage(1);
            }}
            placeholder="Ad, kod, vergi no, telefon, e-posta ara…"
            className="w-64 sm:w-72"
            inputClassName="h-9 !py-1 text-xs rounded-lg border-slate-800 bg-slate-900/60"
          />
          <Button
            variant={showFilters ? "secondary" : "ghost"}
            size="sm"
            leftIcon={<Filter className="w-3.5 h-3.5" />}
            onClick={() => setShowFilters((o) => !o)}
            className={cn(
              "h-9 px-2.5 text-xs rounded-lg border border-slate-800 transition-colors",
              showFilters
                ? "bg-slate-800 text-white border-slate-700"
                : "bg-slate-900/60 text-slate-300"
            )}
          >
            Filtreler
            {hasActiveFilters && (
              <span className="ml-1 flex h-4 w-4 items-center justify-center rounded-full bg-sky-500 text-[10px] font-semibold text-white">
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
              className="h-9 px-2.5 text-xs text-slate-400 hover:text-white"
            >
              Temizle
            </Button>
          )}
        </div>

        {/* Right Toolbar Controls */}
        <div className="flex flex-wrap items-center gap-2">
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
            controlSize="sm"
          />
          <div className="flex h-9 items-center rounded-lg border border-slate-800 bg-slate-900/60 p-0.5">
            <button
              type="button"
              onClick={() => setTableDensity("compact")}
              className={cn(
                "h-7 rounded-md px-2.5 text-xs font-medium transition-colors",
                tableDensity === "compact"
                  ? "bg-slate-700 text-white shadow-sm"
                  : "text-slate-400 hover:text-slate-200"
              )}
            >
              Kompakt
            </button>
            <button
              type="button"
              onClick={() => setTableDensity("comfortable")}
              className={cn(
                "h-7 rounded-md px-2.5 text-xs font-medium transition-colors",
                tableDensity === "comfortable"
                  ? "bg-slate-700 text-white shadow-sm"
                  : "text-slate-400 hover:text-slate-200"
              )}
            >
              Rahat
            </button>
          </div>
        </div>
      </div>

      {/* Active Filter Chips */}
      {activeFilterChips.length > 0 && (
        <div className="mb-2.5 flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] text-slate-500">Aktif filtreler:</span>
          {activeFilterChips.map((chip) => (
            <button
              key={chip.key}
              type="button"
              onClick={() => {
                chip.clear();
                setPage(1);
              }}
              className="inline-flex h-6 items-center gap-1 rounded-md border border-sky-500/25 bg-sky-500/10 px-2 text-[11px] font-medium text-sky-200 hover:border-sky-400/40 hover:bg-sky-500/15 transition-colors"
            >
              <span>{chip.label}</span>
              <X className="h-3 w-3 text-sky-400" />
            </button>
          ))}
        </div>
      )}

      {/* Advanced Filter Drawer */}
      {showFilters && (
        <div className="mb-3 flex flex-wrap items-center gap-2.5 rounded-lg border border-slate-800/80 bg-slate-900/60 p-2.5">
          <div className="flex items-center gap-1.5 text-xs text-slate-400">
            <Filter className="w-3.5 h-3.5 text-slate-500" />
            <span>Filtrele:</span>
          </div>
          <Select
            options={TYPE_OPTIONS}
            value={type}
            onChange={(e) => {
              setType(e.target.value as ContactType | "");
              setPage(1);
            }}
            className="w-36 !h-8 !py-1 text-xs rounded-lg border-slate-800 bg-slate-900/60"
          />
          <Select
            options={STATUS_OPTIONS}
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(1);
            }}
            className="w-36 !h-8 !py-1 text-xs rounded-lg border-slate-800 bg-slate-900/60"
          />
          <Select
            options={BALANCE_OPTIONS}
            value={balanceFilter}
            onChange={(e) => {
              setBalanceFilter(e.target.value as "" | "receivable" | "payable" | "risky");
              setPage(1);
            }}
            className="w-44 !h-8 !py-1 text-xs rounded-lg border-slate-800 bg-slate-900/60"
          />
        </div>
      )}

      {/* Bulk Selection Actions */}
      <BulkActionBar
        selectedIds={bulkSelection.selectedIdList}
        actions={bulkActions}
        user={user}
        onClear={bulkSelection.clearSelection}
      />

      {/* 5. Contacts Table */}
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
    </div>
  );
}
