"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useState } from "react";
import { Activity, AlertTriangle, CalendarDays, Gauge, RefreshCw, ShieldCheck, Wrench } from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";
import { Badge, type BadgeVariant } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { useAdvancedProduction } from "@/hooks/useProduction";
import type {
  AdvancedMaintenanceRow,
  AdvancedQualitySignalRow,
  AdvancedScrapRow,
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

function severityVariant(value: AdvancedQualitySignalRow["severity"] | AdvancedMaintenanceRow["priority"]): BadgeVariant {
  if (value === "critical") return "danger";
  if (value === "high") return "warning";
  if (value === "low") return "neutral";
  return "info";
}

function signalLabel(value: AdvancedQualitySignalRow["signal"]): string {
  if (value === "scrap") return "Fire";
  if (value === "under_production") return "Eksik uretim";
  if (value === "material_shortage") return "Malzeme eksigi";
  return "Duraklama";
}

function workOrderHref(id: string): string {
  return `/dashboard/production/work-orders/${id}`;
}

export function AdvancedProductionPage() {
  const [horizonDays, setHorizonDays] = useState(30);
  const { data, isLoading, isFetching, refetch } = useAdvancedProduction({ horizonDays });

  return (
    <div>
      <PageHeader
        title="Uretim ileri seviye"
        subtitle="Kapasite, kalite, bakim, fire, vardiya ve operasyon maliyetlerini tek ekranda izle."
        action={
          <>
            <Select
              value={String(horizonDays)}
              onChange={(event) => setHorizonDays(Number(event.target.value))}
              options={[
                { value: "14", label: "14 gun" },
                { value: "30", label: "30 gun" },
                { value: "60", label: "60 gun" },
                { value: "90", label: "90 gun" },
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

      {isLoading || !data ? (
        <div className="grid gap-3 md:grid-cols-4">
          {[1, 2, 3, 4].map((item) => <div key={item} className="h-28 animate-pulse rounded-lg bg-slate-800/60" />)}
        </div>
      ) : (
        <div className="space-y-5">
          <section className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
            <MetricCard icon={<Activity className="h-4 w-4" />} label="Acik is emri" value={data.summary.openWorkOrderCount} />
            <MetricCard icon={<Gauge className="h-4 w-4" />} label="Kapasite riski" value={data.summary.capacityRiskCount} tone="warning" />
            <MetricCard icon={<ShieldCheck className="h-4 w-4" />} label="Kalite riski" value={data.summary.qualityRiskCount} tone="danger" />
            <MetricCard icon={<Wrench className="h-4 w-4" />} label="Bakim aksiyonu" value={data.summary.maintenanceActionCount} />
            <MetricCard icon={<AlertTriangle className="h-4 w-4" />} label="Fire orani" value={formatPct(data.summary.scrapRatePct)} tone="warning" />
            <MetricCard icon={<CalendarDays className="h-4 w-4" />} label="Maliyet sapmasi" value={formatPct(data.summary.operationCostVariancePct)} />
          </section>

          <section className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
            <Panel title="Kapasite ve vardiya planlama">
              <div className="space-y-2">
                {data.capacityPlan.slice(0, 8).map((row) => (
                  <div key={row.workCenter.id} className="rounded-lg border border-slate-800 bg-slate-950/40 p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-slate-100">{row.workCenter.name}</p>
                        <p className="mt-1 text-xs text-slate-500">{row.workCenter.code} / {row.shiftCount} vardiya</p>
                      </div>
                      <Badge variant={row.utilizationPct >= 100 ? "danger" : row.utilizationPct >= 85 ? "warning" : "success"}>
                        {formatPct(row.utilizationPct)}
                      </Badge>
                    </div>
                    <div className="mt-3 grid gap-2 text-xs text-slate-400 sm:grid-cols-3">
                      <span>Kapasite: {formatHours(row.capacityHours)}</span>
                      <span>Ayrilan: {formatHours(row.allocatedHours)}</span>
                      <span>Kuyruk: {formatHours(row.queuedHours)}</span>
                    </div>
                    <p className="mt-2 text-xs text-slate-500">{row.recommendation}</p>
                  </div>
                ))}
              </div>
            </Panel>

            <Panel title="Bakim ve durus onleme">
              <div className="space-y-2">
                {data.maintenancePlan.length === 0 ? (
                  <EmptyText text="Bakim aksiyonu gerektiren is merkezi yok." />
                ) : data.maintenancePlan.map((row) => (
                  <div key={row.workCenter.id} className="rounded-lg border border-slate-800 bg-slate-950/40 p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-slate-100">{row.workCenter.name}</p>
                        <p className="mt-1 text-xs text-slate-500">{row.openTaskCount} acik gorev / {formatPct(row.utilizationPct)} kullanim</p>
                      </div>
                      <Badge variant={severityVariant(row.priority)}>{row.priority}</Badge>
                    </div>
                    <p className="mt-2 text-xs text-slate-500">{row.recommendation}</p>
                  </div>
                ))}
              </div>
            </Panel>
          </section>

          <section className="grid gap-4 xl:grid-cols-2">
            <Panel title="Kalite kontrol sinyalleri">
              <div className="space-y-2">
                {data.qualitySignals.length === 0 ? (
                  <EmptyText text="Kalite riski bulunmuyor." />
                ) : data.qualitySignals.slice(0, 8).map((row) => (
                  <LinkedRow key={`${row.signal}:${row.workOrderId}:${row.detail}`} row={row} />
                ))}
              </div>
            </Panel>

            <Panel title="Fire analizi">
              <div className="space-y-2">
                {data.scrapAnalysis.length === 0 ? (
                  <EmptyText text="Fire kaydi bulunmuyor." />
                ) : data.scrapAnalysis.slice(0, 8).map((row) => (
                  <ScrapRow key={row.workOrderId} row={row} />
                ))}
              </div>
            </Panel>
          </section>

          <section className="grid gap-4 xl:grid-cols-[0.8fr_1.2fr]">
            <Panel title="Vardiya ozeti">
              <div className="space-y-2">
                {data.shiftPlan.slice(0, 8).map((row) => (
                  <div key={`${row.workCenter.id}:${row.date}`} className="grid grid-cols-[1fr_auto] gap-3 rounded-lg border border-slate-800 bg-slate-950/40 p-3 text-sm">
                    <div>
                      <p className="font-semibold text-slate-100">{row.workCenter.name}</p>
                      <p className="mt-1 text-xs text-slate-500">{row.date} / {row.shiftCount} x {formatHours(row.hoursPerShift)}</p>
                    </div>
                    <Badge variant={row.utilizationPct >= 85 ? "warning" : "success"}>{formatPct(row.utilizationPct)}</Badge>
                  </div>
                ))}
                {data.shiftPlan.length === 0 && <EmptyText text="Vardiya kapasitesi tanimli degil." />}
              </div>
            </Panel>

            <Panel title="Operasyon bazli maliyet">
              <div className="overflow-auto rounded-lg border border-slate-800">
                <table className="min-w-full divide-y divide-slate-800 text-sm">
                  <thead className="bg-slate-950/60">
                    <tr>
                      <th className="px-3 py-2 text-left text-xs font-medium text-slate-500">Operasyon</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-slate-500">Is merkezi</th>
                      <th className="px-3 py-2 text-right text-xs font-medium text-slate-500">Saat</th>
                      <th className="px-3 py-2 text-right text-xs font-medium text-slate-500">Maliyet</th>
                      <th className="px-3 py-2 text-right text-xs font-medium text-slate-500">Sapma</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {data.operationCosts.slice(0, 10).map((row) => (
                      <tr key={row.operationId}>
                        <td className="px-3 py-2">
                          <Link href={workOrderHref(row.workOrderId)} className="font-medium text-sky-300 hover:text-sky-200">
                            {row.operationName}
                          </Link>
                          <p className="mt-1 text-xs text-slate-500">{row.workOrderNumber}</p>
                        </td>
                        <td className="px-3 py-2 text-slate-400">{row.workCenter.name}</td>
                        <td className="px-3 py-2 text-right text-slate-400">{formatHours(row.actualHours || row.plannedHours)}</td>
                        <td className="px-3 py-2 text-right text-slate-300">{formatCurrency(row.totalCost)}</td>
                        <td className="px-3 py-2 text-right">
                          <Badge variant={row.variancePct > 10 ? "warning" : row.variancePct < -10 ? "info" : "neutral"}>{formatPct(row.variancePct)}</Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {data.operationCosts.length === 0 && <EmptyText text="Operasyon maliyeti hesaplanamadi." />}
              </div>
            </Panel>
          </section>
        </div>
      )}
    </div>
  );
}

function MetricCard({ icon, label, value, tone = "info" }: { icon: ReactNode; label: string; value: string | number; tone?: BadgeVariant }) {
  const color = tone === "danger" ? "text-rose-300" : tone === "warning" ? "text-amber-300" : "text-sky-300";
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
      <div className={color}>{icon}</div>
      <span className="mt-3 block text-[10px] font-bold uppercase tracking-wider text-slate-500">{label}</span>
      <span className="mt-1 block text-2xl font-bold text-white">{value}</span>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
      <h2 className="mb-4 text-sm font-semibold text-slate-100">{title}</h2>
      {children}
    </section>
  );
}

function EmptyText({ text }: { text: string }) {
  return <p className="rounded-lg border border-slate-800 bg-slate-950/40 p-4 text-sm text-slate-500">{text}</p>;
}

function LinkedRow({ row }: { row: AdvancedQualitySignalRow }) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-950/40 p-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <Link href={workOrderHref(row.workOrderId)} className="text-sm font-semibold text-sky-300 hover:text-sky-200">
            {row.workOrderNumber}
          </Link>
          <p className="mt-1 text-xs text-slate-500">{row.product.name} / {row.detail}</p>
        </div>
        <Badge variant={severityVariant(row.severity)}>{signalLabel(row.signal)}</Badge>
      </div>
    </div>
  );
}

function ScrapRow({ row }: { row: AdvancedScrapRow }) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-950/40 p-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <Link href={workOrderHref(row.workOrderId)} className="text-sm font-semibold text-sky-300 hover:text-sky-200">
            {row.workOrderNumber}
          </Link>
          <p className="mt-1 text-xs text-slate-500">{row.product.name} / {row.reason ?? "Neden yok"}</p>
        </div>
        <Badge variant={row.scrapRatePct >= 10 ? "danger" : "warning"}>{formatPct(row.scrapRatePct)}</Badge>
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2 text-xs text-slate-400">
        <span>Plan: {formatNumber(row.plannedQty, 3)}</span>
        <span>Fire: {formatNumber(row.scrapQty, 3)}</span>
        <span>{formatCurrency(row.scrapCost)}</span>
      </div>
    </div>
  );
}
