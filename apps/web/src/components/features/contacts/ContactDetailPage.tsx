"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Pencil,
  Trash2,
  Phone,
  Mail,
  Globe,
  MapPin,
  ArrowDownLeft,
  ArrowUpRight,
  Receipt,
  FileDown,
  FileText,
  AlertTriangle,
  Calendar,
  TrendingUp,
  TrendingDown,
  Wallet,
  Clock,
  ShieldCheck,
  ShieldAlert,
  Filter,
  X,
} from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";
import { DataTable, type ColumnDef } from "@/components/shared/DataTable";
import { KpiCard } from "@/components/shared/KpiCard";
import { CreditLimitBar } from "@/components/shared/CreditLimitBar";
import { EntityActionPanel } from "@/components/shared/EntityActionPanel";
import { ActiveBadge } from "@/components/shared/StatusBadge";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { Select } from "@/components/ui/Select";
import { Input } from "@/components/ui/Input";
import { DatePicker } from "@/components/ui/DatePicker";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { FullPageSpinner } from "@/components/ui/Spinner";
import {
  useContact,
  useDeleteContact,
  useAccountEntries,
} from "@/hooks/useContacts";
import { formatCurrency, formatDate } from "@/lib/utils";
import type { AccountEntry, OpenInvoice } from "@/services/contact.service";

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  if (!value) return null;
  return (
    <div className="flex gap-3 py-1">
      <span className="text-[11px] text-slate-500 w-24 shrink-0 pt-0.5 uppercase tracking-wider">
        {label}
      </span>
      <span className="text-sm text-slate-300">{value}</span>
    </div>
  );
}

const REF_TYPE_LABELS: Record<string, string> = {
  INVOICE: "Fatura",
  PAYMENT: "Ödeme",
  OPENING: "Açılış",
  ADJUSTMENT: "Düzeltme",
  RETURN: "İade",
  COLLECTION: "Tahsilat",
};

const REF_TYPE_ICONS: Record<string, React.ReactNode> = {
  INVOICE: <Receipt className="w-3.5 h-3.5 text-sky-400" />,
  PAYMENT: <ArrowUpRight className="w-3.5 h-3.5 text-red-400" />,
  COLLECTION: <ArrowDownLeft className="w-3.5 h-3.5 text-emerald-400" />,
  OPENING: <FileText className="w-3.5 h-3.5 text-slate-400" />,
  ADJUSTMENT: <FileText className="w-3.5 h-3.5 text-amber-400" />,
  RETURN: <FileText className="w-3.5 h-3.5 text-violet-400" />,
};

const REF_TYPE_OPTIONS = [
  { value: "", label: "Tüm Tipler" },
  { value: "INVOICE", label: "Fatura" },
  { value: "PAYMENT", label: "Ödeme" },
  { value: "COLLECTION", label: "Tahsilat" },
  { value: "OPENING", label: "Açılış" },
  { value: "ADJUSTMENT", label: "Düzeltme" },
  { value: "RETURN", label: "İade" },
];

// ─────────────────────────────────────────────
// Open Invoices Panel
// ─────────────────────────────────────────────

