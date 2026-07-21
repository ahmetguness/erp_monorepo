"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, Copy, Edit, Eye, FilterX, PackageCheck, Plus, Search, TrendingUp, Warehouse, XCircle } from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";
import { DataTable, type ColumnDef } from "@/components/shared/DataTable";
import { EntityImage } from "@/components/shared/EntityImage";
import { ListStandardControls } from "@/components/shared/ListStandardControls";
import { RowActions, type RowAction } from "@/components/shared/RowActions";
import { ActiveBadge } from "@/components/shared/StatusBadge";
import { useProducts } from "@/hooks/useProducts";
import { useCategories } from "@/hooks/useMasterData";
import { usePlanFeatures } from "@/hooks/usePlanFeatures";
import { useListStandardState, type ListFilterState } from "@/hooks/useListStandardState";
import { cn, formatCurrency } from "@/lib/utils";
import { Button } from "@/components/ui/Button";
import { Badge, type BadgeVariant } from "@/components/ui/Badge";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import type { Product } from "@/services/product.service";
import { getSavedViewFilterString } from "@/services/saved-view.service";
import { StarterCsvImportWizard } from "@/components/shared/StarterCsvImportWizard";
import { ProductLimitNotice } from "./ProductLimitNotice";
import { getProductLimitStatus, PRODUCT_LIMIT_UPGRADE_HREF } from "./product-limit";

type ActiveFilter = "" | "true" | "false";
type QuickQualityFilter = "" | "noCategory" | "missingPrice" | "missingMinStock" | "lowMargin";

interface ProductListFilters extends ListFilterState {
  search: string;
  categoryId: string;
  activeFilter: ActiveFilter;
  qualityFilter: QuickQualityFilter;
  minMargin: string;
  maxMargin: string;
  density: "compact" | "comfortable";
}

const ACTIVE_OPTIONS = [
  { value: "", label: "Tüm Durumlar" },
  { value: "true", label: "Aktif" },
  { value: "false", label: "Pasif" },
];

const QUALITY_OPTIONS: Array<{ value: QuickQualityFilter; label: string }> = [
  { value: "", label: "Tüm Kalite" },
  { value: "noCategory", label: "Kategorisiz" },
  { value: "missingPrice", label: "Fiyatsız" },
  { value: "missingMinStock", label: "Stok eşiği yok" },
  { value: "lowMargin", label: "Düşük marj" },
];

const DEFAULT_PAGE_SIZE = 20;
const PRODUCT_COLUMN_KEYS = ["code", "category", "unit", "stockRisk", "margin", "salesPrice", "purchasePrice", "averageCost", "taxRate", "isActive", "actions"] as const;

function parseActiveFilter(value: string): ActiveFilter {
  if (value === "true" || value === "false") return value;
  return "";
}

function parseQualityFilter(value: string): QuickQualityFilter {
  if (value === "noCategory" || value === "missingPrice" || value === "missingMinStock" || value === "lowMargin") return value;
  return "";
}

function marginPercent(product: Product): number {
  if (product.salesPrice <= 0) return -100;
  return ((product.salesPrice - product.purchasePrice) / product.salesPrice) * 100;
}

function marginMeta(product: Product): { label: string; variant: BadgeVariant; value: number } {
  const margin = marginPercent(product);
  if (product.salesPrice <= 0 || product.purchasePrice <= 0) return { label: "Fiyat eksik", variant: "danger", value: margin };
  if (margin < 10) return { label: `%${Math.round(margin)} düşük`, variant: "warning", value: margin };
  return { label: `%${Math.round(margin)}`, variant: "success", value: margin };
}

function stockRisk(product: Product): { label: string; variant: BadgeVariant } {
  if (product.minStockLevel <= 0) return { label: "Eşik yok", variant: "warning" };
  return { label: `Min ${product.minStockLevel}`, variant: "info" };
}

function qualityFlags(product: Product): string[] {
  const flags: string[] = [];
  if (!product.category) flags.push("Kategorisiz");
  if (product.salesPrice <= 0 || product.purchasePrice <= 0) flags.push("Fiyat eksik");
  if (product.minStockLevel <= 0) flags.push("Stok eşiği yok");
  if (marginPercent(product) < 10) flags.push("Düşük marj");
  if (!product.barcode) flags.push("Barkod yok");
  return flags;
}

function KpiCard({ label, value, detail, icon: Icon, tone = "neutral" }: { label: string; value: string; detail: string; icon: typeof PackageCheck; tone?: BadgeVariant }) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs text-slate-500">{label}</p>
          <p className="mt-1 text-xl font-semibold text-slate-100">{value}</p>
        </div>
        <div className={cn("rounded-lg border p-2", tone === "success" ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-300" : tone === "warning" ? "border-amber-500/20 bg-amber-500/10 text-amber-300" : tone === "danger" ? "border-red-500/20 bg-red-500/10 text-red-300" : "border-sky-500/20 bg-sky-500/10 text-sky-300")}>
          <Icon className="h-4 w-4" />
        </div>
      </div>
      <p className="mt-2 text-xs text-slate-500">{detail}</p>
    </div>
  );
}

