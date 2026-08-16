"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import { AlertTriangle, Gauge, PackageCheck, RefreshCw, Route, ShieldCheck, UserCheck } from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";
import { Badge, type BadgeVariant } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { useAdvancedService } from "@/hooks/useService";
import { cn } from "@/lib/utils";
import type {
  AdvancedAutoAssignmentRow,
  AdvancedServicePriority,
  AdvancedSparePartReservationRow,
  AdvancedSparePartReservationStatus,
  AdvancedTechnicianRouteRow,
  AdvancedTechnicianRouteStop,
} from "@/services/service.service";

function formatNumber(value: number, digits = 0): string {
  return new Intl.NumberFormat("tr-TR", { maximumFractionDigits: digits }).format(value);
}

function formatMinutes(value: number): string {
  const absValue = Math.abs(Math.round(value));
  const days = Math.floor(absValue / 1440);
  const hours = Math.floor((absValue % 1440) / 60);
  const minutes = absValue % 60;
  const suffix = value < 0 ? " gecikti" : "";

  if (days > 0) {
    const hourPart = hours > 0 ? ` ${hours} saat` : "";
    return `${days} gün${hourPart}${suffix}`;
  }

  if (hours > 0) {
    const minutePart = minutes > 0 ? ` ${minutes} dk` : "";
    return `${hours} saat${minutePart}${suffix}`;
  }

  return `${minutes} dk${suffix}`;
}

