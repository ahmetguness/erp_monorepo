"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, CalendarDays, Factory, Gauge, RefreshCw, ShoppingCart } from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";
import { Badge, type BadgeVariant } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { useMrpPlanning } from "@/hooks/useProduction";
import { cn } from "@/lib/utils";
import type {
  MrpCapacityRecommendation,
  MrpProductionRecommendation,
  MrpPurchaseRecommendation,
} from "@/services/production.service";

function formatQty(value: number): string {
  return new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 3 }).format(value);
}

function formatHours(value: number): string {
  return `${new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 1 }).format(value)} saat`;
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("tr-TR", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(value));
}

function sourceLabel(source: MrpPurchaseRecommendation["source"]): string {
  return source === "bom_component" ? "BOM malzemesi" : "BOM'suz mamul";
}

function leadTimeVariant(days: number): BadgeVariant {
  if (days > 21) return "warning";
  if (days > 7) return "info";
  return "neutral";
}

function availableQty(row: MrpProductionRecommendation): number {
  return row.stockQty + row.openWorkOrderQty;
}

function purchaseAvailableQty(row: MrpPurchaseRecommendation): number {
  return row.stockQty + row.openPurchaseQty;
}

export function MrpPlanningPage() {
  const [horizonDays, setHorizonDays] = useState(30);
  const { data, isLoading, refetch, isFetching } = useMrpPlanning({ horizonDays });

  const productionRows = useMemo(
    () => [...(data?.productionRecommendations ?? [])].sort((a, b) => b.recommendedQty - a.recommendedQty),
    [data?.productionRecommendations],
  );
  const purchaseRows = useMemo(
    () => [...(data?.purchaseRecommendations ?? [])].sort((a, b) => b.recommendedQty - a.recommendedQty),
    [data?.purchaseRecommendations],
  );
  const capacityRows = useMemo(
    () => [...(data?.capacityRecommendations ?? [])].sort((a, b) => b.gapHours - a.gapHours),
    [data?.capacityRecommendations],
  );
  const summary = data?.summary;
  const totalRecommendedProduction = productionRows.reduce((sum, row) => sum + row.recommendedQty, 0);
  const totalRecommendedPurchase = purchaseRows.reduce((sum, row) => sum + row.recommendedQty, 0);
  const totalCapacityGap = capacityRows.reduce((sum, row) => sum + row.gapHours, 0);
  const hasAttention = Boolean((summary?.productionRecommendationCount ?? 0) || (summary?.purchaseRecommendationCount ?? 0) || (summary?.capacityGapCount ?? 0));

  return (
    <div className="space-y-5">
      <PageHeader
        title="MRP ve Üretim Planlama"
        subtitle="Açık satış siparişleri, stok, BOM ve kapasiteye göre üretim ve satın alma önerilerini yönetin."
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
              <SummaryMetric label="Üretim Önerisi" value={summary?.productionRecommendationCount ?? 0} tone="text-sky-300" />
              <SummaryMetric label="Üretilecek" value={`${formatQty(totalRecommendedProduction)} AD`} />
              <SummaryMetric label="Satın Alma Önerisi" value={summary?.purchaseRecommendationCount ?? 0} tone="text-amber-300" />
              <SummaryMetric label="Alınacak" value={`${formatQty(totalRecommendedPurchase)} AD`} />
              <SummaryMetric label="Kapasite Açığı" value={formatHours(totalCapacityGap)} tone={totalCapacityGap > 0 ? "text-red-300" : "text-slate-200"} />
              <SummaryMetric label="Talep Ürünü" value={summary?.demandProducts ?? 0} />
            </div>
          </div>

          {hasAttention && (
            <div className="rounded-xl border border-amber-500/25 bg-amber-500/[0.06] px-4 py-3">
              <div className="flex items-center gap-2 text-sm text-amber-100">
                <AlertTriangle className="h-4 w-4 shrink-0 text-amber-300" />
                <span>
                  {summary?.horizonDays ?? horizonDays} günlük pencerede
                  <strong className="mx-1 font-semibold">{summary?.productionRecommendationCount ?? 0}</strong> üretim,
                  <strong className="mx-1 font-semibold">{summary?.purchaseRecommendationCount ?? 0}</strong> satın alma önerisi ve
                  <strong className="mx-1 font-semibold">{summary?.capacityGapCount ?? 0}</strong> kapasite açığı var.
                </span>
              </div>
            </div>
          )}

          <section className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
            <Panel title="Üretim Önerileri" subtitle="Talep, stok ve açık iş emirlerine göre üretilecek mamuller." icon={<Factory className="h-4 w-4 text-sky-300" />}>
              <ProductionTable rows={productionRows} />
            </Panel>
            <Panel title="Satın Alma Önerileri" subtitle="BOM malzemeleri ve BOM'suz mamuller için tedarik ihtiyacı." icon={<ShoppingCart className="h-4 w-4 text-amber-300" />}>
              <PurchaseTable rows={purchaseRows} />
            </Panel>
          </section>

          <Panel title="Kapasite Açıkları" subtitle="Planlanan üretim için gereken ve mevcut iş merkezi saatleri." icon={<Gauge className="h-4 w-4 text-red-300" />}>
            <CapacityTable rows={capacityRows} />
          </Panel>

          <div className="rounded-xl border border-slate-800/80 bg-slate-950/35 px-4 py-3 text-xs text-slate-500">
            <CalendarDays className="mr-2 inline h-3.5 w-3.5 text-slate-500" />
            Planlama penceresi {summary?.horizonDays ?? horizonDays} gün. Satış tahmini {formatQty(summary?.forecastDemandQty ?? 0)} AD, açık satış siparişi {formatQty(summary?.openSalesOrderQty ?? 0)} AD, emniyet stoku {formatQty(summary?.safetyStockQty ?? 0)} AD.
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

function ProductionTable({ rows }: { rows: MrpProductionRecommendation[] }) {
  if (rows.length === 0) return <EmptyText title="Üretim önerisi yok" text="Seçili planlama penceresinde üretim ihtiyacı görünmüyor." />;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[900px] text-sm">
        <thead>
          <tr className="border-b border-slate-800/80">
            {["Ürün", "Talep", "Karşılık", "Öneri", "BOM", "Termin", "Kapasite"].map((header, index) => (
              <th key={header} className={cn("px-3 py-2 text-left text-[11px] font-semibold uppercase text-slate-500", [1, 2, 3].includes(index) && "text-right")}>{header}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.product.id} className="border-b border-slate-800/45 last:border-b-0">
              <td className="px-3 py-3">
                <p className="font-medium text-slate-100">{row.product.name}</p>
                <p className="mt-0.5 font-mono text-xs text-slate-500">{row.product.code}</p>
              </td>
              <td className="px-3 py-3 text-right tabular-nums text-slate-300">
                {formatQty(row.demandQty)}
                <p className="text-[11px] text-slate-500">SO {formatQty(row.openSalesOrderQty)} / tahmin {formatQty(row.forecastDemandQty)}</p>
              </td>
              <td className="px-3 py-3 text-right tabular-nums text-slate-400">
                {formatQty(availableQty(row))}
                <p className="text-[11px] text-slate-500">stok {formatQty(row.stockQty)} / iş emri {formatQty(row.openWorkOrderQty)}</p>
              </td>
              <td className="px-3 py-3 text-right">
                <p className="font-semibold tabular-nums text-sky-300">{formatQty(row.recommendedQty)} AD</p>
                <p className="text-[11px] text-slate-500">min {formatQty(row.minOrderQty)}</p>
              </td>
              <td className="px-3 py-3 text-slate-300">
                <p className="text-xs">{row.bom.name}</p>
                <p className="mt-0.5 font-mono text-[11px] text-slate-500">v{row.bom.version}</p>
              </td>
              <td className="px-3 py-3">
                <Badge variant={leadTimeVariant(row.leadTimeDays)}>{row.leadTimeDays} gün</Badge>
                <p className="mt-1 text-xs text-slate-500">{formatDate(row.expectedAvailabilityDate)}</p>
              </td>
              <td className="px-3 py-3">
                {row.capacityGapHours > 0 ? <Badge variant="warning">{formatHours(row.capacityGapHours)} açık</Badge> : <Badge variant="info">Yeterli</Badge>}
                <p className="mt-1 text-xs text-slate-500">{formatHours(row.capacityHours)} ihtiyaç</p>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PurchaseTable({ rows }: { rows: MrpPurchaseRecommendation[] }) {
  if (rows.length === 0) return <EmptyText title="Satın alma önerisi yok" text="BOM veya mamul stok açıkları açık satın alma ile karşılanıyor." />;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[760px] text-sm">
        <thead>
          <tr className="border-b border-slate-800/80">
            {["Ürün", "Kaynak", "Brüt İhtiyaç", "Karşılık", "Öneri", "Tedarik"].map((header, index) => (
              <th key={header} className={cn("px-3 py-2 text-left text-[11px] font-semibold uppercase text-slate-500", [2, 3, 4].includes(index) && "text-right")}>{header}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={`${row.source}-${row.parentProduct?.id ?? "root"}-${row.product.id}`} className="border-b border-slate-800/45 last:border-b-0">
              <td className="px-3 py-3">
                <p className="font-medium text-slate-100">{row.product.name}</p>
                <p className="mt-0.5 font-mono text-xs text-slate-500">{row.product.code}</p>
              </td>
              <td className="px-3 py-3">
                <Badge variant={row.source === "bom_component" ? "purple" : "info"}>{sourceLabel(row.source)}</Badge>
                {row.parentProduct && <p className="mt-1 text-xs text-slate-500">{row.parentProduct.name}</p>}
              </td>
              <td className="px-3 py-3 text-right tabular-nums text-slate-300">
                {formatQty(row.grossRequirementQty)}
                <p className="text-[11px] text-slate-500">emniyet {formatQty(row.safetyStockQty)}</p>
              </td>
              <td className="px-3 py-3 text-right tabular-nums text-slate-400">
                {formatQty(purchaseAvailableQty(row))}
                <p className="text-[11px] text-slate-500">stok {formatQty(row.stockQty)} / satın alma {formatQty(row.openPurchaseQty)}</p>
              </td>
              <td className="px-3 py-3 text-right">
                <p className="font-semibold tabular-nums text-amber-300">{formatQty(row.recommendedQty)} AD</p>
                <p className="text-[11px] text-slate-500">min {formatQty(row.minOrderQty)}</p>
              </td>
              <td className="px-3 py-3">
                <Badge variant={leadTimeVariant(row.leadTimeDays)}>{row.leadTimeDays} gün</Badge>
                <p className="mt-1 text-xs text-slate-500">{formatDate(row.expectedReceiptDate)}</p>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CapacityTable({ rows }: { rows: MrpCapacityRecommendation[] }) {
  if (rows.length === 0) return <EmptyText title="Kapasite açığı yok" text="Seçili planlama penceresinde iş merkezi kapasitesi yeterli görünüyor." />;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[700px] text-sm">
        <thead>
          <tr className="border-b border-slate-800/80">
            {["İş Merkezi", "Gereken", "Kapasite", "Ayrılmış", "Açık"].map((header, index) => (
              <th key={header} className={cn("px-3 py-2 text-left text-[11px] font-semibold uppercase text-slate-500", index > 0 && "text-right")}>{header}</th>
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
              <td className="px-3 py-3 text-right tabular-nums text-slate-300">{formatHours(row.requiredHours)}</td>
              <td className="px-3 py-3 text-right tabular-nums text-slate-400">{formatHours(row.availableHours)}</td>
              <td className="px-3 py-3 text-right tabular-nums text-slate-400">{formatHours(row.allocatedHours)}</td>
              <td className="px-3 py-3 text-right font-semibold tabular-nums text-red-300">{formatHours(row.gapHours)}</td>
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