export function ProductsListPage() {
  const router = useRouter();
  const planFeatures = usePlanFeatures();
  const { data: categories = [] } = useCategories();
  const categoryOptions = [{ value: "", label: "Tüm Kategoriler" }, ...categories.map((category) => ({ value: category.id, label: category.name }))];

  const getRowActions = (product: Product): RowAction[] => [
    { label: "Görüntüle", icon: <Eye className="h-4 w-4" />, onClick: () => router.push(`/dashboard/products/${product.id}`) },
    { label: "Düzenle", icon: <Edit className="h-4 w-4" />, onClick: () => router.push(`/dashboard/products/${product.id}/edit`) },
    { label: "Stok seviyeleri", icon: <Warehouse className="h-4 w-4" />, onClick: () => router.push(`/dashboard/stock/levels?productId=${product.id}`), separator: true },
    { label: "Stok hareketleri", icon: <PackageCheck className="h-4 w-4" />, onClick: () => router.push(`/dashboard/stock/movements?productId=${product.id}`) },
    { label: "Kodu kopyala", icon: <Copy className="h-4 w-4" />, onClick: () => navigator.clipboard.writeText(product.code), separator: true },
    { label: product.isActive ? "Pasifleştir" : "Aktifleştir", icon: <XCircle className="h-4 w-4" />, onClick: () => router.push(`/dashboard/products/${product.id}/edit`) },
  ];

  const columns = useMemo<ColumnDef<Product>[]>(() => [
    {
      key: "code",
      header: "Kod / Ad",
      exportValue: (product) => `${product.code} - ${product.name}`,
      render: (product) => (
        <div className="flex items-center gap-3">
          <EntityImage entityType="PRODUCT" entityId={product.id} fallback="package" className="h-10 w-10 shrink-0 rounded-lg" />
          <div className="min-w-0">
            <button type="button" className="truncate text-left font-medium text-sky-300 hover:text-sky-200" onClick={(event) => { event.stopPropagation(); router.push(`/dashboard/products/${product.id}`); }}>{product.name}</button>
            <p className="font-mono text-xs text-slate-500">{product.code}{product.barcode ? ` · ${product.barcode}` : ""}</p>
            <div className="mt-1 flex flex-wrap gap-1.5">{qualityFlags(product).slice(0, 2).map((flag) => <Badge key={flag} variant="warning">{flag}</Badge>)}</div>
          </div>
        </div>
      ),
    },
    { key: "category", header: "Kategori", width: "140px", exportValue: (product) => product.category?.name ?? "", render: (product) => <span className="text-sm text-slate-400">{product.category?.name ?? "Kategorisiz"}</span> },
    { key: "unit", header: "Birim", width: "80px", exportValue: (product) => product.unit?.code ?? "", render: (product) => <span className="text-sm text-slate-400">{product.unit?.code ?? "-"}</span> },
    { key: "stockRisk", header: "Stok Eşiği", width: "120px", exportValue: (product) => product.minStockLevel, render: (product) => { const risk = stockRisk(product); return <Badge variant={risk.variant}>{risk.label}</Badge>; } },
    { key: "margin", header: "Marj", width: "110px", align: "right", exportValue: (product) => Math.round(marginPercent(product)), render: (product) => { const meta = marginMeta(product); return <Badge variant={meta.variant}>{meta.label}</Badge>; } },
    { key: "salesPrice", header: "Satış Fiyatı", width: "125px", align: "right", exportValue: (product) => product.salesPrice, render: (product) => <span className="font-medium text-slate-200">{formatCurrency(product.salesPrice)}</span> },
    { key: "purchasePrice", header: "Alış Fiyatı", width: "125px", align: "right", exportValue: (product) => product.purchasePrice, render: (product) => <span className="text-slate-400">{formatCurrency(product.purchasePrice)}</span> },
    { key: "averageCost", header: "Ort. Maliyet", width: "125px", align: "right", exportValue: (product) => product.averageCost, render: (product) => <span className={product.averageCost > product.purchasePrice ? "text-amber-300" : "text-slate-400"}>{formatCurrency(product.averageCost)}</span> },
    { key: "taxRate", header: "KDV", width: "90px", align: "right", exportValue: (product) => product.taxRate?.rate, render: (product) => <span className="text-slate-400">{product.taxRate ? `%${product.taxRate.rate}` : "-"}</span> },
    { key: "isActive", header: "Durum", width: "90px", align: "center", exportValue: (product) => product.isActive ? "Aktif" : "Pasif", render: (product) => <ActiveBadge isActive={product.isActive} /> },
    { key: "actions", header: "", width: "72px", align: "right", hideable: false, render: (product) => <RowActions actions={getRowActions(product)} /> },
  ], [router]);

  const listState = useListStandardState<Product, ProductListFilters>({
    listKey: "products.list",
    columns,
    defaultFilters: { search: "", categoryId: "", activeFilter: "", qualityFilter: "", minMargin: "", maxMargin: "", density: "compact" },
    defaultPageSize: DEFAULT_PAGE_SIZE,
    defaultColumnKeys: PRODUCT_COLUMN_KEYS,
    parseFilters: (state) => ({
      search: getSavedViewFilterString(state, "search"),
      categoryId: getSavedViewFilterString(state, "categoryId"),
      activeFilter: parseActiveFilter(getSavedViewFilterString(state, "activeFilter")),
      qualityFilter: parseQualityFilter(getSavedViewFilterString(state, "qualityFilter")),
      minMargin: getSavedViewFilterString(state, "minMargin"),
      maxMargin: getSavedViewFilterString(state, "maxMargin"),
      density: getSavedViewFilterString(state, "density") === "comfortable" ? "comfortable" : "compact",
    }),
  });
  const { search, categoryId, activeFilter, qualityFilter, minMargin, maxMargin, density } = listState.filters;

  const derivedMinMargin = qualityFilter === "lowMargin" && !minMargin ? "-100" : minMargin;
  const derivedMaxMargin = qualityFilter === "lowMargin" && !maxMargin ? "10" : maxMargin;
  const { data, isLoading } = useProducts({
    page: listState.page,
    limit: listState.pageSize,
    search: search || undefined,
    categoryId: qualityFilter === "noCategory" ? undefined : categoryId || undefined,
    isActive: activeFilter ? activeFilter === "true" : undefined,
    noCategory: qualityFilter === "noCategory" ? "true" : undefined,
    missingPrice: qualityFilter === "missingPrice" ? "true" : undefined,
    missingMinStock: qualityFilter === "missingMinStock" ? "true" : undefined,
    minMargin: derivedMinMargin || undefined,
    maxMargin: derivedMaxMargin || undefined,
  });
  const { data: productUsage } = useProducts({ page: 1, limit: 1 });
  const products = data?.data ?? [];
  const productLimitStatus = getProductLimitStatus(productUsage?.meta.total ?? 0, planFeatures.maxProducts);
  const newProductHref = productLimitStatus.isLimitReached ? PRODUCT_LIMIT_UPGRADE_HREF : "/dashboard/products/new";
  const activeFilters = [
    search && `Arama: ${search}`,
    categoryId && `Kategori: ${categoryOptions.find((option) => option.value === categoryId)?.label ?? "Seçili"}`,
    activeFilter && `Durum: ${activeFilter === "true" ? "Aktif" : "Pasif"}`,
    qualityFilter && `Kalite: ${QUALITY_OPTIONS.find((option) => option.value === qualityFilter)?.label ?? "Seçili"}`,
    minMargin && `Min marj: %${minMargin}`,
    maxMargin && `Max marj: %${maxMargin}`,
  ].filter((item): item is string => Boolean(item));
  const kpis = {
    total: data?.meta.total ?? 0,
    active: products.filter((product) => product.isActive).length,
    passive: products.filter((product) => !product.isActive).length,
    noCategory: products.filter((product) => !product.category).length,
    stockThreshold: products.filter((product) => product.minStockLevel > 0).length,
    value: products.reduce((sum, product) => sum + product.averageCost, 0),
  };
  const riskCount = products.filter((product) => qualityFlags(product).length > 0).length;

  const patchFilters = (patch: Partial<ProductListFilters>) => {
    listState.patchFilters(patch);
  };

  const clearFilters = () => {
    patchFilters({ search: "", categoryId: "", activeFilter: "", qualityFilter: "", minMargin: "", maxMargin: "" });
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Ürünler"
        subtitle="Ürün kataloğunuzu, fiyat kalitesini ve stok eşiklerini yönetin."
        action={
          <Link href={newProductHref}>
            <Button leftIcon={<Plus className="h-4 w-4" />}>{productLimitStatus.isLimitReached ? "Limiti yükselt" : "Yeni ürün"}</Button>
          </Link>
        }
      />

      <ProductLimitNotice status={productLimitStatus} />

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
        <KpiCard label="Toplam" value={String(kpis.total)} detail="Filtre sonucu" icon={PackageCheck} />
        <KpiCard label="Aktif" value={String(kpis.active)} detail="Bu sayfadaki aktifler" icon={PackageCheck} tone="success" />
        <KpiCard label="Pasif" value={String(kpis.passive)} detail="Satışa kapalı" icon={XCircle} tone="warning" />
        <KpiCard label="Kategorisiz" value={String(kpis.noCategory)} detail="Katalog kalitesi" icon={AlertTriangle} tone={kpis.noCategory > 0 ? "warning" : "success"} />
        <KpiCard label="Stok eşiği" value={String(kpis.stockThreshold)} detail="Min stok tanımlı" icon={Warehouse} />
        <KpiCard label="Maliyet" value={formatCurrency(kpis.value)} detail="Sayfadaki ort. maliyet" icon={TrendingUp} />
      </div>

      {riskCount > 0 && (
        <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 p-4">
          <div className="flex gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-300" />
            <div>
              <p className="text-sm font-semibold text-amber-100">Ürün kalite kontrolü gerekiyor</p>
              <p className="mt-1 text-sm text-amber-100/80">{riskCount} üründe kategori, fiyat, stok eşiği, barkod veya marj uyarısı var.</p>
            </div>
          </div>
        </div>
      )}

      <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1.4fr)_200px_160px_170px_120px_120px]">
          <Input placeholder="Kod, ad, barkod ara..." value={search} onChange={(event) => patchFilters({ search: event.target.value })} prefixIcon={<Search className="h-4 w-4" />} />
          <Select options={categoryOptions} value={categoryId} onChange={(event) => patchFilters({ categoryId: event.target.value, qualityFilter: qualityFilter === "noCategory" ? "" : qualityFilter })} />
          <Select options={ACTIVE_OPTIONS} value={activeFilter} onChange={(event) => patchFilters({ activeFilter: parseActiveFilter(event.target.value) })} />
          <Select options={QUALITY_OPTIONS} value={qualityFilter} onChange={(event) => patchFilters({ qualityFilter: parseQualityFilter(event.target.value) })} />
          <Input type="number" placeholder="Min marj" value={minMargin} onChange={(event) => patchFilters({ minMargin: event.target.value })} />
          <Input type="number" placeholder="Max marj" value={maxMargin} onChange={(event) => patchFilters({ maxMargin: event.target.value })} />
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-2">
            {[
              { value: "", label: "Tümü" },
              { value: "true", label: "Aktif" },
              { value: "false", label: "Pasif" },
            ].map((option) => (
              <button key={option.label} type="button" onClick={() => patchFilters({ activeFilter: parseActiveFilter(option.value) })} className={cn("rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors", activeFilter === option.value ? "border-sky-500/40 bg-sky-500/15 text-sky-200" : "border-slate-800 bg-slate-950/40 text-slate-400 hover:text-slate-200")}>{option.label}</button>
            ))}
            {QUALITY_OPTIONS.filter((option) => option.value).map((option) => (
              <button key={option.value} type="button" onClick={() => patchFilters({ qualityFilter: option.value })} className={cn("rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors", qualityFilter === option.value ? "border-amber-500/40 bg-amber-500/15 text-amber-200" : "border-slate-800 bg-slate-950/40 text-slate-400 hover:text-slate-200")}>{option.label}</button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant={density === "compact" ? "secondary" : "ghost"} size="sm" onClick={() => patchFilters({ density: "compact" })}>Sıkı</Button>
            <Button variant={density === "comfortable" ? "secondary" : "ghost"} size="sm" onClick={() => patchFilters({ density: "comfortable" })}>Rahat</Button>
            <ListStandardControls
              module="products"
              listKey="products.list"
              currentState={listState.currentState}
              onApplyView={listState.applyView}
              columns={columns}
              visibleColumnKeys={listState.visibleColumnKeys}
              onVisibleColumnKeysChange={listState.setVisibleColumnKeys}
              pageSize={listState.pageSize}
              onPageSizeChange={listState.setPageSize}
              exportRows={products}
              exportFilename="urunler.csv"
              shareHref={listState.shareHref}
            />
          </div>
        </div>
        {activeFilters.length > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-800 pt-3">
            {activeFilters.map((filter) => <Badge key={filter} variant="neutral">{filter}</Badge>)}
            <Button variant="ghost" size="sm" leftIcon={<FilterX className="h-3.5 w-3.5" />} onClick={clearFilters}>Temizle</Button>
          </div>
        )}
      </div>

      <DataTable
        columns={listState.visibleColumns}
        data={products}
        keyExtractor={(product) => product.id}
        isLoading={isLoading}
        onRowClick={(product) => router.push(`/dashboard/products/${product.id}`)}
        emptyTitle="Ürün bulunamadı"
        emptyDescription="Filtreleri temizleyin, yeni ürün ekleyin veya CSV içe aktarım ile katalog oluşturun."
        pagination={data ? { page: listState.page, pageSize: listState.pageSize, total: data.meta.total, totalPages: data.meta.totalPages, onChange: listState.setPage } : undefined}
        density={density}
      />

      <StarterCsvImportWizard entity="products" />
    </div>
  );
}