function formatDateTime(value: string | null): string {
  if (!value) return "-";
  return new Intl.DateTimeFormat("tr-TR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value));
}

function normalizeTurkishLabel(value: string | null | undefined): string {
  if (!value) return "Atanmamış";
  const normalized = value.trim();
  if (normalized.toLocaleLowerCase("tr-TR") === "atanmamis") return "Atanmamış";
  return normalized;
}

function priorityVariant(priority: AdvancedServicePriority): BadgeVariant {
  if (priority === "CRITICAL") return "danger";
  if (priority === "HIGH") return "warning";
  if (priority === "LOW") return "neutral";
  return "info";
}

function priorityLabel(priority: AdvancedServicePriority): string {
  if (priority === "CRITICAL") return "Kritik";
  if (priority === "HIGH") return "Yüksek";
  if (priority === "LOW") return "Düşük";
  return "Orta";
}

function reservationVariant(status: AdvancedSparePartReservationStatus): BadgeVariant {
  if (status === "shortage" || status === "unlinked") return "danger";
  if (status === "reserve_recommended") return "warning";
  return "success";
}

function reservationLabel(status: AdvancedSparePartReservationStatus): string {
  if (status === "shortage") return "Eksik stok";
  if (status === "unlinked") return "Ürün bağlı değil";
  if (status === "reserve_recommended") return "Rezervasyon öner";
  return "Hazır";
}

function assignmentTone(row: AdvancedAutoAssignmentRow): BadgeVariant {
  if (row.slaRemainingMinutes < 0) return "danger";
  if (row.slaRemainingMinutes <= 120) return "warning";
  return row.score >= 70 ? "success" : "info";
}

function routeTone(score: number): BadgeVariant {
  if (score >= 75) return "success";
  if (score >= 45) return "warning";
  return "danger";
}

function partTitle(row: AdvancedSparePartReservationRow): string {
  return row.productName ?? row.description;
}

function requestHref(id: string): string {
  return `/dashboard/service/requests/${id}`;
}

export function AdvancedServicePage() {
  const [horizonDays, setHorizonDays] = useState(30);
  const { data, isLoading, isFetching, refetch } = useAdvancedService({ horizonDays });

  const riskyParts = useMemo(
    () => [...(data?.sparePartReservations ?? [])].sort((a, b) => b.shortageQty - a.shortageQty).slice(0, 10),
    [data?.sparePartReservations],
  );
  const urgentAssignments = useMemo(
    () => [...(data?.autoAssignments ?? [])].sort((a, b) => a.slaRemainingMinutes - b.slaRemainingMinutes).slice(0, 8),
    [data?.autoAssignments],
  );

  return (
    <div className="space-y-5">
      <PageHeader
        title="Servis ileri seviye"
        subtitle="SLA, teknisyen rotaları, otomatik atama, yedek parça ve portal takibini tek operasyonda izleyin."
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
              { label: "Aktif Talep", value: data.summary.activeRequestCount, tone: "text-slate-50" },
              { label: "SLA İhlali", value: data.summary.slaBreachedCount, tone: data.summary.slaBreachedCount > 0 ? "text-red-300" : "text-slate-200" },
              { label: "SLA Uyarı", value: data.summary.slaWarningCount, tone: data.summary.slaWarningCount > 0 ? "text-amber-300" : "text-slate-200" },
              { label: "Atama Önerisi", value: data.summary.autoAssignmentSuggestionCount, tone: "text-sky-200" },
              { label: "Rota Hazır", value: data.summary.routeReadyCount, tone: "text-emerald-300" },
              { label: "Parça Riski", value: data.summary.sparePartRiskCount, tone: data.summary.sparePartRiskCount > 0 ? "text-amber-300" : "text-slate-200" },
              { label: "Müşteri Bekliyor", value: data.summary.customerWaitingCount, tone: data.summary.customerWaitingCount > 0 ? "text-amber-300" : "text-slate-200" },
            ]}
          />

          {(data.summary.slaBreachedCount > 0 || data.summary.sparePartRiskCount > 0 || data.summary.customerWaitingCount > 0) && (
            <AttentionBar breaches={data.summary.slaBreachedCount} partRisks={data.summary.sparePartRiskCount} waiting={data.summary.customerWaitingCount} />
          )}

          <section className="grid gap-4 xl:grid-cols-[0.85fr_1.15fr]">
            <Panel title="SLA sözleşmeleri" subtitle={`${data.summary.horizonDays} günlük servis penceresinde öncelik bazlı SLA durumu.`} icon={<ShieldCheck className="h-4 w-4 text-sky-300" />}>
              <div className="space-y-2">
                {data.slaContracts.length === 0 ? (
                  <EmptyText text="SLA sözleşmesi bulunmuyor." />
                ) : data.slaContracts.map((row) => (
                  <div key={row.key} className="rounded-lg border border-slate-800 bg-slate-950/35 p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-slate-100">{priorityLabel(row.key)}</p>
                        <p className="mt-0.5 text-xs text-slate-500">{row.limitHours} saat limit · {row.activeRequestCount} aktif talep</p>
                      </div>
                      <Badge variant={row.breachedCount > 0 ? "danger" : priorityVariant(row.key)}>{row.breachedCount} ihlal</Badge>
                    </div>
                    <div className="mt-3 flex items-center justify-between gap-3 text-xs">
                      <span className="text-slate-500">Ortalama kalan süre</span>
                      <span className="font-medium tabular-nums text-slate-200">{formatMinutes(row.avgRemainingMinutes)}</span>
                    </div>
                  </div>
                ))}
              </div>
            </Panel>

            <Panel title="Teknisyen rota optimizasyonu" subtitle="Durak yoğunluğu, şehir dağılımı ve kritik iş yükü birlikte değerlendirilir." icon={<Route className="h-4 w-4 text-emerald-300" />}>
              <div className="grid gap-3 lg:grid-cols-2">
                {data.technicianRoutes.length === 0 ? (
                  <EmptyText text="Rota oluşturulacak aktif servis yok." />
                ) : data.technicianRoutes.map((row) => <TechnicianRouteCard key={row.assignedToId ?? "unassigned"} row={row} />)}
              </div>
            </Panel>
          </section>

          <section className="grid gap-4 xl:grid-cols-[1.05fr_0.95fr]">
            <Panel title="Otomatik atama önerileri" subtitle="SLA süresi en kritik talepler üstte gösterilir." icon={<UserCheck className="h-4 w-4 text-sky-300" />}>
              <div className="space-y-2">
                {urgentAssignments.length === 0 ? (
                  <EmptyText text="Atama bekleyen servis talebi yok." />
                ) : urgentAssignments.map((row) => <AssignmentRow key={row.serviceRequestId} row={row} />)}
              </div>
            </Panel>

            <Panel title="Müşteri portalı servis takibi" subtitle="Portal erişimi, açık talep ve müşteri bekleme durumları." icon={<Gauge className="h-4 w-4 text-violet-300" />}>
              <div className="space-y-2">
                {data.portalTracking.length === 0 ? (
                  <EmptyText text="Portal üzerinden takip edilen servis bulunmuyor." />
                ) : data.portalTracking.slice(0, 8).map((row) => (
                  <div key={row.contactId} className="rounded-lg border border-slate-800 bg-slate-950/35 p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-slate-100">{row.contactName}</p>
                        <p className="mt-0.5 text-xs text-slate-500">{row.openRequestCount} açık talep · {row.waitingCustomerCount} müşteri bekliyor</p>
                      </div>
                      <Badge variant={row.portalEnabled ? "success" : "neutral"}>{row.portalEnabled ? "Portal aktif" : "Portal pasif"}</Badge>
                    </div>
                    <div className="mt-3 flex items-center justify-between gap-3 text-xs text-slate-500">
                      <span>Son aktivite: {formatDateTime(row.lastCustomerActivityAt)}</span>
                      {row.latestRequestHref && <Link href={row.latestRequestHref} className="font-medium text-sky-300 hover:text-sky-200">Son talep</Link>}
                    </div>
                  </div>
                ))}
              </div>
            </Panel>
          </section>

          <Panel title="Yedek parça rezervasyonu" subtitle="Eksik stok ve rezervasyon önerileri servis talebiyle birlikte listelenir." icon={<PackageCheck className="h-4 w-4 text-amber-300" />}>
            <SparePartTable rows={riskyParts} />
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
      <div className="grid gap-4 xl:grid-cols-[0.85fr_1.15fr]">
        {[1, 2].map((item) => (
          <div key={item} className="rounded-xl border border-slate-800/80 bg-slate-950/35 p-4">
            <div className="h-5 w-44 animate-pulse rounded bg-slate-800/80" />
            <div className="mt-4 space-y-3">
              {Array.from({ length: 4 }).map((_, index) => <div key={index} className="h-12 animate-pulse rounded bg-slate-800/60" />)}
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

function AttentionBar({ breaches, partRisks, waiting }: { breaches: number; partRisks: number; waiting: number }) {
  return (
    <div className="rounded-xl border border-amber-500/25 bg-amber-500/[0.06] px-4 py-3">
      <div className="flex items-center gap-2 text-sm text-amber-100">
        <AlertTriangle className="h-4 w-4 shrink-0 text-amber-300" />
        <span>
          Servis operasyonunda dikkat isteyen alanlar var:
          {breaches > 0 && <strong className="ml-1 font-semibold">{breaches} SLA ihlali</strong>}
          {partRisks > 0 && <strong className="ml-1 font-semibold">{partRisks} parça riski</strong>}
          {waiting > 0 && <strong className="ml-1 font-semibold">{waiting} müşteri bekleyen talep</strong>}.
        </span>
      </div>
    </div>
  );
}

function TechnicianRouteCard({ row }: { row: AdvancedTechnicianRouteRow }) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-950/35 p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-slate-100">{normalizeTurkishLabel(row.technicianLabel)}</p>
          <p className="mt-0.5 text-xs text-slate-500">{row.stopCount} durak · {row.cityCount} şehir · {row.highPriorityCount} kritik/yüksek</p>
        </div>
        <Badge variant={routeTone(row.routeScore)}>{row.routeScore} skor</Badge>
      </div>
      <div className="mt-3 space-y-2">
        {row.nextStops.slice(0, 4).map((stop) => <RouteStopRow key={stop.serviceRequestId} stop={stop} />)}
      </div>
    </div>
  );
}

function RouteStopRow({ stop }: { stop: AdvancedTechnicianRouteStop }) {
  return (
    <Link href={requestHref(stop.serviceRequestId)} className="grid grid-cols-[auto_1fr_auto] items-center gap-2 rounded-md border border-slate-800 bg-slate-900/60 px-2 py-2 text-xs transition-colors hover:border-sky-500/50">
      <span className="font-mono text-sky-300">#{stop.sequence}</span>
      <span className="min-w-0">
        <span className="block truncate font-medium text-slate-200">{stop.subject}</span>
        <span className="block truncate text-slate-500">{stop.city ?? "Şehir yok"} · {stop.serviceRequestNumber}</span>
      </span>
      <Badge variant={priorityVariant(stop.priority)}>{priorityLabel(stop.priority)}</Badge>
    </Link>
  );
}

function AssignmentRow({ row }: { row: AdvancedAutoAssignmentRow }) {
  return (
    <Link href={requestHref(row.serviceRequestId)} className="grid gap-3 rounded-lg border border-slate-800 bg-slate-950/35 p-3 transition-colors hover:border-sky-500/50 md:grid-cols-[1fr_auto_auto]">
      <div className="min-w-0">
        <span className="font-mono text-[11px] text-sky-300">{row.serviceRequestNumber}</span>
        <p className="mt-1 truncate text-sm font-semibold text-slate-100">{row.subject}</p>
        <p className="mt-0.5 text-xs text-slate-500">{row.reason}</p>
      </div>
      <div className="text-xs text-slate-400">
        <span className="block text-slate-500">Önerilen</span>
        <span className="font-medium text-slate-200">{normalizeTurkishLabel(row.suggestedAssigneeLabel)}</span>
      </div>
      <div className="flex items-center justify-end gap-2">
        <Badge variant={priorityVariant(row.priority)}>{priorityLabel(row.priority)}</Badge>
        <Badge variant={assignmentTone(row)}>{formatMinutes(row.slaRemainingMinutes)}</Badge>
        <Badge variant="info">{row.score} skor</Badge>
      </div>
    </Link>
  );
}

function SparePartTable({ rows }: { rows: AdvancedSparePartReservationRow[] }) {
  if (rows.length === 0) return <EmptyText text="Rezervasyon riski bulunmuyor." />;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[760px] text-sm">
        <thead>
          <tr className="border-b border-slate-800/80">
            {["Servis", "Parça", "İhtiyaç", "Müsait", "Eksik", "Durum"].map((header, index) => (
              <th key={header} className={cn("px-3 py-2 text-left text-[11px] font-semibold uppercase text-slate-500", index >= 2 && "text-right")}>{header}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={`${row.serviceRequestId}:${row.productId ?? row.description}`} className="border-b border-slate-800/45 last:border-b-0">
              <td className="px-3 py-3">
                <Link href={requestHref(row.serviceRequestId)} className="font-mono text-xs font-semibold text-sky-300 hover:text-sky-200">
                  {row.serviceRequestNumber}
                </Link>
              </td>
              <td className="px-3 py-3">
                <p className="font-medium text-slate-100">{partTitle(row)}</p>
                <p className="mt-0.5 font-mono text-xs text-slate-500">{row.productCode ?? "Kod yok"}</p>
              </td>
              <td className="px-3 py-3 text-right tabular-nums text-slate-300">{formatNumber(row.requiredQty, 2)}</td>
              <td className="px-3 py-3 text-right tabular-nums text-slate-400">{row.availableQty === null ? "-" : formatNumber(row.availableQty, 2)}</td>
              <td className="px-3 py-3 text-right tabular-nums text-slate-400">{formatNumber(row.shortageQty, 2)}</td>
              <td className="px-3 py-3 text-right"><Badge variant={reservationVariant(row.status)}>{reservationLabel(row.status)}</Badge></td>
            </tr>
          ))}
        </tbody>
      </table>
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

function EmptyText({ text }: { text: string }) {
  return <p className="rounded-lg border border-slate-800 bg-slate-950/35 p-4 text-sm text-slate-500">{text}</p>;
}
