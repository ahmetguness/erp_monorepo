"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useState } from "react";
import { AlertTriangle, Gauge, PackageCheck, RefreshCw, Route, ShieldCheck, UserCheck } from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";
import { Badge, type BadgeVariant } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { useAdvancedService } from "@/hooks/useService";
import type {
  AdvancedAutoAssignmentRow,
  AdvancedServicePriority,
  AdvancedSparePartReservationRow,
  AdvancedSparePartReservationStatus,
} from "@/services/service.service";

function formatNumber(value: number, digits = 0): string {
  return new Intl.NumberFormat("tr-TR", { maximumFractionDigits: digits }).format(value);
}

function formatMinutes(value: number): string {
  if (value < 0) return `${formatNumber(Math.abs(value))} dk gecikti`;
  if (value >= 60) return `${formatNumber(value / 60, 1)} saat`;
  return `${formatNumber(value)} dk`;
}

function formatDateTime(value: string | null): string {
  if (!value) return "-";
  return new Intl.DateTimeFormat("tr-TR", { dateStyle: "short", timeStyle: "short" }).format(new Date(value));
}

function priorityVariant(priority: AdvancedServicePriority): BadgeVariant {
  if (priority === "CRITICAL") return "danger";
  if (priority === "HIGH") return "warning";
  if (priority === "LOW") return "neutral";
  return "info";
}

function reservationVariant(status: AdvancedSparePartReservationStatus): BadgeVariant {
  if (status === "shortage" || status === "unlinked") return "danger";
  if (status === "reserve_recommended") return "warning";
  return "success";
}

function reservationLabel(status: AdvancedSparePartReservationStatus): string {
  if (status === "shortage") return "Eksik stok";
  if (status === "unlinked") return "Urun bagli degil";
  if (status === "reserve_recommended") return "Rezervasyon oner";
  return "Hazir";
}

function partTitle(row: AdvancedSparePartReservationRow): string {
  return row.productName ?? row.description;
}

function assignmentTone(row: AdvancedAutoAssignmentRow): BadgeVariant {
  if (row.slaRemainingMinutes < 0) return "danger";
  if (row.slaRemainingMinutes <= 120) return "warning";
  return row.score >= 70 ? "success" : "info";
}

