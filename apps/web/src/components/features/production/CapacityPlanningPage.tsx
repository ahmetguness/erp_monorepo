"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { AlertTriangle, CalendarDays, Gauge, ListOrdered, RefreshCw, ShieldAlert, Wrench } from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";
import { Badge, type BadgeVariant } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { useCapacityPlanning } from "@/hooks/useProduction";
import { cn } from "@/lib/utils";
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

function formatDateTime(value: string | null): string {
  if (!value) return "-";
  return new Intl.DateTimeFormat("tr-TR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

function severityVariant(severity: CapacityBottleneckRow["severity"]): BadgeVariant {
  if (severity === "critical") return "danger";
  if (severity === "watch") return "warning";
  return "info";
}

function severityLabel(severity: CapacityBottleneckRow["severity"]): string {
  if (severity === "critical") return "Darboğaz";
  if (severity === "watch") return "İzle";
  return "Normal";
}

function statusLabel(status: CapacitySequenceRow["status"]): string {
  if (status === "IN_PROGRESS") return "Devam ediyor";
  if (status === "PAUSED") return "Durakladı";
  return "Planlandı";
}

function workOrderHref(id: string): string {
  return `/dashboard/production/work-orders/${id}`;
}

export function CapacityPlanningPage() {
  const [horizonDays, setHorizonDays] = useState(14);
  const { data, isLoading, isFetching, refetch } = useCapacityPlanning({ horizonDays });

  const bottleneckRows = useMemo(
    () => [...(data?.bottlenecks ?? [])].sort((a, b) => b.utilizationPct - a.utilizationPct),
    [data?.bottlenecks],
  );
  const calendarRows = useMemo(
    () => (data?.calendar ?? [])
      .filter((row) => row.allocatedHours > 0 || row.utilizationPct >= 70 || row.blockages.reasons.length > 0)
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime() || b.utilizationPct - a.utilizationPct)
      .slice(0, 80),
    [data?.calendar],
  );
  const sequenceRows = useMemo(
    () => [...(data?.sequence ?? [])].sort((a, b) => a.queueRank - b.queueRank).slice(0, 80),
    [data?.sequence],
  );
  const summary = data?.summary;
  const totalLoadHours = bottleneckRows.reduce((sum, row) => sum + row.totalLoadHours, 0);
  const totalCapacityHours = bottleneckRows.reduce((sum, row) => sum + row.capacityHours, 0);
  const avgUtilization = totalCapacityHours > 0 ? (totalLoadHours / totalCapacityHours) * 100 : 0;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Kapasite Planlama"
        subtitle="İş merkezi takvimi, vardiya kapasitesi, darboğazlar ve iş emri operasyon sırasını yönetin."
        className="mb-0"
        action={
          <div className="flex items-center gap-2">
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
            <Button variant="secondary" size="sm" onClick={() => void refetch()} loading={isFetching} leftIcon={<RefreshCw className="h-3.5 w-3.5" />}>
              Yenile
            </Button>
          </div>
        }
      />

      {isLoading || !data ? (
        <LoadingState />
      ) : (
        <>
          <div className="rounded-xl border border-slate-800/80 bg-slate-950/35 px-4 py-3">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
              <SummaryMetric label="İş Merkezi" value={summary?.workCenterCount ?? 0} />
              <SummaryMetric label="Ortalama Kullanım" value={formatPct(avgUtilization)} tone={avgUtilization >= 85 ? "text-amber-300" : "text-slate-200"} />
              <SummaryMetric label="Darboğaz" value={summary?.bottleneckCount ?? 0} tone={(summary?.bottleneckCount ?? 0) > 0 ? "text-amber-300" : "text-slate-200"} />
              <SummaryMetric label="Kritik" value={summary?.criticalBottleneckCount ?? 0} tone={(summary?.criticalBottleneckCount ?? 0) > 0 ? "text-red-300" : "text-slate-200"} />
              <SummaryMetric label="Sıradaki Operasyon" value={summary?.queuedOperationCount ?? 0} />
              <SummaryMetric label="Bloke Saat" value={formatHours(summary?.blockedHours ?? 0)} tone={(summary?.blockedHours ?? 0) > 0 ? "text-red-300" : "text-slate-200"} />
            </div>
          </div>

          {((summary?.criticalBottleneckCount ?? 0) > 0 || (summary?.downtimeBlockCount ?? 0) > 0 || (summary?.maintenanceBlockCount ?? 0) > 0) && (
            <div className="rounded-xl border border-amber-500/25 bg-amber-500/[0.06] px-4 py-3">
              <div className="flex items-center gap-2 text-sm text-amber-100">
                <AlertTriangle className="h-4 w-4 shrink-0 text-amber-300" />
                <span>
                  Kapasite planında
                  <strong className="mx-1 font-semibold">{summary?.criticalBottleneckCount ?? 0}</strong> kritik darboğaz,
                  <strong className="mx-1 font-semibold">{summary?.downtimeBlockCount ?? 0}</strong> duruş blokajı ve
                  <strong className="mx-1 font-semibold">{summary?.maintenanceBlockCount ?? 0}</strong> bakım blokajı var.
                </span>
              </div>
            </div>
          )}

          <section className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
            <Panel title="Darboğaz Görünümü" subtitle="İş merkezi yükü, kuyruk ve bloke kapasite durumu." icon={<Gauge className="h-4 w-4 text-sky-300" />}>
              <BottleneckTable rows={bottleneckRows} />
            </Panel>
            <Panel title="İş Emri Sıralama" subtitle="Planlı ve devam eden operasyon kuyruğu." icon={<ListOrdered className="h-4 w-4 text-violet-300" />}>
              <SequenceTable rows={sequenceRows.slice(0, 12)} />
            </Panel>
          </section>

          <Panel title="İş Merkezi Takvimi ve Vardiya" subtitle="Kullanımı yüksek, ayrılmış veya blokajlı takvim satırları." icon={<CalendarDays className="h-4 w-4 text-sky-300" />}>
            <CalendarTable rows={calendarRows} />
          </Panel>

          <div className="rounded-xl border border-slate-800/80 bg-slate-950/35 px-4 py-3 text-xs text-slate-500">
            <Wrench className="mr-2 inline h-3.5 w-3.5 text-slate-500" />
            Planlama penceresi {summary?.horizonDays ?? horizonDays} gün, {summary?.calendarDays ?? horizonDays} takvim günü ve {summary?.shiftCount ?? 0} vardiya üzerinden hesaplandı.
          </div>
        </>
      )}
    </div>
  );
}

