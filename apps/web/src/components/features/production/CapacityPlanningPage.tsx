"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, CalendarDays, Gauge, ListOrdered, RefreshCw, ShieldAlert, Wrench } from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";
import { DataTable, type ColumnDef } from "@/components/shared/DataTable";
import { Badge, type BadgeVariant } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { useCapacityPlanning } from "@/hooks/useProduction";
import type {
  CapacityBottleneckRow,
  CapacityCalendarRow,
  CapacitySequenceRow,
} from "@/services/production.service";

function formatHours(value: number): string {
  return `${new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 1 }).format(value)} saat`;
}

function formatPct(value: number): string {
  return `%${new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 1 }).format(value)}`;
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("tr-TR", { day: "2-digit", month: "short" }).format(new Date(value));
}

function severityVariant(severity: CapacityBottleneckRow["severity"]): BadgeVariant {
  if (severity === "critical") return "danger";
  if (severity === "watch") return "warning";
  return "success";
}

function severityLabel(severity: CapacityBottleneckRow["severity"]): string {
  if (severity === "critical") return "Darboğaz";
  if (severity === "watch") return "İzle";
  return "Normal";
}

function blockageLabel(reasons: string[]): string {
  return reasons.length > 0 ? reasons.join(" / ") : "Yok";
}