export function AdvancedServicePage() {
  const [horizonDays, setHorizonDays] = useState(30);
  const { data, isLoading, isFetching, refetch } = useAdvancedService({ horizonDays });

  return (
    <div>
      <PageHeader
        title="Servis ileri seviye"
        subtitle="SLA sozlesmeleri, teknisyen rota optimizasyonu, yedek parca rezervasyonu ve portal takibi."
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
            <MetricCard icon={<ShieldCheck className="h-4 w-4" />} label="Aktif talep" value={data.summary.activeRequestCount} />
            <MetricCard icon={<AlertTriangle className="h-4 w-4" />} label="SLA ihlali" value={data.summary.slaBreachedCount} tone="danger" />
            <MetricCard icon={<Gauge className="h-4 w-4" />} label="SLA uyari" value={data.summary.slaWarningCount} tone="warning" />
            <MetricCard icon={<UserCheck className="h-4 w-4" />} label="Atama onerisi" value={data.summary.autoAssignmentSuggestionCount} />
            <MetricCard icon={<Route className="h-4 w-4" />} label="Rota hazir" value={data.summary.routeReadyCount} />
            <MetricCard icon={<PackageCheck className="h-4 w-4" />} label="Parca riski" value={data.summary.sparePartRiskCount} tone="warning" />
            <MetricCard icon={<UserCheck className="h-4 w-4" />} label="Portal cari" value={data.summary.portalTrackedContactCount} />
            <MetricCard icon={<Gauge className="h-4 w-4" />} label="Musteri bekliyor" value={data.summary.customerWaitingCount} />
          </section>

          <section className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
            <Panel title="SLA sozlesmeleri">
              <div className="space-y-2">
                {data.slaContracts.map((row) => (
                  <div key={row.key} className="rounded-lg border border-slate-800 bg-slate-950/40 p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-slate-100">{row.label}</p>
                        <p className="mt-1 text-xs text-slate-500">{row.limitHours} saat limit / {row.activeRequestCount} aktif talep</p>
                      </div>
                      <Badge variant={row.breachedCount > 0 ? "danger" : priorityVariant(row.key)}>{row.breachedCount} ihlal</Badge>
                    </div>
                    <p className="mt-2 text-xs text-slate-500">Ortalama kalan sure: {formatMinutes(row.avgRemainingMinutes)}</p>
                  </div>
                ))}
              </div>
            </Panel>

            <Panel title="Teknisyen rota optimizasyonu">
              <div className="space-y-2">
                {data.technicianRoutes.length === 0 ? (
                  <EmptyText text="Rota olusturulacak aktif servis yok." />
                ) : data.technicianRoutes.map((row) => (
                  <div key={row.assignedToId ?? "unassigned"} className="rounded-lg border border-slate-800 bg-slate-950/40 p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-slate-100">{row.technicianLabel}</p>
                        <p className="mt-1 text-xs text-slate-500">{row.stopCount} durak / {row.cityCount} sehir / {row.highPriorityCount} kritik-yuksek</p>
                      </div>
                      <Badge variant={row.routeScore >= 75 ? "success" : row.routeScore >= 45 ? "warning" : "danger"}>
                        {row.routeScore} skor
                      </Badge>
                    </div>
                    <div className="mt-3 space-y-2">
                      {row.nextStops.slice(0, 4).map((stop) => (
                        <Link
                          key={stop.serviceRequestId}
                          href={`/dashboard/service/requests/${stop.serviceRequestId}`}
                          className="grid grid-cols-[auto_1fr_auto] items-center gap-2 rounded-md border border-slate-800 bg-slate-900/60 px-2 py-2 text-xs hover:border-sky-500/50"
                        >
                          <span className="font-mono text-sky-300">#{stop.sequence}</span>
                          <span className="min-w-0">
                            <span className="block truncate font-medium text-slate-200">{stop.subject}</span>
                            <span className="block truncate text-slate-500">{stop.city ?? "Sehir yok"} / {stop.serviceRequestNumber}</span>
                          </span>
                          <Badge variant={priorityVariant(stop.priority)}>{stop.priority}</Badge>
                        </Link>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </Panel>
          </section>

          <section>
            <Panel title="Otomatik atama onerileri">
              <div className="space-y-2">
                {data.autoAssignments.length === 0 ? (
                  <EmptyText text="Atama bekleyen servis talebi yok." />
                ) : data.autoAssignments.map((row) => (
                  <Link
                    key={row.serviceRequestId}
                    href={`/dashboard/service/requests/${row.serviceRequestId}`}
                    className="grid gap-3 rounded-lg border border-slate-800 bg-slate-950/40 p-3 hover:border-sky-500/50 md:grid-cols-[1fr_auto_auto]"
                  >
                    <div className="min-w-0">
                      <span className="font-mono text-[11px] text-sky-300">{row.serviceRequestNumber}</span>
                      <p className="mt-1 truncate text-sm font-semibold text-slate-100">{row.subject}</p>
                      <p className="mt-1 text-xs text-slate-500">{row.reason}</p>
                    </div>
                    <div className="text-xs text-slate-400">
                      <span className="block text-slate-500">Onerilen</span>
                      <span className="font-medium text-slate-200">{row.suggestedAssigneeLabel}</span>
                    </div>
                    <div className="flex items-center justify-end gap-2">
                      <Badge variant={priorityVariant(row.priority)}>{row.priority}</Badge>
                      <Badge variant={assignmentTone(row)}>{formatMinutes(row.slaRemainingMinutes)}</Badge>
                      <Badge variant="info">{row.score}</Badge>
                    </div>
                  </Link>
                ))}
              </div>
            </Panel>
          </section>

          <section className="grid gap-4 xl:grid-cols-2">
            <Panel title="Yedek parca rezervasyonu">
              <div className="overflow-auto rounded-lg border border-slate-800">
                <table className="min-w-full divide-y divide-slate-800 text-sm">
                  <thead className="bg-slate-950/60">
                    <tr>
                      <th className="px-3 py-2 text-left text-xs font-medium text-slate-500">Parca</th>
                      <th className="px-3 py-2 text-right text-xs font-medium text-slate-500">Ihtiyac</th>
                      <th className="px-3 py-2 text-right text-xs font-medium text-slate-500">Musait</th>
                      <th className="px-3 py-2 text-right text-xs font-medium text-slate-500">Durum</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {data.sparePartReservations.slice(0, 10).map((row) => (
                      <tr key={`${row.serviceRequestId}:${row.productId ?? row.description}`}>
                        <td className="px-3 py-2">
                          <Link href={`/dashboard/service/requests/${row.serviceRequestId}`} className="font-medium text-sky-300 hover:text-sky-200">
                            {partTitle(row)}
                          </Link>
                          <p className="mt-1 text-xs text-slate-500">{row.serviceRequestNumber} / {row.productCode ?? "Kod yok"}</p>
                        </td>
                        <td className="px-3 py-2 text-right text-slate-400">{formatNumber(row.requiredQty, 2)}</td>
                        <td className="px-3 py-2 text-right text-slate-400">{row.availableQty === null ? "-" : formatNumber(row.availableQty, 2)}</td>
                        <td className="px-3 py-2 text-right"><Badge variant={reservationVariant(row.status)}>{reservationLabel(row.status)}</Badge></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {data.sparePartReservations.length === 0 && <EmptyText text="Rezervasyon riski bulunmuyor." />}
              </div>
            </Panel>

            <Panel title="Musteri portali servis takibi">
              <div className="space-y-2">
                {data.portalTracking.length === 0 ? (
                  <EmptyText text="Portal uzerinden takip edilen servis bulunmuyor." />
                ) : data.portalTracking.map((row) => (
                  <div key={row.contactId} className="rounded-lg border border-slate-800 bg-slate-950/40 p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-slate-100">{row.contactName}</p>
                        <p className="mt-1 text-xs text-slate-500">
                          {row.openRequestCount} acik talep / {row.waitingCustomerCount} musteri bekliyor
                        </p>
                      </div>
                      <Badge variant={row.portalEnabled ? "success" : "neutral"}>{row.portalEnabled ? "Portal aktif" : "Portal pasif"}</Badge>
                    </div>
                    <div className="mt-3 flex items-center justify-between gap-3 text-xs text-slate-500">
                      <span>Son musteri aktivitesi: {formatDateTime(row.lastCustomerActivityAt)}</span>
                      {row.latestRequestHref && (
                        <Link href={row.latestRequestHref} className="font-medium text-sky-300 hover:text-sky-200">
                          Son talep
                        </Link>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </Panel>
          </section>
        </div>
      )}
    </div>
  );
}

function MetricCard({ icon, label, value, tone = "info" }: { icon: ReactNode; label: string; value: ReactNode; tone?: "info" | "warning" | "danger" }) {
  const toneClass = tone === "danger" ? "text-rose-400" : tone === "warning" ? "text-amber-400" : "text-sky-400";
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900 p-4">
      <div className={toneClass}>{icon}</div>
      <span className="mt-3 block text-[10px] font-bold uppercase tracking-wider text-slate-500">{label}</span>
      <span className="mt-1 block text-2xl font-bold text-white">{value}</span>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900 p-4">
      <h2 className="mb-3 text-sm font-semibold text-slate-100">{title}</h2>
      {children}
    </div>
  );
}

function EmptyText({ text }: { text: string }) {
  return <div className="rounded-lg border border-dashed border-slate-800 p-6 text-center text-sm text-slate-500">{text}</div>;
}
