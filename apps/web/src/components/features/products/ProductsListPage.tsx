"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";
import { DataTable, type ColumnDef } from "@/components/shared/DataTable";
import { EntityImage } from "@/components/shared/EntityImage";
import { ListStandardControls } from "@/components/shared/ListStandardControls";
import { SearchInput } from "@/components/shared/SearchInput";
import { ActiveBadge } from "@/components/shared/StatusBadge";
import { useProducts } from "@/hooks/useProducts";
import { useCategories } from "@/hooks/useMasterData";
import { usePlanFeatures } from "@/hooks/usePlanFeatures";
import { useListStandardState, type ListFilterState } from "@/hooks/useListStandardState";
import { formatCurrency } from "@/lib/utils";
import { Select } from "@/components/ui/Select";
import Link from "next/link";
import type { Product } from "@/services/product.service";
import { getSavedViewFilterString } from "@/services/saved-view.service";
import { StarterCsvImportWizard } from "@/components/shared/StarterCsvImportWizard";
import { ProductLimitNotice } from "./ProductLimitNotice";
import { getProductLimitStatus, PRODUCT_LIMIT_UPGRADE_HREF } from "./product-limit";

type ActiveFilter = "" | "true" | "false";
interface ProductListFilters extends ListFilterState {
  search: string;
  categoryId: string;
  activeFilter: ActiveFilter;
}

const ACTIVE_OPTIONS = [
  { value: "", label: "Tüm Durumlar" },
  { value: "true", label: "Aktif" },
  { value: "false", label: "Pasif" },
];

const DEFAULT_PAGE_SIZE = 20;
const PRODUCT_COLUMN_KEYS = ["code", "category", "unit", "salesPrice", "purchasePrice", "isActive"] as const;

function parseActiveFilter(value: string): ActiveFilter {
  if (value === "true" || value === "false") return value;
  return "";
}

export function ProductsListPage() {
  const router = useRouter();
  const planFeatures = usePlanFeatures();
  const { data: categories = [] } = useCategories();
  const categoryOptions = [
    { value: "", label: "Tüm Kategoriler" },
    ...categories.map((c) => ({ value: c.id, label: c.name })),
  ];

  const columns = useMemo<ColumnDef<Product>[]>(() => [
    {
      key: "code",
      header: "Kod / Ad",
      exportValue: (r) => `${r.code} - ${r.name}`,
      render: (r) => (
        <div className="flex items-center gap-3">
          <EntityImage entityType="PRODUCT" entityId={r.id} fallback="package" className="w-10 h-10 rounded-lg shrink-0" />
          <div className="min-w-0">
            <p className="font-medium text-slate-200 truncate">{r.name}</p>
            <p className="text-xs text-slate-500 font-mono">{r.code}</p>
          </div>
        </div>
      ),
    },
    {
      key: "category",
      header: "Kategori",
      width: "140px",
      exportValue: (r) => r.category?.name ?? "",
      render: (r) => (
        <span className="text-sm text-slate-400">
          {r.category?.name ?? "—"}
        </span>
      ),
    },
    {
      key: "unit",
      header: "Birim",
      width: "80px",
      exportValue: (r) => r.unit?.code ?? "",
      render: (r) => (
        <span className="text-sm text-slate-400">{r.unit?.code ?? "—"}</span>
      ),
    },
    {
      key: "salesPrice",
      header: "Satış Fiyatı",
      width: "120px",
      align: "right",
      render: (r) => (
        <span className="font-medium text-slate-200">
          {formatCurrency(r.salesPrice)}
        </span>
      ),
    },
    {
      key: "purchasePrice",
      header: "Alış Fiyatı",
      width: "120px",
      align: "right",
      render: (r) => (
        <span className="text-slate-400">
          {formatCurrency(r.purchasePrice)}
        </span>
      ),
    },
    {
      key: "isActive",
      header: "Durum",
      width: "80px",
      align: "center",
      render: (r) => <ActiveBadge isActive={r.isActive} />,
    },
  ], []);

  const listState = useListStandardState<Product, ProductListFilters>({
    listKey: "products.list",
    columns,
    defaultFilters: { search: "", categoryId: "", activeFilter: "" },
    defaultPageSize: DEFAULT_PAGE_SIZE,
    defaultColumnKeys: PRODUCT_COLUMN_KEYS,
    parseFilters: (state) => ({
      search: getSavedViewFilterString(state, "search"),
      categoryId: getSavedViewFilterString(state, "categoryId"),
      activeFilter: parseActiveFilter(getSavedViewFilterString(state, "activeFilter")),
    }),
  });
  const { search, categoryId, activeFilter } = listState.filters;

  const { data, isLoading } = useProducts({
    page: listState.page,
    limit: listState.pageSize,
    search: search || undefined,
    categoryId: categoryId || undefined,
    isActive: activeFilter ? activeFilter === "true" : undefined,
  });
  const { data: productUsage } = useProducts({ page: 1, limit: 1 });
  const productLimitStatus = getProductLimitStatus(
    productUsage?.meta.total ?? 0,
    planFeatures.maxProducts,
  );
  const newProductHref = productLimitStatus.isLimitReached
    ? PRODUCT_LIMIT_UPGRADE_HREF
    : "/dashboard/products/new";

  return (
    <div>
      <PageHeader
        title="Ürünler"
        subtitle="Ürün kataloğunuzu yönetin."
        action={
          <Link
            href={newProductHref}
            className="group relative inline-flex items-center gap-2.5 h-10 px-5 rounded-xl font-medium text-sm text-white
                       bg-gradient-to-r from-sky-500 to-sky-600 hover:from-sky-400 hover:to-sky-500
                       shadow-lg shadow-sky-500/20 hover:shadow-sky-500/30
                       transition-all duration-200 active:scale-[0.97]"
          >
            <span className="flex items-center justify-center w-5 h-5 rounded-md bg-white/15 group-hover:bg-white/20 transition-colors">
              <Plus className="w-3.5 h-3.5" />
            </span>
            {productLimitStatus.isLimitReached ? "Limiti Yukselt" : "Yeni Ürün"}
          </Link>
        }
      />

      <ProductLimitNotice status={productLimitStatus} />

      <StarterCsvImportWizard entity="products" />

      <div className="flex flex-wrap gap-3 mb-4">
        <SearchInput
          value={search}
          onChange={(v) => {
            listState.patchFilters({ search: v });
          }}
          placeholder="Kod, ad, barkod ara…"
          className="w-64"
        />
        <Select
          options={categoryOptions}
          value={categoryId}
          onChange={(e) => {
            listState.patchFilters({ categoryId: e.target.value });
          }}
          className="w-48"
        />
        <Select
          options={ACTIVE_OPTIONS}
          value={activeFilter}
          onChange={(e) => {
            listState.patchFilters({ activeFilter: parseActiveFilter(e.target.value) });
          }}
          className="w-40"
        />
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
          exportRows={data?.data ?? []}
          exportFilename="urunler.csv"
          shareHref={listState.shareHref}
        />
      </div>

      <DataTable
        columns={listState.visibleColumns}
        data={data?.data ?? []}
        keyExtractor={(r) => r.id}
        isLoading={isLoading}
        onRowClick={(r) => router.push(`/dashboard/products/${r.id}`)}
        emptyTitle="Ürün bulunamadı"
        emptyDescription="Yeni bir ürün ekleyerek başlayın."
        pagination={
          data
            ? {
                page: listState.page,
                pageSize: listState.pageSize,
                total: data.meta.total,
                totalPages: data.meta.totalPages,
                onChange: listState.setPage,
              }
            : undefined
        }
      />
    </div>
  );
}