function SummaryMetric({ label, value, tone = "text-slate-200" }: { label: string; value: string | number; tone?: string }) {
  return (
    <span className={cn("border-r border-slate-800 pr-4 last:border-r-0 last:pr-0 font-semibold tabular-nums", tone)}>
      {value} <span className="text-[11px] font-medium uppercase text-slate-500">{label}</span>
    </span>
  );
}

function Panel({ title, subtitle, icon, children }: { title: string; subtitle: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-slate-800/80 bg-slate-950/40">
      <div className="border-b border-slate-800/70 bg-slate-900/45 px-4 py-3">
        <div className="flex items-center gap-2">
          {icon}
          <h2 className="text-sm font-semibold text-white">{title}</h2>
        </div>
        <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p>
      </div>
      <div className="p-4">{children}</div>
    </section>
  );
}

function BottleneckTable({ rows }: { rows: CapacityBottleneckRow[] }) {
  if (rows.length === 0) return <EmptyText title="İş merkezi bulunamadı" text="Kapasite planlama için aktif iş merkezi ekleyin." />;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[760px] text-sm">
        <thead>
          <tr className="border-b border-slate-800/80">
            {["İş Merkezi", "Yük", "Kapasite", "Kuyruk", "Bloke", "Kullanım", "Durum"].map((header, index) => (
              <th key={header} className={cn("px-3 py-2 text-left text-[11px] font-semibold uppercase text-slate-500", index > 0 && index < 6 && "text-right")}>{header}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.workCenter.id} className="border-b border-slate-800/45 last:border-b-0">
              <td className="px-3 py-3">
                <p className="font-medium text-slate-100">{row.workCenter.name}</p>
                <p className="mt-0.5 font-mono text-xs text-slate-500">{row.workCenter.code}</p>
              </td>
              <td className="px-3 py-3 text-right tabular-nums text-slate-300">{formatHours(row.totalLoadHours)}</td>
              <td className="px-3 py-3 text-right tabular-nums text-slate-400">{formatHours(row.capacityHours)}</td>
              <td className="px-3 py-3 text-right tabular-nums text-slate-400">{formatHours(row.queuedHours)}</td>
              <td className={cn("px-3 py-3 text-right tabular-nums", row.blockedHours > 0 ? "font-medium text-red-300" : "text-slate-500")}>{formatHours(row.blockedHours)}</td>
              <td className="px-3 py-3 text-right font-semibold tabular-nums text-slate-100">{formatPct(row.utilizationPct)}</td>
              <td className="px-3 py-3"><Badge variant={severityVariant(row.severity)}>{severityLabel(row.severity)}</Badge></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SequenceTable({ rows }: { rows: CapacitySequenceRow[] }) {
  if (rows.length === 0) return <EmptyText title="Sırada operasyon yok" text="Planlı veya devam eden iş emri operasyonu bulunmuyor." />;
  return (
    <div className="space-y-2">
      {rows.map((row) => (
        <Link key={row.id} href={workOrderHref(row.workOrderId)} className="grid grid-cols-[44px_1fr_auto] gap-3 rounded-lg border border-slate-800 bg-slate-950/35 p-3 transition-colors hover:bg-sky-500/[0.04]">
          <span className="font-mono text-sm font-semibold text-sky-300">#{row.queueRank}</span>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-slate-100">{row.operationName}</p>
            <p className="mt-0.5 text-xs text-slate-500">{row.workOrderNumber} · {row.product.name}</p>
            <p className="mt-0.5 text-xs text-slate-600">{row.workCenter.name} · {formatDateTime(row.plannedStartAt)}</p>
          </div>
          <div className="text-right">
            <Badge variant={row.status === "IN_PROGRESS" ? "warning" : row.status === "PAUSED" ? "danger" : "info"}>{statusLabel(row.status)}</Badge>
            <p className="mt-1 text-xs tabular-nums text-slate-500">{formatHours(row.estimatedHours)}</p>
          </div>
        </Link>
      ))}
    </div>
  );
}

function CalendarTable({ rows }: { rows: CapacityCalendarRow[] }) {
  if (rows.length === 0) return <EmptyText title="Yoğun takvim satırı yok" text="Seçili pencerede kapasite kullanımı düşük görünüyor." />;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[920px] text-sm">
        <thead>
          <tr className="border-b border-slate-800/80">
            {["Tarih", "İş Merkezi", "Vardiya", "Kapasite", "Ayrılmış", "Boş", "Blokaj", "Kullanım"].map((header, index) => (
              <th key={header} className={cn("px-3 py-2 text-left text-[11px] font-semibold uppercase text-slate-500", [3, 4, 5, 7].includes(index) && "text-right")}>{header}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={`${row.workCenter.id}-${row.date}`} className="border-b border-slate-800/45 last:border-b-0">
              <td className="whitespace-nowrap px-3 py-3 text-slate-300">{formatDate(row.date)}</td>
              <td className="px-3 py-3">
                <p className="font-medium text-slate-100">{row.workCenter.name}</p>
                <p className="mt-0.5 font-mono text-xs text-slate-500">{row.workCenter.code}</p>
              </td>
              <td className="px-3 py-3 text-slate-300">{row.shifts.shiftCount} x {formatHours(row.shifts.hoursPerShift)}</td>
              <td className="px-3 py-3 text-right tabular-nums text-slate-400">{formatHours(row.capacityHours)}</td>
              <td className="px-3 py-3 text-right tabular-nums text-slate-300">{formatHours(row.allocatedHours)}</td>
              <td className="px-3 py-3 text-right tabular-nums text-slate-400">{formatHours(row.availableHours)}</td>
              <td className="px-3 py-3">
                {row.blockages.reasons.length > 0 ? (
                  <div className="flex items-start gap-2 text-amber-300">
                    <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    <div>
                      <p className="text-xs font-medium">{row.blockages.reasons.join(" / ")}</p>
                      <p className="mt-0.5 text-[11px] text-slate-500">{formatHours(row.blockages.downtimeHours)} duruş · {row.blockages.maintenanceTaskCount} bakım</p>
                    </div>
                  </div>
                ) : <span className="text-xs text-slate-500">Yok</span>}
              </td>
              <td className={cn("px-3 py-3 text-right font-semibold tabular-nums", row.utilizationPct >= 100 ? "text-red-300" : row.utilizationPct >= 85 ? "text-amber-300" : "text-slate-300")}>{formatPct(row.utilizationPct)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function LoadingState() {
  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-slate-800/80 bg-slate-950/35 px-4 py-3">
        <div className="h-5 w-3/4 animate-pulse rounded bg-slate-800/80" />
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        {[1, 2].map((item) => (
          <div key={item} className="rounded-xl border border-slate-800/80 bg-slate-950/40 p-4">
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

function EmptyText({ title, text }: { title: string; text: string }) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-950/35 p-4">
      <p className="text-sm font-semibold text-slate-200">{title}</p>
      <p className="mt-1 text-sm text-slate-500">{text}</p>
    </div>
  );
}
