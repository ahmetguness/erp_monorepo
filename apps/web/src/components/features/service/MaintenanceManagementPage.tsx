"use client";

import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import { AlertTriangle, CalendarDays, PackageSearch, RefreshCw, Wrench } from "lucide-react";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/shared/PageHeader";
import { DataTable, type ColumnDef } from "@/components/shared/DataTable";
import { Badge, type BadgeVariant } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { useMaintenanceManagement } from "@/hooks/useService";
import { cn } from "@/lib/utils";
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
  if (status === "due_soon") return "Yaklaşıyor";
  return "Planlı";
}

function faultStatusVariant(status: MaintenanceFaultStatus): BadgeVariant {
  if (status === "waiting_parts") return "warning";
  if (status === "in_progress") return "info";
  if (status === "waiting_customer") return "neutral";
  return "danger";
}

function faultStatusLabel(status: MaintenanceFaultStatus): string {
  if (status === "waiting_parts") return "Parça bekliyor";
  if (status === "in_progress") return "Devam ediyor";
  if (status === "waiting_customer") return "Müşteri bekliyor";
  return "Açık";
}

function priorityVariant(priority: MaintenancePriority): BadgeVariant {
  if (priority === "critical") return "danger";
  if (priority === "high") return "warning";
  if (priority === "low") return "neutral";
  return "info";
}

function priorityLabel(priority: MaintenancePriority): string {
  if (priority === "critical") return "Kritik";
  if (priority === "high") return "Yüksek";
  if (priority === "low") return "Düşük";
  return "Orta";
}

function partRiskVariant(risk: SparePartRisk): BadgeVariant {
  if (risk === "low_stock") return "warning";
  if (risk === "unlinked") return "neutral";
  return "success";
}

function partRiskLabel(risk: SparePartRisk): string {
  if (risk === "low_stock") return "Düşük stok";
  if (risk === "unlinked") return "Ürün bağlı değil";
  return "Hazır";
}

function assetSubtitle(asset: { brand: string | null; model: string | null; serialNo: string | null }): string {
  return [asset.brand, asset.model, asset.serialNo].filter(Boolean).join(" / ") || "-";
}

