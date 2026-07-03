"use client";

import { useState } from "react";
import { AlertTriangle, CalendarDays, PackageSearch, RefreshCw, Wrench } from "lucide-react";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/shared/PageHeader";
import { DataTable, type ColumnDef } from "@/components/shared/DataTable";
import { Badge, type BadgeVariant } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { useMaintenanceManagement } from "@/hooks/useService";
import type {
  MaintenanceFaultRow,
  MaintenanceFaultStatus,
  MaintenancePlanRow,
  MaintenancePlanStatus,
  MaintenancePriority,
  MaintenanceSparePartRow,
  SparePartRisk,
} from "@/services/service.service";

function formatDate(value: string | null): string {
  if (!value) return "-";
  return new Intl.DateTimeFormat("tr-TR", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(value));
}

function formatQty(value: number | null): string {
  if (value === null) return "-";
  return new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 3 }).format(value);
}

function planVariant(status: MaintenancePlanStatus): BadgeVariant {
  if (status === "overdue") return "danger";
  if (status === "due_soon") return "warning";
  return "info";
}

function planLabel(status: MaintenancePlanStatus): string {
  if (status === "overdue") return "Gecikti";
  if (status === "due_soon") return "Yaklasiyor";
  return "Planli";
}

function faultStatusVariant(status: MaintenanceFaultStatus): BadgeVariant {
  if (status === "waiting_parts") return "warning";
  if (status === "in_progress") return "info";
  if (status === "waiting_customer") return "neutral";
  return "danger";
}

function faultStatusLabel(status: MaintenanceFaultStatus): string {
  if (status === "waiting_parts") return "Parca bekliyor";
  if (status === "in_progress") return "Devam";
  if (status === "waiting_customer") return "Musteri bekliyor";
  return "Acik";
}

function priorityVariant(priority: MaintenancePriority): BadgeVariant {
  if (priority === "critical") return "danger";
  if (priority === "high") return "warning";
  if (priority === "low") return "neutral";
  return "info";
}

function priorityLabel(priority: MaintenancePriority): string {
  if (priority === "critical") return "Kritik";
  if (priority === "high") return "Yuksek";
  if (priority === "low") return "Dusuk";
  return "Orta";
}

function partRiskVariant(risk: SparePartRisk): BadgeVariant {
  if (risk === "low_stock") return "warning";
  if (risk === "unlinked") return "neutral";
  return "success";
}

function partRiskLabel(risk: SparePartRisk): string {
  if (risk === "low_stock") return "Dusuk stok";
  if (risk === "unlinked") return "Urun bagli degil";
  return "Hazir";
}

function assetSubtitle(asset: { brand: string | null; model: string | null; serialNo: string | null }): string {
  return [asset.brand, asset.model, asset.serialNo].filter(Boolean).join(" / ") || "-";
}

