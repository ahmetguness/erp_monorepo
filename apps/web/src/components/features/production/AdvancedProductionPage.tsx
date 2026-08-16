"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import { Activity, AlertTriangle, CalendarDays, Gauge, RefreshCw, ShieldCheck } from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";
import { Badge, type BadgeVariant } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { useAdvancedProduction } from "@/hooks/useProduction";
import { cn } from "@/lib/utils";
import type {
  AdvancedCapacityPlanRow,
  AdvancedMaintenanceRow,
  AdvancedOperationCostRow,
  AdvancedQualitySignalRow,
  AdvancedScrapRow,
  AdvancedShiftRow,
} from "@/services/production.service";

function formatNumber(value: number, digits = 1): string {
  return new Intl.NumberFormat("tr-TR", { maximumFractionDigits: digits }).format(value);
}

function formatHours(value: number): string {
  return `${formatNumber(value)} saat`;
}

function formatPct(value: number): string {
  return `%${formatNumber(value)}`;
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY", maximumFractionDigits: 0 }).format(value);
}

function formatShortDate(value: string): string {
  return new Intl.DateTimeFormat("tr-TR", { day: "2-digit", month: "short" }).format(new Date(value));
}

function severityVariant(value: AdvancedQualitySignalRow["severity"] | AdvancedMaintenanceRow["priority"]): BadgeVariant {
  if (value === "critical") return "danger";
  if (value === "high") return "warning";
  if (value === "low") return "neutral";
  return "info";
}

function severityLabel(value: AdvancedQualitySignalRow["severity"] | AdvancedMaintenanceRow["priority"]): string {
  if (value === "critical") return "Kritik";
  if (value === "high") return "Yüksek";
  if (value === "medium") return "Orta";
  return "Düşük";
}

function signalLabel(value: AdvancedQualitySignalRow["signal"]): string {
  if (value === "scrap") return "Fire";
  if (value === "under_production") return "Eksik üretim";
  if (value === "material_shortage") return "Malzeme eksiği";
  return "Duraklama";
}

function workOrderHref(id: string): string {
  return `/dashboard/production/work-orders/${id}`;
}

function utilizationVariant(value: number): BadgeVariant {
  if (value >= 100) return "danger";
  if (value >= 85) return "warning";
  return "info";
}