export function MaintenanceManagementPage() {
  const router = useRouter();
  const [horizonDays, setHorizonDays] = useState(90);
  const { data, isLoading, isFetching, refetch } = useMaintenanceManagement({ horizonDays });
  const summary = data?.summary;

  const duePlans = useMemo(
    () => [...(data?.plans ?? [])].sort((a, b) => new Date(a.nextDueAt).getTime() - new Date(b.nextDueAt).getTime()),
    [data?.plans],
  );
  const openFaults = useMemo(
    () => [...(data?.faults ?? [])].sort((a, b) => priorityRank(b.priority) - priorityRank(a.priority)),
    [data?.faults],
  );

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
      header: "Müşteri",
      width: "180px",
      render: (row) => <span className="text-slate-300">{row.contact.name}</span>,
    },
    {
      key: "last",
      header: "Son Bakım",
      width: "125px",
      render: (row) => <span className="text-slate-400">{formatDate(row.lastServiceAt)}</span>,
    },
    {
      key: "next",
      header: "Plan Tarihi",
      width: "125px",
      render: (row) => <span className="font-semibold text-white">{formatDate(row.nextDueAt)}</span>,
    },
    {
      key: "faults",
      header: "Açık Arıza",
      width: "105px",
      align: "right",
      render: (row) => <span className={row.openFaultCount > 0 ? "font-semibold text-amber-300" : "text-slate-500"}>{row.openFaultCount}</span>,
    },
    {
      key: "status",
      header: "Durum",
      width: "115px",
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
      header: "Arıza",
      render: (row) => (
        <div>
          <span className="text-sm font-semibold text-white">{row.subject}</span>
          <span className="block text-[11px] text-slate-500">{row.asset?.name ?? row.contact?.name ?? "Varlık bağlı değil"}</span>
        </div>
      ),
    },
    {
      key: "priority",
      header: "Öncelik",
      width: "100px",
      render: (row) => <Badge variant={priorityVariant(row.priority)}>{priorityLabel(row.priority)}</Badge>,
    },
    {
      key: "parts",
      header: "Parça",
      width: "80px",
      align: "right",
      render: (row) => <span className={row.sparePartCount > 0 ? "font-medium text-amber-300" : "text-slate-500"}>{row.sparePartCount}</span>,
    },
    {
      key: "created",
      header: "Açılış",
      width: "125px",
      render: (row) => <span className="text-slate-400">{formatDate(row.createdAt)}</span>,
    },
    {
      key: "status",
      header: "Durum",
      width: "135px",
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
      header: "Yedek Parça",
      render: (row) => (
        <div>
          <span className="text-sm font-semibold text-white">{row.product?.name ?? row.description}</span>
          <span className="block font-mono text-[11px] text-slate-500">{row.product?.code ?? "Ürün bağlı değil"}</span>
        </div>
      ),
    },
    {
      key: "asset",
      header: "Ekipman",
      width: "180px",
      render: (row) => <span className="text-slate-300">{row.asset?.name ?? "-"}</span>,
    },
    {
      key: "quantity",
      header: "İhtiyaç",
      width: "100px",
      align: "right",
      render: (row) => <span className="tabular-nums text-slate-300">{formatQty(row.quantity)}</span>,
    },
    {
      key: "available",
      header: "Stok",
      width: "100px",
      align: "right",
      render: (row) => <span className="tabular-nums text-slate-400">{formatQty(row.availableQty)}</span>,
    },
    {
      key: "risk",
      header: "Durum",
      width: "130px",
      render: (row) => <Badge variant={partRiskVariant(row.risk)}>{partRiskLabel(row.risk)}</Badge>,
    },
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        title="Bakım yönetimi"
        subtitle="Yaklaşan bakım planları, açık arızalar ve yedek parça bağlantılarını tek bakım panosunda izleyin."
        className="mb-0"
        action={
          <div className="flex items-center gap-2">
            <Select
              value={String(horizonDays)}
              onChange={(event) => setHorizonDays(Number(event.target.value))}
              options={[
                { value: "30", label: "30 gün" },
                { value: "60", label: "60 gün" },
                { value: "90", label: "90 gün" },
                { value: "180", label: "180 gün" },
              ]}
              className="h-9 py-1.5 text-xs"
            />
            <Button variant="secondary" size="sm" onClick={() => void refetch()} loading={isFetching} leftIcon={<RefreshCw className="h-3.5 w-3.5" />}>
              Yenile
            </Button>
          </div>
        }
      />

      {isLoading && !data ? (
        <LoadingState />
      ) : (
        <>
          <SummaryStrip
            metrics={[
              { label: "Aktif Ekipman", value: summary?.assetCount ?? 0, tone: "text-slate-50" },
              { label: "Bakım Planı", value: summary?.duePlanCount ?? 0, tone: "text-sky-200" },
              { label: "Geciken", value: summary?.overduePlanCount ?? 0, tone: (summary?.overduePlanCount ?? 0) > 0 ? "text-red-300" : "text-slate-200" },
              { label: "Açık Arıza", value: summary?.openFaultCount ?? 0, tone: (summary?.openFaultCount ?? 0) > 0 ? "text-amber-300" : "text-slate-200" },
              { label: "Parça Bekleyen", value: summary?.waitingPartFaultCount ?? 0, tone: (summary?.waitingPartFaultCount ?? 0) > 0 ? "text-amber-300" : "text-slate-200" },
              { label: "Düşük Stok", value: summary?.lowStockPartCount ?? 0, tone: (summary?.lowStockPartCount ?? 0) > 0 ? "text-red-300" : "text-slate-200" },
            ]}
          />

          {((summary?.overduePlanCount ?? 0) > 0 || (summary?.waitingPartFaultCount ?? 0) > 0 || (summary?.lowStockPartCount ?? 0) > 0) && (
            <AttentionBar
              overdue={summary?.overduePlanCount ?? 0}
              waitingParts={summary?.waitingPartFaultCount ?? 0}
              lowStock={summary?.lowStockPartCount ?? 0}
            />
          )}

          <section className="grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
            <Panel title="Bakım planları" subtitle={`${horizonDays} günlük pencerede tarihi yaklaşan ekipmanlar.`} icon={<CalendarDays className="h-4 w-4 text-sky-300" />}>
              <DataTable
                columns={planColumns}
                data={duePlans}
                keyExtractor={(row) => row.id}
                isLoading={isLoading}
                emptyTitle="Planlanacak bakım yok"
                emptyDescription="Seçili pencerede bakım tarihi yaklaşan aktif ekipman bulunmuyor."
              />
            </Panel>

            <Panel title="Arıza kayıtları" subtitle="Önceliği yüksek ve parça bekleyen talepler önce değerlendirilir." icon={<Wrench className="h-4 w-4 text-amber-300" />}>
              <DataTable
                columns={faultColumns}
                data={openFaults}
                keyExtractor={(row) => row.id}
                isLoading={isLoading}
                onRowClick={(row) => router.push(row.href)}
                emptyTitle="Açık arıza yok"
                emptyDescription="Açık, devam eden veya parça bekleyen servis talebi bulunmuyor."
              />
            </Panel>
          </section>

          <Panel title="Yedek parça bağlantıları" subtitle="Servis taleplerine bağlı ihtiyaç, stok ve bağlantı durumları." icon={<PackageSearch className="h-4 w-4 text-emerald-300" />}>
            <DataTable
              columns={partColumns}
              data={data?.spareParts ?? []}
              keyExtractor={(row) => row.id}
              isLoading={isLoading}
              emptyTitle="Yedek parça bağlantısı yok"
              emptyDescription="Açık servis taleplerine bağlı ürün veya parça kalemi bulunmuyor."
            />
          </Panel>
        </>
      )}
    </div>
  );
}

