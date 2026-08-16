"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, ClipboardCheck, PackageX, RefreshCw, ShieldCheck, Star } from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";
import { Badge, type BadgeVariant } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { useQualityControl } from "@/hooks/useProduction";
import { cn } from "@/lib/utils";
import type {
  QualityAcceptanceCriteriaRow,
  QualityAcceptanceStatus,
  QualityActionPriority,
  QualityActionStatus,
  QualityCorrectiveActionRow,
  QualityFormRow,
  QualityFormStatus,
  QualityIssueSeverity,
  QualityIssueType,
  QualityNonconformityRow,
  QualityQuarantineStockRow,
  QualityQuarantineStatus,
  SupplierQualityRisk,
  SupplierQualityScoreRow,
} from "@/services/production.service";

function formatQty(value: number): string {
  return new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 3 }).format(value);
}

function formatPct(value: number): string {
  return `%${new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 1 }).format(value)}`;
}

function formatDate(value: string | null): string {
  if (!value) return "-";
  return new Intl.DateTimeFormat("tr-TR", { day: "2-digit", month: "short" }).format(new Date(value));
}

function formStatusVariant(status: QualityFormStatus): BadgeVariant {
  if (status === "ready") return "success";
  if (status === "needs_review") return "warning";
  return "danger";
}

function formStatusLabel(status: QualityFormStatus): string {
  if (status === "ready") return "Hazır";
  if (status === "needs_review") return "Kontrol";
  return "Bloke";
}

function severityVariant(severity: QualityIssueSeverity): BadgeVariant {
  if (severity === "critical") return "danger";
  if (severity === "high") return "warning";
  if (severity === "low") return "info";
  return "purple";
}

function severityLabel(severity: QualityIssueSeverity): string {
  if (severity === "critical") return "Kritik";
  if (severity === "high") return "Yüksek";
  if (severity === "low") return "Düşük";
  return "Orta";
}

function issueTypeLabel(type: QualityIssueType): string {
  if (type === "scrap") return "Fire";
  if (type === "under_production") return "Eksik üretim";
  if (type === "material_shortage") return "Girdi eksiği";
  return "Durdurma";
}

function actionStatusVariant(status: QualityActionStatus): BadgeVariant {
  if (status === "done") return "success";
  if (status === "in_progress") return "warning";
  if (status === "suggested") return "purple";
  return "info";
}

function actionStatusLabel(status: QualityActionStatus): string {
  if (status === "done") return "Tamam";
  if (status === "in_progress") return "Devam";
  if (status === "suggested") return "Öneri";
  return "Açık";
}

function priorityVariant(priority: QualityActionPriority): BadgeVariant {
  if (priority === "critical") return "danger";
  if (priority === "high") return "warning";
  if (priority === "low") return "neutral";
  return "info";
}

function priorityLabel(priority: QualityActionPriority): string {
  if (priority === "critical") return "Kritik";
  if (priority === "high") return "Yüksek";
  if (priority === "low") return "Düşük";
  return "Orta";
}

function acceptanceVariant(status: QualityAcceptanceStatus): BadgeVariant {
  if (status === "failed") return "danger";
  if (status === "watch") return "warning";
  return "success";
}

function acceptanceLabel(status: QualityAcceptanceStatus): string {
  if (status === "failed") return "Başarısız";
  if (status === "watch") return "İzle";
  return "Geçti";
}

function quarantineVariant(status: QualityQuarantineStatus): BadgeVariant {
  if (status === "blocked") return "danger";
  if (status === "released") return "success";
  return "warning";
}

function quarantineLabel(status: QualityQuarantineStatus): string {
  if (status === "blocked") return "Bloke";
  if (status === "released") return "Serbest";
  return "Bekliyor";
}

function supplierRiskVariant(risk: SupplierQualityRisk): BadgeVariant {
  if (risk === "high") return "danger";
  if (risk === "medium") return "warning";
  return "success";
}

function supplierRiskLabel(risk: SupplierQualityRisk): string {
  if (risk === "high") return "Riskli";
  if (risk === "medium") return "İzle";
  return "İyi";
}

function checklistSummary(row: QualityFormRow): string {
  const passed = row.checklist.filter((item) => item.passed).length;
  return `${passed}/${row.checklist.length}`;
}

function workOrderHref(id: string): string {
  return `/dashboard/production/work-orders/${id}`;
}