export function AdvancedProductionPage() {
  const [horizonDays, setHorizonDays] = useState(30);
  const { data, isLoading, isFetching, refetch } = useAdvancedProduction({ horizonDays });

  const topCapacityRisks = useMemo(
    () => [...(data?.capacityPlan ?? [])].sort((a, b) => b.utilizationPct - a.utilizationPct).slice(0, 8),
    [data?.capacityPlan],
  );
  const topSignals = useMemo(() => [...(data?.qualitySignals ?? [])].slice(0, 6), [data?.qualitySignals]);
  const topMaintenance = useMemo(() => [...(data?.maintenancePlan ?? [])].slice(0, 5), [data?.maintenancePlan]);

  return (
    <div className="space-y-5">
      <PageHeader
        title="İleri Üretim"
        subtitle="Kapasite, kalite, bakım, fire, vardiya ve operasyon maliyetlerini tek ekranda izleyin."
        className="mb-0"
        action={
          <div className="flex items-center gap-2">
            <Select
              value={String(horizonDays)}
              onChange={(event) => setHorizonDays(Number(event.target.value))}
              options={[
                { value: "14", label: "14 gün" },
                { value: "30", label: "30 gün" },
                { value: "60", label: "60 gün" },
                { value: "90", label: "90 gün" },
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
          <SummaryStrip
            metrics={[
              { label: "Açık İş Emri", value: data.summary.openWorkOrderCount, tone: "text-slate-50" },
              { label: "Kapasite Riski", value: data.summary.capacityRiskCount, tone: data.summary.capacityRiskCount > 0 ? "text-amber-300" : "text-slate-200" },
              { label: "Kalite Riski", value: data.summary.qualityRiskCount, tone: data.summary.qualityRiskCount > 0 ? "text-red-300" : "text-slate-200" },
              { label: "Bakım Aksiyonu", value: data.summary.maintenanceActionCount, tone: data.summary.maintenanceActionCount > 0 ? "text-amber-300" : "text-slate-200" },
              { label: "Fire Oranı", value: formatPct(data.summary.scrapRatePct), tone: data.summary.scrapRatePct >= 10 ? "text-red-300" : data.summary.scrapRatePct > 0 ? "text-amber-300" : "text-slate-200" },
              { label: "Maliyet Sapması", value: formatPct(data.summary.operationCostVariancePct), tone: Math.abs(data.summary.operationCostVariancePct) > 10 ? "text-amber-300" : "text-slate-200" },
            ]}
          />

          {(data.summary.capacityRiskCount > 0 || data.summary.qualityRiskCount > 0 || data.summary.maintenanceActionCount > 0) && (
            <AttentionBar capacity={data.summary.capacityRiskCount} quality={data.summary.qualityRiskCount} maintenance={data.summary.maintenanceActionCount} />
          )}

          <section className="grid gap-4 xl:grid-cols-[1.25fr_0.75fr]">
            <Panel title="Kapasite ve Vardiya Planı" subtitle={`${data.summary.horizonDays} günlük üretim penceresinde iş merkezi yükü.`} icon={<Gauge className="h-4 w-4 text-sky-300" />}>
              <CapacityTable rows={topCapacityRisks} />
            </Panel>

            <Panel title="Operasyon Öncelikleri" subtitle="En yüksek etki yaratabilecek kalite ve bakım sinyalleri." icon={<AlertTriangle className="h-4 w-4 text-amber-300" />}>
              <div className="space-y-2">
                {topSignals.length === 0 && topMaintenance.length === 0 ? (
                  <EmptyText text="Aksiyon gerektiren üretim sinyali yok." />
                ) : (
                  <>
                    {topSignals.map((row) => <QualitySignalRow key={`${row.signal}:${row.workOrderId}:${row.detail}`} row={row} />)}
                    {topMaintenance.map((row) => <MaintenanceRow key={row.workCenter.id} row={row} />)}
                  </>
                )}
              </div>
            </Panel>
          </section>

          <section className="grid gap-4 xl:grid-cols-2">
            <Panel title="Fire Analizi" subtitle="İş emri bazında fire miktarı, oranı ve maliyet etkisi." icon={<ShieldCheck className="h-4 w-4 text-red-300" />}>
              <div className="space-y-2">
                {data.scrapAnalysis.length === 0 ? <EmptyText text="Fire kaydı bulunmuyor." /> : data.scrapAnalysis.slice(0, 8).map((row) => <ScrapRow key={row.workOrderId} row={row} />)}
              </div>
            </Panel>

            <Panel title="Vardiya Özeti" subtitle="Tarihe göre planlanan vardiya kapasitesi." icon={<CalendarDays className="h-4 w-4 text-sky-300" />}>
              <ShiftList rows={data.shiftPlan.slice(0, 8)} />
            </Panel>
          </section>

          <Panel title="Operasyon Bazlı Maliyet" subtitle="Planlanan ve gerçekleşen saatlere göre operasyon maliyeti." icon={<Activity className="h-4 w-4 text-sky-300" />}>
            <OperationCostTable rows={data.operationCosts.slice(0, 12)} />
          </Panel>
        </>
      )}
    </div>
  );
}

function LoadingState() {
  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-slate-800/80 bg-slate-950/35 px-4 py-3">
        <div className="h-5 w-3/4 animate-pulse rounded bg-slate-800/80" />
      </div>
      <div className="grid gap-4 xl:grid-cols-[1.25fr_0.75fr]">
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

function AttentionBar({ capacity, quality, maintenance }: { capacity: number; quality: number; maintenance: number }) {
  return (
    <div className="rounded-xl border border-amber-500/25 bg-amber-500/[0.06] px-4 py-3">
      <div className="flex items-center gap-2 text-sm text-amber-100">
        <AlertTriangle className="h-4 w-4 shrink-0 text-amber-300" />
        <span>
          Üretim planında dikkat isteyen alanlar var:
          {capacity > 0 && <strong className="ml-1 font-semibold">{capacity} kapasite riski</strong>}
          {quality > 0 && <strong className="ml-1 font-semibold">{quality} kalite sinyali</strong>}
          {maintenance > 0 && <strong className="ml-1 font-semibold">{maintenance} bakım aksiyonu</strong>}.
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

function CapacityTable({ rows }: { rows: AdvancedCapacityPlanRow[] }) {
  if (rows.length === 0) return <EmptyText text="Kapasite planı bulunmuyor." />;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[720px] text-sm">
        <thead>
          <tr className="border-b border-slate-800/80">
            {["İş Merkezi", "Kapasite", "Ayrılan", "Kuyruk", "Kullanım", "Öneri"].map((header, index) => (
              <th key={header} className={cn("px-3 py-2 text-left text-[11px] font-semibold uppercase text-slate-500", [1, 2, 3, 4].includes(index) && "text-right")}>{header}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.workCenter.id} className="border-b border-slate-800/45 last:border-b-0">
              <td className="px-3 py-3">
                <p className="font-medium text-slate-100">{row.workCenter.name}</p>
                <p className="mt-0.5 font-mono text-xs text-slate-500">{row.workCenter.code} · {row.shiftCount} vardiya</p>
              </td>
              <td className="px-3 py-3 text-right tabular-nums text-slate-300">{formatHours(row.capacityHours)}</td>
              <td className="px-3 py-3 text-right tabular-nums text-slate-300">{formatHours(row.allocatedHours)}</td>
              <td className="px-3 py-3 text-right tabular-nums text-slate-400">{formatHours(row.queuedHours)}</td>
              <td className="px-3 py-3 text-right"><Badge variant={utilizationVariant(row.utilizationPct)}>{formatPct(row.utilizationPct)}</Badge></td>
              <td className="max-w-[240px] px-3 py-3 text-xs text-slate-500">{row.recommendation}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function QualitySignalRow({ row }: { row: AdvancedQualitySignalRow }) {
  return (
    <Link href={workOrderHref(row.workOrderId)} className="block rounded-lg border border-slate-800 bg-slate-950/35 p-3 transition-colors hover:bg-sky-500/[0.04]">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-mono text-xs font-semibold text-sky-300">{row.workOrderNumber}</p>
          <p className="mt-1 truncate text-sm font-medium text-slate-100">{row.product.name}</p>
          <p className="mt-0.5 text-xs text-slate-500">{row.detail}</p>
        </div>
        <Badge variant={severityVariant(row.severity)}>{signalLabel(row.signal)}</Badge>
      </div>
    </Link>
  );
}

function MaintenanceRow({ row }: { row: AdvancedMaintenanceRow }) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-950/35 p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-slate-100">{row.workCenter.name}</p>
          <p className="mt-0.5 text-xs text-slate-500">{row.openTaskCount} açık görev · {formatPct(row.utilizationPct)} kullanım</p>
        </div>
        <Badge variant={severityVariant(row.priority)}>{severityLabel(row.priority)}</Badge>
      </div>
      <p className="mt-2 text-xs text-slate-500">{row.recommendation}</p>
    </div>
  );
}

function ScrapRow({ row }: { row: AdvancedScrapRow }) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-950/35 p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <Link href={workOrderHref(row.workOrderId)} className="font-mono text-xs font-semibold text-sky-300 hover:text-sky-200">
            {row.workOrderNumber}
          </Link>
          <p className="mt-1 truncate text-sm font-medium text-slate-100">{row.product.name}</p>
          <p className="mt-0.5 text-xs text-slate-500">{row.reason ?? "Fire nedeni yok"}</p>
        </div>
        <Badge variant={row.scrapRatePct >= 10 ? "danger" : "warning"}>{formatPct(row.scrapRatePct)}</Badge>
      </div>
      <div className="mt-3 grid grid-cols-4 gap-2 text-xs">
        <Metric label="Plan" value={formatNumber(row.plannedQty, 3)} />
        <Metric label="Üretim" value={formatNumber(row.producedQty, 3)} />
        <Metric label="Fire" value={formatNumber(row.scrapQty, 3)} />
        <Metric label="Maliyet" value={formatCurrency(row.scrapCost)} />
      </div>
    </div>
  );
}

function ShiftList({ rows }: { rows: AdvancedShiftRow[] }) {
  if (rows.length === 0) return <EmptyText text="Vardiya kapasitesi tanımlı değil." />;
  return (
    <div className="space-y-2">
      {rows.map((row) => (
        <div key={`${row.workCenter.id}:${row.date}`} className="grid grid-cols-[1fr_auto] gap-3 rounded-lg border border-slate-800 bg-slate-950/35 p-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-slate-100">{row.workCenter.name}</p>
            <p className="mt-0.5 text-xs text-slate-500">{formatShortDate(row.date)} · {row.shiftCount} x {formatHours(row.hoursPerShift)} · kapasite {formatHours(row.capacityHours)}</p>
          </div>
          <Badge variant={utilizationVariant(row.utilizationPct)}>{formatPct(row.utilizationPct)}</Badge>
        </div>
      ))}
    </div>
  );
}

function OperationCostTable({ rows }: { rows: AdvancedOperationCostRow[] }) {
  if (rows.length === 0) return <EmptyText text="Operasyon maliyeti hesaplanamadı." />;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[820px] text-sm">
        <thead>
          <tr className="border-b border-slate-800/80">
            {["Operasyon", "İş Merkezi", "Plan", "Gerçekleşen", "Maliyet", "Sapma"].map((header, index) => (
              <th key={header} className={cn("px-3 py-2 text-left text-[11px] font-semibold uppercase text-slate-500", index >= 2 && "text-right")}>{header}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.operationId} className="border-b border-slate-800/45 last:border-b-0">
              <td className="px-3 py-3">
                <Link href={workOrderHref(row.workOrderId)} className="font-medium text-sky-300 hover:text-sky-200">
                  {row.operationName}
                </Link>
                <p className="mt-0.5 font-mono text-xs text-slate-500">{row.workOrderNumber}</p>
              </td>
              <td className="px-3 py-3 text-slate-300">{row.workCenter.name}</td>
              <td className="px-3 py-3 text-right tabular-nums text-slate-400">{formatHours(row.plannedHours)}</td>
              <td className="px-3 py-3 text-right tabular-nums text-slate-400">{formatHours(row.actualHours)}</td>
              <td className="px-3 py-3 text-right font-medium tabular-nums text-slate-100">{formatCurrency(row.totalCost)}</td>
              <td className="px-3 py-3 text-right">
                <Badge variant={row.variancePct > 10 ? "warning" : row.variancePct < -10 ? "info" : "neutral"}>{formatPct(row.variancePct)}</Badge>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[11px] text-slate-500">{label}</p>
      <p className="mt-0.5 font-medium tabular-nums text-slate-300">{value}</p>
    </div>
  );
}

function EmptyText({ text }: { text: string }) {
  return <p className="rounded-lg border border-slate-800 bg-slate-950/35 p-4 text-sm text-slate-500">{text}</p>;
}