function priorityRank(priority: MaintenancePriority): number {
  if (priority === "critical") return 4;
  if (priority === "high") return 3;
  if (priority === "medium") return 2;
  return 1;
}

function LoadingState() {
  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-slate-800/80 bg-slate-950/35 px-4 py-3">
        <div className="h-5 w-3/4 animate-pulse rounded bg-slate-800/80" />
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        {[1, 2].map((item) => (
          <div key={item} className="rounded-xl border border-slate-800/80 bg-slate-950/35 p-4">
            <div className="h-5 w-40 animate-pulse rounded bg-slate-800/80" />
            <div className="mt-4 space-y-3">
              {Array.from({ length: 5 }).map((_, index) => <div key={index} className="h-10 animate-pulse rounded bg-slate-800/60" />)}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function SummaryStrip({ metrics }: { metrics: Array<{ label: string; value: ReactNode; tone: string }> }) {
  return (
    <div className="rounded-xl border border-slate-800/80 bg-slate-950/35 px-4 py-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
        {metrics.map((metric, index) => (
          <div key={metric.label} className="flex items-center gap-x-4">
            {index > 0 && <span className="h-4 w-px bg-slate-800" />}
            <span className={cn("font-semibold tabular-nums", metric.tone)}>
              {metric.value} <span className="text-[11px] font-medium uppercase text-slate-500">{metric.label}</span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function AttentionBar({ overdue, waitingParts, lowStock }: { overdue: number; waitingParts: number; lowStock: number }) {
  return (
    <div className="rounded-xl border border-amber-500/25 bg-amber-500/[0.06] px-4 py-3">
      <div className="flex items-center gap-2 text-sm text-amber-100">
        <AlertTriangle className="h-4 w-4 shrink-0 text-amber-300" />
        <span>
          Bakım operasyonunda dikkat isteyen alanlar var:
          {overdue > 0 && <strong className="ml-1 font-semibold">{overdue} geciken bakım</strong>}
          {waitingParts > 0 && <strong className="ml-1 font-semibold">{waitingParts} parça bekleyen arıza</strong>}
          {lowStock > 0 && <strong className="ml-1 font-semibold">{lowStock} düşük stok bağlantısı</strong>}.
        </span>
      </div>
    </div>
  );
}

function Panel({ title, subtitle, icon, children }: { title: string; subtitle?: string; icon?: ReactNode; children: ReactNode }) {
  return (
    <section className="rounded-xl border border-slate-800/80 bg-slate-950/40">
      <div className="border-b border-slate-800/70 bg-slate-900/45 px-4 py-3">
        <div className="flex items-center gap-2">
          {icon}
          <h2 className="text-sm font-semibold text-white">{title}</h2>
        </div>
        {subtitle && <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p>}
      </div>
      <div className="p-4">{children}</div>
    </section>
  );
}