export function CapacityPlanningPage() {
  const [horizonDays, setHorizonDays] = useState(14);
  const { data, isLoading, isFetching, refetch } = useCapacityPlanning({ horizonDays });

  const calendarRows = useMemo(
    () => (data?.calendar ?? [])
      .filter((row) => row.allocatedHours > 0 || row.utilizationPct >= 70 || row.blockages.reasons.length > 0)
      .slice(0, 80),
    [data?.calendar],
  );

  const bottleneckColumns: ColumnDef<CapacityBottleneckRow>[] = [
    {
      key: "workCenter",
      header: "İş Merkezi",
      render: (row) => (
        <div>
          <span className="text-sm font-semibold text-white">{row.workCenter.name}</span>
          <span className="block font-mono text-[11px] text-slate-500">{row.workCenter.code}</span>
        </div>
      ),
    },
    {
      key: "load",
      header: "Yük",
      width: "130px",
      align: "right",
      render: (row) => <span className="text-slate-300">{formatHours(row.totalLoadHours)}</span>,
    },
    {
      key: "capacity",
      header: "Kapasite",
      width: "130px",
      align: "right",
      render: (row) => (
        <div className="text-right">
          <span className="text-slate-400">{formatHours(row.capacityHours)}</span>
          {row.blockedHours > 0 && <span className="block text-[11px] text-red-300">-{formatHours(row.blockedHours)}</span>}
        </div>
      ),
    },
    {
      key: "maintenance",
      header: "Bakim",
      width: "90px",
      align: "right",
      render: (row) => <span className={row.maintenanceTaskCount > 0 ? "font-semibold text-amber-300" : "text-slate-500"}>{row.maintenanceTaskCount}</span>,
    },
    {
      key: "utilization",
      header: "Kullanım",
      width: "120px",
      align: "right",
      render: (row) => <span className="font-semibold text-white">{formatPct(row.utilizationPct)}</span>,
    },
    {
      key: "severity",
      header: "Durum",
      width: "110px",
      render: (row) => <Badge variant={severityVariant(row.severity)}>{severityLabel(row.severity)}</Badge>,
    },
  ];

  const calendarColumns: ColumnDef<CapacityCalendarRow>[] = [
    {
      key: "date",
      header: "Tarih",
      width: "100px",
      render: (row) => <span className="text-slate-300">{formatDate(row.date)}</span>,
    },
    {
      key: "workCenter",
      header: "İş Merkezi",
      render: (row) => (
        <div>
          <span className="text-sm font-semibold text-white">{row.workCenter.name}</span>
          <span className="block font-mono text-[11px] text-slate-500">{row.workCenter.code}</span>
        </div>
      ),
    },
    {
      key: "shifts",
      header: "Vardiya",
      width: "120px",
      render: (row) => <span className="text-slate-300">{row.shifts.shiftCount} x {formatHours(row.shifts.hoursPerShift)}</span>,
    },
    {
      key: "allocated",
      header: "Ayrılmış",
      width: "120px",
      align: "right",
      render: (row) => <span className="text-slate-300">{formatHours(row.allocatedHours)}</span>,
    },
    {
      key: "available",
      header: "Boş",
      width: "100px",
      align: "right",
      render: (row) => <span className="text-emerald-300">{formatHours(row.availableHours)}</span>,
    },
    {
      key: "blockages",
      header: "Blokaj",
      width: "190px",
      render: (row) => (
        <div>
          <span className={row.blockages.reasons.length > 0 ? "text-amber-300" : "text-slate-500"}>{blockageLabel(row.blockages.reasons)}</span>
          {(row.blockages.downtimeHours > 0 || row.blockages.maintenanceTaskCount > 0) && (
            <span className="block text-[11px] text-slate-500">
              {formatHours(row.blockages.downtimeHours)} durus / {row.blockages.maintenanceTaskCount} bakim
            </span>
          )}
        </div>
      ),
    },
    {
      key: "utilization",
      header: "Kullanım",
      width: "110px",
      align: "right",
      render: (row) => <span className={row.utilizationPct >= 85 ? "font-semibold text-amber-300" : "text-slate-400"}>{formatPct(row.utilizationPct)}</span>,
    },
  ];

  const sequenceColumns: ColumnDef<CapacitySequenceRow>[] = [
    {
      key: "rank",
      header: "Sıra",
      width: "70px",
      align: "center",
      render: (row) => <span className="font-mono text-sky-300">#{row.queueRank}</span>,
    },
    {
      key: "workOrder",
      header: "İş Emri",
      width: "120px",
      render: (row) => <span className="font-mono text-sky-300">{row.workOrderNumber}</span>,
    },
    {
      key: "operation",
      header: "Operasyon",
      render: (row) => (
        <div>
          <span className="text-sm font-semibold text-white">{row.operationName}</span>
          <span className="block text-[11px] text-slate-500">{row.product.name}</span>
        </div>
      ),
    },
    {
      key: "workCenter",
      header: "İş Merkezi",
      width: "150px",
      render: (row) => <span className="text-slate-300">{row.workCenter.name}</span>,
    },
    {
      key: "hours",
      header: "Süre",
      width: "100px",
      align: "right",
      render: (row) => <span className="text-slate-300">{formatHours(row.estimatedHours)}</span>,
    },
    {
      key: "status",
      header: "Durum",
      width: "110px",
      render: (row) => <Badge variant={row.status === "IN_PROGRESS" ? "warning" : "info"}>{row.status}</Badge>,
    },
  ];

  const summary = data?.summary;

  return (
    <div>
      <PageHeader
        title="Kapasite Planlama"
        subtitle="İş merkezi takvimi, vardiya kapasitesi, darboğazlar ve iş emri operasyon sırası."
        action={
          <>
            <Select
              value={String(horizonDays)}
              onChange={(event) => setHorizonDays(Number(event.target.value))}
              options={[
                { value: "7", label: "7 gün" },
                { value: "14", label: "14 gün" },
                { value: "30", label: "30 gün" },
                { value: "60", label: "60 gün" },
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

      <div className="mb-5 grid gap-3 md:grid-cols-4 xl:grid-cols-6">
        <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
          <Gauge className="mb-2 h-4 w-4 text-sky-400" />
          <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-500">İş Merkezi</span>
          <span className="mt-1 block text-2xl font-bold text-white">{summary?.workCenterCount ?? 0}</span>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
          <AlertTriangle className="mb-2 h-4 w-4 text-amber-400" />
          <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-500">Darboğaz</span>
          <span className="mt-1 block text-2xl font-bold text-white">{summary?.bottleneckCount ?? 0}</span>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
          <ListOrdered className="mb-2 h-4 w-4 text-violet-400" />
          <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-500">Sıradaki Operasyon</span>
          <span className="mt-1 block text-2xl font-bold text-white">{summary?.queuedOperationCount ?? 0}</span>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
          <CalendarDays className="mb-2 h-4 w-4 text-emerald-400" />
          <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-500">Takvim</span>
          <span className="mt-1 block text-2xl font-bold text-white">{summary?.calendarDays ?? horizonDays}</span>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
          <ShieldAlert className="mb-2 h-4 w-4 text-red-400" />
          <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-500">Durus Blokaji</span>
          <span className="mt-1 block text-2xl font-bold text-white">{summary?.downtimeBlockCount ?? 0}</span>
          <span className="mt-1 block text-xs text-slate-500">{formatHours(summary?.blockedHours ?? 0)}</span>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
          <Wrench className="mb-2 h-4 w-4 text-amber-400" />
          <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-500">Bakim / Vardiya</span>
          <span className="mt-1 block text-2xl font-bold text-white">{summary?.maintenanceBlockCount ?? 0}</span>
          <span className="mt-1 block text-xs text-slate-500">{summary?.shiftCount ?? 0} vardiya</span>
        </div>
      </div>

      <div className="space-y-6">
        <section>
          <h2 className="mb-3 text-sm font-semibold text-white">Darboğaz Görünümü</h2>
          <DataTable
            columns={bottleneckColumns}
            data={data?.bottlenecks ?? []}
            keyExtractor={(row) => row.workCenter.id}
            isLoading={isLoading}
            emptyTitle="İş merkezi bulunamadı"
            emptyDescription="Kapasite planlama için aktif iş merkezi ekleyin."
          />
        </section>

        <section>
          <h2 className="mb-3 text-sm font-semibold text-white">İş Merkezi Takvimi ve Vardiya</h2>
          <DataTable
            columns={calendarColumns}
            data={calendarRows}
            keyExtractor={(row) => `${row.workCenter.id}-${row.date}`}
            isLoading={isLoading}
            emptyTitle="Yoğun takvim satırı yok"
            emptyDescription="Seçili pencerede kapasite kullanımı düşük görünüyor."
          />
        </section>

        <section>
          <h2 className="mb-3 text-sm font-semibold text-white">İş Emri Sıralama</h2>
          <DataTable
            columns={sequenceColumns}
            data={data?.sequence ?? []}
            keyExtractor={(row) => row.id}
            isLoading={isLoading}
            emptyTitle="Sırada operasyon yok"
            emptyDescription="Planlı veya devam eden iş emri operasyonu bulunmuyor."
          />
        </section>
      </div>
    </div>
  );
}
