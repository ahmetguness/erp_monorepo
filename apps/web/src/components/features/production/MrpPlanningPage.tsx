"use client";

import { useState } from "react";
import { CalendarDays, Factory, Gauge, RefreshCw, ShieldCheck, ShoppingCart, TrendingUp } from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";
import { DataTable, type ColumnDef } from "@/components/shared/DataTable";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { useMrpPlanning } from "@/hooks/useProduction";
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

function sourceLabel(source: MrpPurchaseRecommendation["source"]): string {
  return source === "bom_component" ? "BOM malzemesi" : "BOM'suz mamul";
}

export function MrpPlanningPage() {
  const [horizonDays, setHorizonDays] = useState(30);
  const { data, isLoading, refetch, isFetching } = useMrpPlanning({ horizonDays });

  const productionColumns: ColumnDef<MrpProductionRecommendation>[] = [
    {
      key: "product",
      header: "Ürün",
      render: (row) => (
        <div>
          <span className="text-sm font-semibold text-white">{row.product.name}</span>
          <span className="block font-mono text-[11px] text-slate-500">{row.product.code}</span>
        </div>
      ),
    },
    {
      key: "bom",
      header: "BOM",
      width: "180px",
      render: (row) => <span className="text-xs text-slate-300">{row.bom.name} v{row.bom.version}</span>,
    },
    {
      key: "demand",
      header: "Talep",
      width: "110px",
      align: "right",
      render: (row) => (
        <div className="text-right">
          <span className="text-slate-300">{formatQty(row.demandQty)}</span>
          <span className="block text-[11px] text-slate-500">
            SO {formatQty(row.openSalesOrderQty)} / tahmin {formatQty(row.forecastDemandQty)}
          </span>
        </div>
      ),
    },
    {
      key: "stock",
      header: "Stok + İş Emri",
      width: "150px",
      align: "right",
      render: (row) => <span className="text-slate-400">{formatQty(row.stockQty + row.openWorkOrderQty)}</span>,
    },
    {
      key: "recommended",
      header: "Öneri",
      width: "110px",
      align: "right",
      render: (row) => (
        <div className="text-right">
          <span className="font-semibold text-sky-300">{formatQty(row.recommendedQty)}</span>
          <span className="block text-[11px] text-slate-500">min {formatQty(row.minOrderQty)}</span>
        </div>
      ),
    },
    {
      key: "capacity",
      header: "Kapasite",
      width: "130px",
      render: (row) => (
        row.capacityGapHours > 0
          ? <Badge variant="warning">{formatHours(row.capacityGapHours)} açık</Badge>
          : <Badge variant="success">Yeterli</Badge>
      ),
    },
    {
      key: "timing",
      header: "Termin",
      width: "120px",
      render: (row) => (
        <div>
          <Badge variant={row.leadTimeDays > 14 ? "warning" : "info"}>{row.leadTimeDays} gun</Badge>
          <span className="mt-1 block text-[11px] text-slate-500">{row.expectedAvailabilityDate}</span>
        </div>
      ),
    },
  ];

  const purchaseColumns: ColumnDef<MrpPurchaseRecommendation>[] = [
    {
      key: "product",
      header: "Ürün",
      render: (row) => (
        <div>
          <span className="text-sm font-semibold text-white">{row.product.name}</span>
          <span className="block font-mono text-[11px] text-slate-500">{row.product.code}</span>
        </div>
      ),
    },
    {
      key: "source",
      header: "Kaynak",
      width: "160px",
      render: (row) => (
        <div>
          <Badge variant={row.source === "bom_component" ? "purple" : "info"}>{sourceLabel(row.source)}</Badge>
          {row.parentProduct && <span className="mt-1 block text-[11px] text-slate-500">{row.parentProduct.name}</span>}
        </div>
      ),
    },
    {
      key: "gross",
      header: "Brüt İhtiyaç",
      width: "120px",
      align: "right",
      render: (row) => (
        <div className="text-right">
          <span className="text-slate-300">{formatQty(row.grossRequirementQty)}</span>
          <span className="block text-[11px] text-slate-500">emniyet {formatQty(row.safetyStockQty)}</span>
        </div>
      ),
    },
    {
      key: "available",
      header: "Stok + Satın Alma",
      width: "150px",
      align: "right",
      render: (row) => <span className="text-slate-400">{formatQty(row.stockQty + row.openPurchaseQty)}</span>,
    },
    {
      key: "recommended",
      header: "Öneri",
      width: "110px",
      align: "right",
      render: (row) => (
        <div className="text-right">
          <span className="font-semibold text-amber-300">{formatQty(row.recommendedQty)}</span>
          <span className="block text-[11px] text-slate-500">min {formatQty(row.minOrderQty)}</span>
        </div>
      ),
    },
    {
      key: "leadTime",
      header: "Tedarik",
      width: "120px",
      render: (row) => (
        <div>
          <Badge variant={row.leadTimeDays > 14 ? "warning" : "info"}>{row.leadTimeDays} gun</Badge>
          <span className="mt-1 block text-[11px] text-slate-500">{row.expectedReceiptDate}</span>
        </div>
      ),
    },
  ];

  const capacityColumns: ColumnDef<MrpCapacityRecommendation>[] = [
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
      key: "required",
      header: "Gereken",
      width: "120px",
      align: "right",
      render: (row) => <span className="text-slate-300">{formatHours(row.requiredHours)}</span>,
    },
    {
      key: "available",
      header: "Kapasite",
      width: "120px",
      align: "right",
      render: (row) => <span className="text-slate-400">{formatHours(row.availableHours)}</span>,
    },
    {
      key: "allocated",
      header: "Ayrılmış",
      width: "120px",
      align: "right",
      render: (row) => <span className="text-slate-400">{formatHours(row.allocatedHours)}</span>,
    },
    {
      key: "gap",
      header: "Açık",
      width: "110px",
      align: "right",
      render: (row) => <span className="font-semibold text-red-300">{formatHours(row.gapHours)}</span>,
    },
  ];

  const summary = data?.summary;

  return (
    <div>
      <PageHeader
        title="MRP ve Üretim Planlama"
        subtitle="Açık satış siparişleri, stok, BOM ve kapasiteye göre üretim ve satın alma önerileri."
        action={
          <>
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
            <Button variant="secondary" size="sm" onClick={() => void refetch()} loading={isFetching}>
              <RefreshCw className="h-3.5 w-3.5" />
              Yenile
            </Button>
          </>
        }
      />

      <div className="mb-5 grid gap-3 md:grid-cols-4 xl:grid-cols-6">
        <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
          <Factory className="mb-2 h-4 w-4 text-sky-400" />
          <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-500">Üretim Önerisi</span>
          <span className="mt-1 block text-2xl font-bold text-white">{summary?.productionRecommendationCount ?? 0}</span>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
          <ShoppingCart className="mb-2 h-4 w-4 text-amber-400" />
          <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-500">Satın Alma Önerisi</span>
          <span className="mt-1 block text-2xl font-bold text-white">{summary?.purchaseRecommendationCount ?? 0}</span>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
          <Gauge className="mb-2 h-4 w-4 text-red-400" />
          <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-500">Kapasite Açığı</span>
          <span className="mt-1 block text-2xl font-bold text-white">{summary?.capacityGapCount ?? 0}</span>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
          <TrendingUp className="mb-2 h-4 w-4 text-emerald-400" />
          <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-500">Satis Tahmini</span>
          <span className="mt-1 block text-2xl font-bold text-white">{formatQty(summary?.forecastDemandQty ?? 0)}</span>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
          <ShieldCheck className="mb-2 h-4 w-4 text-violet-400" />
          <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-500">Emniyet Stoku</span>
          <span className="mt-1 block text-2xl font-bold text-white">{formatQty(summary?.safetyStockQty ?? 0)}</span>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
          <CalendarDays className="mb-2 h-4 w-4 text-slate-400" />
          <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-500">Talep Ürünü</span>
          <span className="mt-1 block text-2xl font-bold text-white">{summary?.demandProducts ?? 0}</span>
          <span className="mt-1 block text-xs text-slate-500">{summary?.horizonDays ?? horizonDays} günlük pencere</span>
        </div>
      </div>

      <div className="space-y-6">
        <section>
          <h2 className="mb-3 text-sm font-semibold text-white">Üretim Önerileri</h2>
          <DataTable
            columns={productionColumns}
            data={data?.productionRecommendations ?? []}
            keyExtractor={(row) => row.product.id}
            isLoading={isLoading}
            emptyTitle="Üretim önerisi yok"
            emptyDescription="Seçili planlama penceresinde üretim ihtiyacı görünmüyor."
          />
        </section>

        <section>
          <h2 className="mb-3 text-sm font-semibold text-white">Satın Alma Önerileri</h2>
          <DataTable
            columns={purchaseColumns}
            data={data?.purchaseRecommendations ?? []}
            keyExtractor={(row) => `${row.source}-${row.parentProduct?.id ?? "root"}-${row.product.id}`}
            isLoading={isLoading}
            emptyTitle="Satın alma önerisi yok"
            emptyDescription="BOM veya mamul stok açıkları açık satın alma ile karşılanıyor."
          />
        </section>

        <section>
          <h2 className="mb-3 text-sm font-semibold text-white">Kapasite Açıkları</h2>
          <DataTable
            columns={capacityColumns}
            data={data?.capacityRecommendations ?? []}
            keyExtractor={(row) => row.workCenter.id}
            isLoading={isLoading}
            emptyTitle="Kapasite açığı yok"
            emptyDescription="Seçili planlama penceresinde iş merkezi kapasitesi yeterli görünüyor."
          />
        </section>
      </div>
    </div>
  );
}