export function MaintenanceManagementPage() {
  const router = useRouter();
  const [horizonDays, setHorizonDays] = useState(90);
  const { data, isLoading, isFetching, refetch } = useMaintenanceManagement({ horizonDays });

  const planColumns: ColumnDef<MaintenancePlanRow>[] = [
    {
      key: "asset",
      header: "Makine / Ekipman",
      render: (row) => (
        <div>
          <span className="text-sm font-semibold text-white">{row.asset.name}</span>
          <span className="block text-[11px] text-slate-500">{assetSubtitle(row.asset)}</span>
        </div>
      ),
    },
    {
      key: "contact",
      header: "Musteri",
      width: "160px",
      render: (row) => <span className="text-slate-300">{row.contact.name}</span>,
    },
    {
      key: "last",
      header: "Son Bakim",
      width: "120px",
      render: (row) => <span className="text-slate-400">{formatDate(row.lastServiceAt)}</span>,
    },
    {
      key: "next",
      header: "Plan Tarihi",
      width: "120px",
      render: (row) => <span className="font-semibold text-white">{formatDate(row.nextDueAt)}</span>,
    },
    {
      key: "faults",
      header: "Ariza",
      width: "90px",
      align: "right",
      render: (row) => <span className={row.openFaultCount > 0 ? "font-semibold text-amber-300" : "text-slate-500"}>{row.openFaultCount}</span>,
    },
    {
      key: "status",
      header: "Durum",
      width: "110px",
      render: (row) => <Badge variant={planVariant(row.status)}>{planLabel(row.status)}</Badge>,
    },
  ];

  const faultColumns: ColumnDef<MaintenanceFaultRow>[] = [
    {
      key: "number",
      header: "Talep",
      width: "110px",
      render: (row) => <span className="font-mono text-sky-300">{row.number}</span>,
    },
    {
      key: "subject",
      header: "Ariza",
      render: (row) => (
        <div>
          <span className="text-sm font-semibold text-white">{row.subject}</span>
          <span className="block text-[11px] text-slate-500">{row.asset?.name ?? row.contact?.name ?? "Varlik bagli degil"}</span>
        </div>
      ),
    },
    {
      key: "priority",
      header: "Oncelik",
      width: "95px",
      render: (row) => <Badge variant={priorityVariant(row.priority)}>{priorityLabel(row.priority)}</Badge>,
    },
    {
      key: "parts",
      header: "Parca",
      width: "80px",
      align: "right",
      render: (row) => <span className="text-slate-300">{row.sparePartCount}</span>,
    },
    {
      key: "created",
      header: "Acilis",
      width: "120px",
      render: (row) => <span className="text-slate-400">{formatDate(row.createdAt)}</span>,
    },
    {
      key: "status",
      header: "Durum",
      width: "120px",
      render: (row) => <Badge variant={faultStatusVariant(row.status)}>{faultStatusLabel(row.status)}</Badge>,
    },
  ];

  const partColumns: ColumnDef<MaintenanceSparePartRow>[] = [
    {
      key: "request",
      header: "Talep",
      width: "110px",
      render: (row) => <span className="font-mono text-sky-300">{row.serviceRequestNumber}</span>,
    },
    {
      key: "part",
      header: "Yedek Parca",
      render: (row) => (
        <div>
          <span className="text-sm font-semibold text-white">{row.product?.name ?? row.description}</span>
          <span className="block font-mono text-[11px] text-slate-500">{row.product?.code ?? "urun bagli degil"}</span>
        </div>
      ),
    },
    {
      key: "asset",
      header: "Ekipman",
      width: "160px",
      render: (row) => <span className="text-slate-300">{row.asset?.name ?? "-"}</span>,
    },
    {
      key: "quantity",
      header: "Ihtiyac",
      width: "100px",
      align: "right",
      render: (row) => <span className="text-slate-300">{formatQty(row.quantity)}</span>,
    },
    {
      key: "available",
      header: "Stok",
      width: "100px",
      align: "right",
      render: (row) => <span className="text-slate-400">{formatQty(row.availableQty)}</span>,
    },
    {
      key: "risk",
      header: "Durum",
      width: "120px",
      render: (row) => <Badge variant={partRiskVariant(row.risk)}>{partRiskLabel(row.risk)}</Badge>,
    },
  ];

  const summary = data?.summary;

  return (
    <div>
      <PageHeader
        title="Bakim Yonetimi"
        subtitle="Makine ve ekipman bakim planlari, ariza kayitlari ve yedek parca baglantilari."
        action={
          <>
            <Select
              value={String(horizonDays)}
              onChange={(event) => setHorizonDays(Number(event.target.value))}
              options={[
                { value: "30", label: "30 gun" },
                { value: "60", label: "60 gun" },
                { value: "90", label: "90 gun" },
                { value: "180", label: "180 gun" },
              ]}
              className="h-9 py-1.5 text-xs"
            />
            <Button variant="secondary" size="sm" onClick={() => void refetch()} loading={isFetching}>
              <RefreshCw className="h-3.5 w-3.5" />
              Yenile
            </Button>
          </>
        }
      />

      <div className="mb-5 grid gap-3 md:grid-cols-4">
        <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
          <CalendarDays className="mb-2 h-4 w-4 text-sky-400" />
          <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-500">Bakim Plani</span>
          <span className="mt-1 block text-2xl font-bold text-white">{summary?.duePlanCount ?? 0}</span>
          <span className="mt-1 block text-xs text-slate-500">{summary?.assetCount ?? 0} aktif ekipman</span>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
          <AlertTriangle className="mb-2 h-4 w-4 text-red-400" />
          <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-500">Geciken</span>
          <span className="mt-1 block text-2xl font-bold text-white">{summary?.overduePlanCount ?? 0}</span>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
          <Wrench className="mb-2 h-4 w-4 text-amber-400" />
          <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-500">Acik Ariza</span>
          <span className="mt-1 block text-2xl font-bold text-white">{summary?.openFaultCount ?? 0}</span>
          <span className="mt-1 block text-xs text-slate-500">{summary?.waitingPartFaultCount ?? 0} parca bekliyor</span>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
          <PackageSearch className="mb-2 h-4 w-4 text-emerald-400" />
          <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-500">Yedek Parca</span>
          <span className="mt-1 block text-2xl font-bold text-white">{summary?.sparePartLinkCount ?? 0}</span>
          <span className="mt-1 block text-xs text-slate-500">{summary?.lowStockPartCount ?? 0} dusuk stok</span>
        </div>
      </div>

      <div className="space-y-6">
        <section>
          <h2 className="mb-3 text-sm font-semibold text-white">Bakim Planlari</h2>
          <DataTable
            columns={planColumns}
            data={data?.plans ?? []}
            keyExtractor={(row) => row.id}
            isLoading={isLoading}
            emptyTitle="Planlanacak bakim yok"
            emptyDescription="Secili pencerede bakim tarihi yaklasan aktif ekipman bulunmuyor."
          />
        </section>

        <section>
          <h2 className="mb-3 text-sm font-semibold text-white">Ariza Kayitlari</h2>
          <DataTable
            columns={faultColumns}
            data={data?.faults ?? []}
            keyExtractor={(row) => row.id}
            isLoading={isLoading}
            onRowClick={(row) => router.push(row.href)}
            emptyTitle="Acik ariza yok"
            emptyDescription="Acik, devam eden veya parca bekleyen servis talebi bulunmuyor."
          />
        </section>

        <section>
          <h2 className="mb-3 text-sm font-semibold text-white">Yedek Parca Baglantilari</h2>
          <DataTable
            columns={partColumns}
            data={data?.spareParts ?? []}
            keyExtractor={(row) => row.id}
            isLoading={isLoading}
            emptyTitle="Yedek parca baglantisi yok"
            emptyDescription="Acik servis taleplerine bagli urun veya parca kalemi bulunmuyor."
          />
        </section>
      </div>
    </div>
  );
}
