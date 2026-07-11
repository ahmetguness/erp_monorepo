"use client";

import { Building2, GitBranch, RefreshCw, Repeat2, TrendingUp, Warehouse } from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";
import { DataTable, type ColumnDef } from "@/components/shared/DataTable";
import { Badge, type BadgeVariant } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { useHoldingCompany } from "@/hooks/useEnterprise";
import type { ConsolidatedReportRow, HoldingCompanyNode, IntercompanyTransferRow } from "@/services/enterprise.service";

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY", maximumFractionDigits: 0 }).format(value);
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 2 }).format(value);
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("tr-TR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value));
}

function nodeVariant(type: HoldingCompanyNode["type"]): BadgeVariant {
  if (type === "holding") return "purple";
  if (type === "company") return "info";
  return "neutral";
}

export function HoldingCompanyPage() {
  const { data, isLoading, isFetching, refetch } = useHoldingCompany();

  const organizationColumns: ColumnDef<HoldingCompanyNode>[] = [
    {
      key: "label",
      header: "Holding yapisi",
      render: (row) => (
        <div className={row.type === "branch" ? "pl-8" : row.type === "company" ? "pl-4" : ""}>
          <span className="text-sm font-semibold text-white">{row.label}</span>
          <span className="block text-[11px] text-slate-500">{row.city ?? row.taxNumber ?? "Merkez"}</span>
        </div>
      ),
    },
    { key: "type", header: "Tip", width: "105px", render: (row) => <Badge variant={nodeVariant(row.type)}>{row.type}</Badge> },
    { key: "warehouses", header: "Depo", width: "80px", align: "right", render: (row) => <span className="font-mono text-sky-300">{row.warehouseCount}</span> },
    { key: "stock", header: "Stok Degeri", width: "140px", align: "right", render: (row) => <span className="text-slate-300">{formatCurrency(row.stockValue)}</span> },
  ];

  const transferColumns: ColumnDef<IntercompanyTransferRow>[] = [
    {
      key: "product",
      header: "Urun",
      render: (row) => (
        <div>
          <span className="text-sm font-semibold text-white">{row.productName}</span>
          <span className="block text-[11px] text-slate-500">{row.productCode}</span>
        </div>
      ),
    },
    { key: "from", header: "Kaynak", render: (row) => <span className="text-slate-300">{row.fromBranch}</span> },
    { key: "to", header: "Hedef", render: (row) => <span className="text-slate-300">{row.toBranch}</span> },
    { key: "qty", header: "Miktar", width: "90px", align: "right", render: (row) => <span className="font-mono text-emerald-300">{formatNumber(row.quantity)}</span> },
    { key: "date", header: "Tarih", width: "135px", render: (row) => <span className="text-slate-400">{formatDate(row.createdAt)}</span> },
  ];

  const reportColumns: ColumnDef<ConsolidatedReportRow>[] = [
    { key: "label", header: "Konsolide rapor", render: (row) => <span className="text-sm font-semibold text-white">{row.label}</span> },
    { key: "count", header: "Kayit", width: "90px", align: "right", render: (row) => <span className="font-mono text-sky-300">{row.recordCount}</span> },
    { key: "amount", header: "Tutar", width: "150px", align: "right", render: (row) => <span className="font-medium text-slate-200">{formatCurrency(row.amount)}</span> },
  ];

  const summary = data?.summary;

  return (
    <div>
      <PageHeader
        title="Coklu sirket/sube"
        subtitle="Holding yapisi, sirketler arasi stok transferleri ve konsolide raporlar."
        action={
          <Button variant="secondary" size="sm" onClick={() => void refetch()} loading={isFetching}>
            <RefreshCw className="h-3.5 w-3.5" />
            Yenile
          </Button>
        }
      />

      <div className="mb-5 grid gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Metric icon={<Building2 className="h-4 w-4" />} label="Sirket" value={summary?.companyCount ?? 0} />
        <Metric icon={<GitBranch className="h-4 w-4" />} label="Sube" value={summary?.branchCount ?? 0} />
        <Metric icon={<Warehouse className="h-4 w-4" />} label="Depo" value={summary?.warehouseCount ?? 0} />
        <Metric icon={<TrendingUp className="h-4 w-4" />} label="Satis" value={formatCurrency(summary?.consolidatedSales ?? 0)} />
        <Metric icon={<Repeat2 className="h-4 w-4" />} label="Transfer" value={summary?.intercompanyTransferCount ?? 0} />
        <Metric icon={<Warehouse className="h-4 w-4" />} label="Stok Degeri" value={formatCurrency(summary?.consolidatedStockValue ?? 0)} />
      </div>

      <div className="space-y-6">
        <section>
          <h2 className="mb-3 text-sm font-semibold text-white">Holding yapisi</h2>
          <DataTable columns={organizationColumns} data={data?.organization ?? []} keyExtractor={(row) => row.id} isLoading={isLoading}
            emptyTitle="Yapi bulunamadi" emptyDescription="Sirket ve depo bilgileri olusturuldugunda holding agaci burada gorunur." />
        </section>
        <section>
          <h2 className="mb-3 text-sm font-semibold text-white">Sirketler arasi stok transferleri</h2>
          <DataTable columns={transferColumns} data={data?.intercompanyTransfers ?? []} keyExtractor={(row) => row.id} isLoading={isLoading}
            emptyTitle="Transfer yok" emptyDescription="Depolar arasi transferler sirket/sube transfer akisi olarak burada izlenir." />
        </section>
        <section>
          <h2 className="mb-3 text-sm font-semibold text-white">Konsolide raporlar</h2>
          <DataTable columns={reportColumns} data={data?.consolidatedReports ?? []} keyExtractor={(row) => row.key} isLoading={isLoading}
            emptyTitle="Rapor verisi yok" emptyDescription="Fatura, tahsilat ve stok kayitlari konsolide ozetleri besler." />
        </section>
      </div>
    </div>
  );
}

function Metric({ icon, label, value }: { icon: React.ReactNode; label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900 p-4">
      <div className="text-sky-400">{icon}</div>
      <span className="mt-3 block text-[10px] font-bold uppercase tracking-wider text-slate-500">{label}</span>
      <span className="mt-1 block truncate text-xl font-bold text-white">{value}</span>
    </div>
  );
}