function OpenInvoicesPanel({
  invoices,
  onNavigate,
}: {
  invoices: OpenInvoice[];
  onNavigate: (id: string) => void;
}) {
  if (invoices.length === 0) return null;

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
          Açık Faturalar
        </h3>
        <span className="text-[10px] text-slate-500">
          {invoices.length} adet
        </span>
      </div>
      <div className="space-y-1.5 max-h-64 overflow-y-auto">
        {invoices.map((inv) => (
          <button
            key={inv.id}
            onClick={() => onNavigate(inv.id)}
            className="w-full flex items-center justify-between px-3 py-2 rounded-lg hover:bg-slate-800/60 transition-colors text-left"
          >
            <div className="min-w-0">
              <p className="text-sm text-slate-200 font-medium">{inv.number}</p>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-[11px] text-slate-500">
                  {formatDate(inv.date)}
                </span>
                {inv.dueDate && (
                  <span
                    className={`text-[11px] ${inv.isOverdue ? "text-red-400" : "text-slate-500"}`}
                  >
                    → {formatDate(inv.dueDate)}
                  </span>
                )}
              </div>
            </div>
            <div className="text-right shrink-0 ml-3">
              <p className="text-sm font-medium text-slate-200">
                {formatCurrency(inv.totalGross)}
              </p>
              {inv.isOverdue && (
                <Badge variant="danger" className="mt-0.5 text-[9px]">
                  Gecikmiş
                </Badge>
              )}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────

interface Props {
  id: string;
}

export function ContactDetailPage({ id }: Props) {
  const router = useRouter();
  const { data: contact, isLoading } = useContact(id);
  const deleteContact = useDeleteContact();
  const [deleteOpen, setDeleteOpen] = useState(false);

  // Statement filters
  const [entryPage, setEntryPage] = useState(1);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [refType, setRefType] = useState("");
  const [showEntryFilters, setShowEntryFilters] = useState(false);

  const { data: entriesData, isLoading: loadingEntries } = useAccountEntries(
    id,
    {
      page: entryPage,
      limit: 25,
      dateFrom: dateFrom || undefined,
      dateTo: dateTo || undefined,
      refType: refType || undefined,
    },
  );

  const entries = entriesData?.data ?? [];
  const periodTotals = entriesData?.periodTotals;
  const hasEntryFilters = !!dateFrom || !!dateTo || !!refType;

  const clearEntryFilters = () => {
    setDateFrom("");
    setDateTo("");
    setRefType("");
    setEntryPage(1);
  };

  const entryColumns: ColumnDef<AccountEntry>[] = [
    {
      key: "date",
      header: "Tarih",
      width: "95px",
      render: (r) => (
        <span className="text-xs text-slate-400 font-mono tabular-nums">
          {formatDate(r.date)}
        </span>
      ),
    },
    {
      key: "refType",
      header: "Belge Tipi",
      width: "120px",
      render: (r) => (
        <div className="flex items-center gap-1.5">
          {r.refType && REF_TYPE_ICONS[r.refType]}
          <span className="text-xs text-slate-300">
            {r.refType ? (REF_TYPE_LABELS[r.refType] ?? r.refType) : "—"}
          </span>
        </div>
      ),
    },
    {
      key: "description",
      header: "Açıklama",
      render: (r) => (
        <span className="text-sm text-slate-300 truncate block max-w-xs">
          {r.description ?? "—"}
        </span>
      ),
    },
    {
      key: "debit",
      header: "Borç",
      width: "120px",
      align: "right",
      render: (r) =>
        r.debit > 0 ? (
          <span className="text-sm font-medium text-red-400 tabular-nums">
            {formatCurrency(r.debit)}
          </span>
        ) : (
          <span className="text-slate-700">—</span>
        ),
    },
    {
      key: "credit",
      header: "Alacak",
      width: "120px",
      align: "right",
      render: (r) =>
        r.credit > 0 ? (
          <span className="text-sm font-medium text-emerald-400 tabular-nums">
            {formatCurrency(r.credit)}
          </span>
        ) : (
          <span className="text-slate-700">—</span>
        ),
    },
    {
      key: "balance",
      header: "Bakiye",
      width: "140px",
      align: "right",
      render: (r) => (
        <span
          className={`text-sm font-semibold tabular-nums ${r.balance >= 0 ? "text-slate-200" : "text-red-400"}`}
        >
          {formatCurrency(r.balance)}
        </span>
      ),
    },
  ];

  if (isLoading) return <FullPageSpinner />;
  if (!contact)
    return <div className="text-slate-400 text-sm">Cari hesap bulunamadı.</div>;

  const TYPE_LABELS = {
    CUSTOMER: "Müşteri",
    SUPPLIER: "Tedarikçi",
    BOTH: "Her İkisi",
  };
  const TYPE_VARIANTS = {
    CUSTOMER: "info",
    SUPPLIER: "warning",
    BOTH: "purple",
  } as const;

  const fin = contact.financials ?? {
    totalDebit: 0,
    totalCredit: 0,
    currentBalance: 0,
    lastTransactionDate: null,
    transactionCount: 0,
    openInvoiceCount: 0,
    overdueInvoiceCount: 0,
    riskLevel: "none" as const,
    riskRatio: 0,
  };
  const openInvoices = contact.openInvoices ?? [];
  const creditLimit = contact.creditLimit ? Number(contact.creditLimit) : 0;
  const creditUsed = Math.max(Number(fin.currentBalance) || 0, 0);

  return (
    <div className="space-y-5">
      {/* Header */}
      <PageHeader
        title={contact.name}
        subtitle={contact.code ?? undefined}
        action={
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              leftIcon={<ArrowDownLeft className="w-3.5 h-3.5" />}
              onClick={() =>
                router.push(
                  `/dashboard/payments/new?type=receive&contactId=${id}`,
                )
              }
            >
              Tahsilat
            </Button>
            <Button
              variant="outline"
              size="sm"
              leftIcon={<ArrowUpRight className="w-3.5 h-3.5" />}
              onClick={() =>
                router.push(`/dashboard/payments/new?type=send&contactId=${id}`)
              }
            >
              Ödeme
            </Button>
            <Button
              variant="outline"
              size="sm"
              leftIcon={<Receipt className="w-3.5 h-3.5" />}
              onClick={() =>
                router.push(`/dashboard/invoices/new?contactId=${id}`)
              }
            >
              Fatura
            </Button>
            <Button
              variant="outline"
              size="sm"
              leftIcon={<FileDown className="w-3.5 h-3.5" />}
            >
              Ekstre
            </Button>
            <div className="w-px bg-slate-800 mx-0.5" />
            <Button
              variant="secondary"
              size="sm"
              leftIcon={<Pencil className="w-3.5 h-3.5" />}
              onClick={() => router.push(`/dashboard/contacts/${id}/edit`)}
            >
              Düzenle
            </Button>
            <Button
              variant="danger"
              size="sm"
              leftIcon={<Trash2 className="w-3.5 h-3.5" />}
              onClick={() => setDeleteOpen(true)}
            >
              Sil
            </Button>
          </div>
        }
      />

      {/* KPI Cards — 5 columns */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <KpiCard
          label="Toplam Alacak"
          value={formatCurrency(Number(fin.totalDebit) || 0)}
          icon={TrendingUp}
          variant="success"
        />
        <KpiCard
          label="Toplam Borç"
          value={formatCurrency(Number(fin.totalCredit) || 0)}
          icon={TrendingDown}
          variant="danger"
        />
        <KpiCard
          label="Güncel Bakiye"
          value={formatCurrency(Math.abs(Number(fin.currentBalance) || 0))}
          icon={Wallet}
          variant={(Number(fin.currentBalance) || 0) >= 0 ? "info" : "danger"}
          trend={
            (Number(fin.currentBalance) || 0) !== 0
              ? {
                  value:
                    (Number(fin.currentBalance) || 0) > 0
                      ? "Alacaklıyız"
                      : "Borçluyuz",
                  positive: (Number(fin.currentBalance) || 0) > 0,
                }
              : undefined
          }
        />
        <KpiCard
          label="Açık Fatura"
          value={fin.openInvoiceCount ?? 0}
          icon={FileText}
          variant="warning"
          trend={
            (fin.overdueInvoiceCount ?? 0) > 0
              ? {
                  value: `${fin.overdueInvoiceCount} gecikmiş`,
                  positive: false,
                }
              : undefined
          }
        />
        <KpiCard
          label="Risk Oranı"
          value={`%${fin.riskRatio ?? 0}`}
          icon={
            fin.riskLevel === "exceeded"
              ? AlertTriangle
              : fin.riskLevel === "warning"
                ? ShieldAlert
                : ShieldCheck
          }
          variant={
            fin.riskLevel === "exceeded"
              ? "danger"
              : fin.riskLevel === "warning"
                ? "warning"
                : "success"
          }
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <main className="space-y-5">
      {/* Info + Credit + Open Invoices — 3 column */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Contact Info */}
        <div className="lg:col-span-2 bg-slate-900 border border-slate-800 rounded-xl p-5">
          <div className="flex items-center gap-2 mb-4">
            <Badge variant={TYPE_VARIANTS[contact.type]}>
              {TYPE_LABELS[contact.type]}
            </Badge>
            <ActiveBadge isActive={contact.isActive} />
            {contact.paymentTermDays != null && (
              <Badge variant="neutral" dot>
                <Clock className="w-3 h-3 mr-0.5" />
                {contact.paymentTermDays} gün vade
              </Badge>
            )}
            {fin.lastTransactionDate && (
              <Badge variant="neutral">
                <Calendar className="w-3 h-3 mr-0.5" />
                Son: {formatDate(fin.lastTransactionDate)}
              </Badge>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-0.5">
            <InfoRow label="Vergi No" value={contact.taxNumber} />
            <InfoRow label="Vergi Dairesi" value={contact.taxOffice} />
            <InfoRow
              label="E-posta"
              value={
                contact.email && (
                  <span className="flex items-center gap-1.5">
                    <Mail className="w-3.5 h-3.5 text-slate-500" />
                    {contact.email}
                  </span>
                )
              }
            />
            <InfoRow
              label="Telefon"
              value={
                contact.phone && (
                  <span className="flex items-center gap-1.5">
                    <Phone className="w-3.5 h-3.5 text-slate-500" />
                    {contact.phone}
                  </span>
                )
              }
            />
            <InfoRow
              label="Website"
              value={
                contact.website && (
                  <span className="flex items-center gap-1.5">
                    <Globe className="w-3.5 h-3.5 text-slate-500" />
                    {contact.website}
                  </span>
                )
              }
            />
            <InfoRow
              label="Adres"
              value={
                contact.address && (
                  <span className="flex items-center gap-1.5">
                    <MapPin className="w-3.5 h-3.5 text-slate-500" />
                    {[contact.address, contact.city, contact.country]
                      .filter(Boolean)
                      .join(", ")}
                  </span>
                )
              }
            />
          </div>

          {contact.notes && (
            <div className="mt-4 pt-3 border-t border-slate-800">
              <p className="text-[11px] text-slate-500 uppercase tracking-wider mb-1">
                Notlar
              </p>
              <p className="text-sm text-slate-400">{contact.notes}</p>
            </div>
          )}
        </div>

        {/* Right sidebar: Credit + Open Invoices */}
        <div className="space-y-4">
          {creditLimit > 0 && (
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
              <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">
                Kredi Limiti
              </h3>
              <CreditLimitBar used={creditUsed} limit={creditLimit} />
              <div className="mt-3 grid grid-cols-2 gap-3">
                <div>
                  <p className="text-[10px] text-slate-500 uppercase">
                    Kullanılan
                  </p>
                  <p className="text-sm font-medium text-slate-200">
                    {formatCurrency(creditUsed)}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] text-slate-500 uppercase">Kalan</p>
                  <p className="text-sm font-medium text-emerald-400">
                    {formatCurrency(Math.max(creditLimit - creditUsed, 0))}
                  </p>
                </div>
              </div>
            </div>
          )}

          <OpenInvoicesPanel
            invoices={openInvoices}
            onNavigate={(invId) => router.push(`/dashboard/invoices/${invId}`)}
          />

          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
            <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">
              Özet
            </h3>
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">Toplam Hareket</span>
                <span className="text-slate-300 font-medium">
                  {fin.transactionCount}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">Oluşturulma</span>
                <span className="text-slate-300">
                  {formatDate(contact.createdAt)}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">Son Güncelleme</span>
                <span className="text-slate-300">
                  {formatDate(contact.updatedAt)}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Account Statement */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            <h2 className="text-sm font-semibold text-white">Hesap Ekstresi</h2>
            <span className="text-xs text-slate-500">
              {entriesData?.meta.total ?? 0} hareket
            </span>
          </div>
          <div className="flex items-center gap-2">
            {periodTotals && (entriesData?.meta.total ?? 0) > 0 && (
              <div className="flex items-center gap-3 mr-3 text-xs">
                <span className="text-slate-500">Dönem:</span>
                <span className="text-red-400 font-medium tabular-nums">
                  {formatCurrency(periodTotals.debit)} B
                </span>
                <span className="text-emerald-400 font-medium tabular-nums">
                  {formatCurrency(periodTotals.credit)} A
                </span>
              </div>
            )}
            <Button
              variant={showEntryFilters ? "secondary" : "ghost"}
              size="sm"
              leftIcon={<Filter className="w-3 h-3" />}
              onClick={() => setShowEntryFilters((o) => !o)}
            >
              Filtre
              {hasEntryFilters && (
                <span className="ml-1 w-3.5 h-3.5 rounded-full bg-sky-500 text-white text-[9px] flex items-center justify-center">
                  {[dateFrom, dateTo, refType].filter(Boolean).length}
                </span>
              )}
            </Button>
            {hasEntryFilters && (
              <Button
                variant="ghost"
                size="sm"
                leftIcon={<X className="w-3 h-3" />}
                onClick={clearEntryFilters}
              >
                Temizle
              </Button>
            )}
          </div>
        </div>

        {showEntryFilters && (
          <div className="flex flex-wrap gap-2 mb-3 p-3 bg-slate-900/50 border border-slate-800/60 rounded-xl">
            <DatePicker
              value={dateFrom}
              onValueChange={(value) => {
                setDateFrom(value ?? "");
                setEntryPage(1);
              }}
              aria-label="Başlangıç"
              className="w-40"
            />
            <DatePicker
              value={dateTo}
              onValueChange={(value) => {
                setDateTo(value ?? "");
                setEntryPage(1);
              }}
              aria-label="Bitiş"
              className="w-40"
            />
            <Select
              options={REF_TYPE_OPTIONS}
              value={refType}
              onChange={(e) => {
                setRefType(e.target.value);
                setEntryPage(1);
              }}
              className="w-40 !py-1.5 text-xs"
            />
          </div>
        )}

        <DataTable
          columns={entryColumns}
          data={entries}
          keyExtractor={(r) => r.id}
          isLoading={loadingEntries}
          emptyTitle="Henüz hareket yok"
          emptyDescription="Bu cari hesaba ait hareket bulunmuyor."
          pagination={
            entriesData
              ? {
                  page: entryPage,
                  pageSize: 25,
                  total: entriesData.meta.total,
                  totalPages: entriesData.meta.totalPages,
                  onChange: setEntryPage,
                }
              : undefined
          }
        />
      </div>

        </main>

      <EntityActionPanel
        entityType="CONTACT"
        entityId={id}
        displayName={contact.name}
        module="contacts"
        primaryEmail={contact.email}
      />
      </div>

      <ConfirmDialog
        isOpen={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        onConfirm={() =>
          deleteContact.mutate(id, {
            onSuccess: () => router.push("/dashboard/contacts"),
          })
        }
        message={`"${contact.name}" cari hesabını silmek istediğinize emin misiniz?`}
        isLoading={deleteContact.isPending}
      />
    </div>
  );
}