export function QualityControlPage() {
  const [horizonDays, setHorizonDays] = useState(30);
  const { data, isLoading, isFetching, refetch } = useQualityControl({ horizonDays });

  const forms = useMemo(() => [...(data?.inputForms ?? []), ...(data?.outputForms ?? [])], [data?.inputForms, data?.outputForms]);
  const blockedForms = useMemo(() => forms.filter((row) => row.status === "blocked"), [forms]);
  const attentionIssues = useMemo(
    () => [...(data?.nonconformities ?? [])].sort((a, b) => b.quantityImpact - a.quantityImpact).slice(0, 6),
    [data?.nonconformities],
  );
  const openActions = useMemo(
    () => [...(data?.correctiveActions ?? [])].filter((row) => row.status !== "done").slice(0, 6),
    [data?.correctiveActions],
  );
  const summary = data?.summary;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Kalite Kontrol"
        subtitle="Üretim girdi/çıktı kalite formları, uygunsuzluk kayıtları ve düzeltici faaliyet takibi."
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
          <div className="rounded-xl border border-slate-800/80 bg-slate-950/35 px-4 py-3">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
              <SummaryMetric label="Form" value={(summary?.inputFormCount ?? 0) + (summary?.outputFormCount ?? 0)} />
              <SummaryMetric label="Bloke Form" value={summary?.blockedFormCount ?? blockedForms.length} tone={(summary?.blockedFormCount ?? 0) > 0 ? "text-red-300" : "text-slate-200"} />
              <SummaryMetric label="Uygunsuzluk" value={summary?.nonconformityCount ?? 0} tone={(summary?.nonconformityCount ?? 0) > 0 ? "text-amber-300" : "text-slate-200"} />
              <SummaryMetric label="Kritik" value={summary?.criticalIssueCount ?? 0} tone={(summary?.criticalIssueCount ?? 0) > 0 ? "text-red-300" : "text-slate-200"} />
              <SummaryMetric label="Karantina" value={`${formatQty(summary?.quarantineQuantity ?? 0)} AD`} tone={(summary?.quarantineQuantity ?? 0) > 0 ? "text-amber-300" : "text-slate-200"} />
              <SummaryMetric label="Tedarikçi Riski" value={summary?.supplierQualityRiskCount ?? 0} />
            </div>
          </div>

          {((summary?.blockedFormCount ?? 0) > 0 || (summary?.criticalIssueCount ?? 0) > 0 || (summary?.failedCriteriaCount ?? 0) > 0) && (
            <div className="rounded-xl border border-amber-500/25 bg-amber-500/[0.06] px-4 py-3">
              <div className="flex items-center gap-2 text-sm text-amber-100">
                <AlertTriangle className="h-4 w-4 shrink-0 text-amber-300" />
                <span>
                  Kalite kontrolünde
                  <strong className="mx-1 font-semibold">{summary?.blockedFormCount ?? 0}</strong> bloke form,
                  <strong className="mx-1 font-semibold">{summary?.criticalIssueCount ?? 0}</strong> kritik uygunsuzluk ve
                  <strong className="mx-1 font-semibold">{summary?.failedCriteriaCount ?? 0}</strong> başarısız kriter var.
                </span>
              </div>
            </div>
          )}

          <section className="grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
            <Panel title="Kabul Kriterleri" subtitle="Kontrol kriterlerinin geçiş oranı ve risk durumu." icon={<ClipboardCheck className="h-4 w-4 text-sky-300" />}>
              <AcceptanceTable rows={data.acceptanceCriteria} />
            </Panel>
            <Panel title="Kalite Öncelikleri" subtitle="En yüksek etkili uygunsuzluklar ve açık düzeltici faaliyetler." icon={<AlertTriangle className="h-4 w-4 text-amber-300" />}>
              <div className="space-y-2">
                {attentionIssues.length === 0 && openActions.length === 0 ? (
                  <EmptyText title="Açık kalite riski yok" text="Seçili pencerede takip gerektiren uygunsuzluk veya faaliyet görünmüyor." />
                ) : (
                  <>
                    {attentionIssues.map((row) => <IssueCard key={row.id} row={row} />)}
                    {openActions.map((row) => <ActionCard key={row.id} row={row} />)}
                  </>
                )}
              </div>
            </Panel>
          </section>

          <section className="grid gap-4 xl:grid-cols-2">
            <Panel title="Girdi Kalite Formları" subtitle="Üretime başlamadan önceki kontrol durumu." icon={<ShieldCheck className="h-4 w-4 text-sky-300" />}>
              <FormsTable rows={data.inputForms} />
            </Panel>
            <Panel title="Çıktı Kalite Formları" subtitle="Üretim çıktısı ve tamamlanma kontrolleri." icon={<CheckCircle2 className="h-4 w-4 text-emerald-300" />}>
              <FormsTable rows={data.outputForms} />
            </Panel>
          </section>

          <section className="grid gap-4 xl:grid-cols-[1fr_0.9fr]">
            <Panel title="Karantina Stoku" subtitle="Uygunsuzluklardan karantinaya ayrılan miktarlar." icon={<PackageX className="h-4 w-4 text-red-300" />}>
              <QuarantineTable rows={data.quarantineStock} />
            </Panel>
            <Panel title="Tedarikçi Kalite Skoru" subtitle="Kabul ve iade oranlarına göre tedarikçi kalite riski." icon={<Star className="h-4 w-4 text-amber-300" />}>
              <SupplierTable rows={data.supplierQualityScores} />
            </Panel>
          </section>
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

function AcceptanceTable({ rows }: { rows: QualityAcceptanceCriteriaRow[] }) {
  if (rows.length === 0) return <EmptyText title="Kabul kriteri yok" text="Seçili pencerede kalite formu oluşmadığı için kriter özeti bulunmuyor." />;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[560px] text-sm">
        <thead><tr className="border-b border-slate-800/80">{["Kriter", "Geçiş", "Örnek", "Durum"].map((h, i) => <th key={h} className={cn("px-3 py-2 text-left text-[11px] font-semibold uppercase text-slate-500", [1, 2].includes(i) && "text-right")}>{h}</th>)}</tr></thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.key} className="border-b border-slate-800/45 last:border-b-0">
              <td className="px-3 py-3"><p className="font-medium text-slate-100">{row.label}</p><p className="mt-0.5 font-mono text-xs text-slate-500">{row.key}</p></td>
              <td className="px-3 py-3 text-right font-semibold tabular-nums text-slate-100">{formatPct(row.passRatePct)}</td>
              <td className="px-3 py-3 text-right tabular-nums text-slate-300">{row.passedCount}/{row.totalCount}</td>
              <td className="px-3 py-3"><Badge variant={acceptanceVariant(row.status)}>{acceptanceLabel(row.status)}</Badge></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function FormsTable({ rows }: { rows: QualityFormRow[] }) {
  if (rows.length === 0) return <EmptyText title="Form yok" text="Seçili pencerede bu tip kalite kontrol formu bulunmuyor." />;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[660px] text-sm">
        <thead><tr className="border-b border-slate-800/80">{["İş Emri", "Ürün", "Miktar", "Tamam", "Kontrol", "Durum"].map((h, i) => <th key={h} className={cn("px-3 py-2 text-left text-[11px] font-semibold uppercase text-slate-500", [2, 3, 4].includes(i) && "text-right")}>{h}</th>)}</tr></thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} className="border-b border-slate-800/45 last:border-b-0">
              <td className="px-3 py-3"><Link href={workOrderHref(row.workOrderId)} className="font-mono text-xs font-semibold text-sky-300 hover:text-sky-200">{row.workOrderNumber}</Link></td>
              <td className="px-3 py-3"><p className="font-medium text-slate-100">{row.product.name}</p><p className="mt-0.5 font-mono text-xs text-slate-500">{row.product.code}</p></td>
              <td className="px-3 py-3 text-right tabular-nums text-slate-300">{formatQty(row.producedQty)} / {formatQty(row.plannedQty)}</td>
              <td className="px-3 py-3 text-right font-semibold tabular-nums text-slate-100">{formatPct(row.completionPct)}</td>
              <td className="px-3 py-3 text-right font-mono text-emerald-300">{checklistSummary(row)}</td>
              <td className="px-3 py-3"><Badge variant={formStatusVariant(row.status)}>{formStatusLabel(row.status)}</Badge></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function IssueCard({ row }: { row: QualityNonconformityRow }) {
  return (
    <Link href={workOrderHref(row.workOrderId)} className="block rounded-lg border border-slate-800 bg-slate-950/35 p-3 transition-colors hover:bg-sky-500/[0.04]">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0"><p className="font-medium text-slate-100">{row.title}</p><p className="mt-0.5 text-xs text-slate-500">{row.detail}</p><p className="mt-1 font-mono text-xs text-sky-300">{row.workOrderNumber}</p></div>
        <Badge variant={severityVariant(row.severity)}>{issueTypeLabel(row.type)} · {severityLabel(row.severity)}</Badge>
      </div>
      <p className="mt-2 text-xs tabular-nums text-slate-500">Etki {formatQty(row.quantityImpact)} AD · {formatDate(row.detectedAt)}</p>
    </Link>
  );
}

function ActionCard({ row }: { row: QualityCorrectiveActionRow }) {
  return (
    <Link href={workOrderHref(row.workOrderId)} className="block rounded-lg border border-slate-800 bg-slate-950/35 p-3 transition-colors hover:bg-sky-500/[0.04]">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0"><p className="font-medium text-slate-100">{row.title}</p>{row.detail && <p className="mt-0.5 text-xs text-slate-500">{row.detail}</p>}<p className="mt-1 font-mono text-xs text-sky-300">{row.workOrderNumber}</p></div>
        <Badge variant={priorityVariant(row.priority)}>{priorityLabel(row.priority)}</Badge>
      </div>
      <div className="mt-2 flex items-center gap-2 text-xs text-slate-500"><Badge variant={actionStatusVariant(row.status)}>{actionStatusLabel(row.status)}</Badge><span>Termin {formatDate(row.dueAt)}</span></div>
    </Link>
  );
}

function QuarantineTable({ rows }: { rows: QualityQuarantineStockRow[] }) {
  if (rows.length === 0) return <EmptyText title="Karantina bekleyen stok yok" text="Uygunsuzluklardan karantinaya alınacak miktar görünmüyor." />;
  return (
    <div className="space-y-2">
      {rows.map((row) => (
        <div key={row.id} className="rounded-lg border border-slate-800 bg-slate-950/35 p-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0"><p className="font-medium text-slate-100">{row.product.name}</p><p className="mt-0.5 font-mono text-xs text-slate-500">{row.product.code} · {row.workOrderNumber}</p><p className="mt-1 text-xs text-slate-500">{row.reason}</p></div>
            <div className="text-right"><p className="font-semibold tabular-nums text-amber-300">{formatQty(row.quantity)} AD</p><Badge variant={quarantineVariant(row.status)}>{quarantineLabel(row.status)}</Badge></div>
          </div>
        </div>
      ))}
    </div>
  );
}

function SupplierTable({ rows }: { rows: SupplierQualityScoreRow[] }) {
  if (rows.length === 0) return <EmptyText title="Tedarikçi kalite skoru yok" text="Satınalma geçmişi olan tedarikçi bulununca kalite skorları burada listelenir." />;
  return (
    <div className="space-y-2">
      {rows.map((row) => (
        <div key={row.supplier.id} className="rounded-lg border border-slate-800 bg-slate-950/35 p-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0"><p className="font-medium text-slate-100">{row.supplier.name}</p><p className="mt-0.5 font-mono text-xs text-slate-500">{row.supplier.code} · {row.totalOrders} sipariş</p></div>
            <Badge variant={supplierRiskVariant(row.risk)}>{supplierRiskLabel(row.risk)}</Badge>
          </div>
          <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
            <Metric label="Skor" value={`${row.qualityScore}/100`} />
            <Metric label="Kabul" value={formatPct(row.acceptanceRatePct)} />
            <Metric label="İade" value={formatPct(row.returnRatePct)} />
          </div>
        </div>
      ))}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div><p className="text-[11px] text-slate-500">{label}</p><p className="mt-0.5 font-medium tabular-nums text-slate-300">{value}</p></div>;
}

function LoadingState() {
  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-slate-800/80 bg-slate-950/35 px-4 py-3"><div className="h-5 w-3/4 animate-pulse rounded bg-slate-800/80" /></div>
      <div className="grid gap-4 xl:grid-cols-2">{[1, 2].map((item) => <div key={item} className="rounded-xl border border-slate-800/80 bg-slate-950/40 p-4"><div className="h-5 w-40 animate-pulse rounded bg-slate-800/80" /><div className="mt-4 space-y-3">{Array.from({ length: 5 }).map((_, index) => <div key={index} className="h-10 animate-pulse rounded bg-slate-800/60" />)}</div></div>)}</div>
    </div>
  );
}

function EmptyText({ title, text }: { title: string; text: string }) {
  return <div className="rounded-lg border border-slate-800 bg-slate-950/35 p-4"><p className="text-sm font-semibold text-slate-200">{title}</p><p className="mt-1 text-sm text-slate-500">{text}</p></div>;
}
