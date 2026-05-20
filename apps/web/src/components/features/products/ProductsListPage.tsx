"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";
import { DataTable, type ColumnDef } from "@/components/shared/DataTable";
import { EntityImage } from "@/components/shared/EntityImage";
import { SavedViewControls } from "@/components/shared/SavedViewControls";
import { SearchInput } from "@/components/shared/SearchInput";
import { ActiveBadge } from "@/components/shared/StatusBadge";
import { useProducts } from "@/hooks/useProducts";
import { useCategories } from "@/hooks/useMasterData";
import { formatCurrency } from "@/lib/utils";
import { Select } from "@/components/ui/Select";
import Link from "next/link";
import type { Product } from "@/services/product.service";
import { getSavedViewFilterString, type SavedViewState } from "@/services/saved-view.service";

type ActiveFilter = "" | "true" | "false";

const ACTIVE_OPTIONS = [
  { value: "", label: "Tüm Durumlar" },
  { value: "true", label: "Aktif" },
  { value: "false", label: "Pasif" },
];

function parseActiveFilter(value: string): ActiveFilter {
  if (value === "true" || value === "false") return value;
  return "";
}

export function ProductsListPage() {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [activeFilter, setActiveFilter] = useState<ActiveFilter>("");
  const [page, setPage] = useState(1);

  const { data, isLoading } = useProducts({
    page,
    limit: 20,
    search: search || undefined,
    categoryId: categoryId || undefined,
    isActive: activeFilter ? activeFilter === "true" : undefined,
  });
  const { data: categories = [] } = useCategories();
  const viewState = useMemo<SavedViewState>(() => ({
    filters: { search, categoryId, activeFilter },
    pageSize: 20,
  }), [activeFilter, categoryId, search]);

  const applyView = (state: SavedViewState) => {
    setSearch(getSavedViewFilterString(state, "search"));
    setCategoryId(getSavedViewFilterString(state, "categoryId"));
    setActiveFilter(parseActiveFilter(getSavedViewFilterString(state, "activeFilter")));
    setPage(1);
  };

  const categoryOptions = [
    { value: "", label: "Tüm Kategoriler" },
    ...categories.map((c) => ({ value: c.id, label: c.name })),
  ];

  const columns: ColumnDef<Product>[] = [
    {
      key: "code",
      header: "Kod / Ad",
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
  ];

  return (
    <div>
      <PageHeader
        title="Ürünler"
        subtitle="Ürün kataloğunuzu yönetin."
        action={
          <Link
            href="/dashboard/products/new"
            className="group relative inline-flex items-center gap-2.5 h-10 px-5 rounded-xl font-medium text-sm text-white
                       bg-gradient-to-r from-sky-500 to-sky-600 hover:from-sky-400 hover:to-sky-500
                       shadow-lg shadow-sky-500/20 hover:shadow-sky-500/30
                       transition-all duration-200 active:scale-[0.97]"
          >
            <span className="flex items-center justify-center w-5 h-5 rounded-md bg-white/15 group-hover:bg-white/20 transition-colors">
              <Plus className="w-3.5 h-3.5" />
            </span>
            Yeni Ürün
          </Link>
        }
      />

      <div className="flex flex-wrap gap-3 mb-4">
        <SearchInput
          value={search}
          onChange={(v) => {
            setSearch(v);
            setPage(1);
          }}
          placeholder="Kod, ad, barkod ara…"
          className="w-64"
        />
        <Select
          options={categoryOptions}
          value={categoryId}
          onChange={(e) => {
            setCategoryId(e.target.value);
            setPage(1);
          }}
          className="w-48"
        />
        <Select
          options={ACTIVE_OPTIONS}
          value={activeFilter}
          onChange={(e) => {
            setActiveFilter(parseActiveFilter(e.target.value));
            setPage(1);
          }}
          className="w-40"
        />
        <SavedViewControls module="products" listKey="products.list" currentState={viewState} onApply={applyView} />
      </div>

      <DataTable
        columns={columns}
        data={data?.data ?? []}
        keyExtractor={(r) => r.id}
        isLoading={isLoading}
        onRowClick={(r) => router.push(`/dashboard/products/${r.id}`)}
        emptyTitle="Ürün bulunamadı"
        emptyDescription="Yeni bir ürün ekleyerek başlayın."
        pagination={
          data
            ? {
                page,
                pageSize: 20,
                total: data.meta.total,
                totalPages: data.meta.totalPages,
                onChange: setPage,
              }
            : undefined
        }
      />
    </div>
  );
}
