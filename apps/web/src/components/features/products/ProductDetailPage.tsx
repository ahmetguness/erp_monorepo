"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Trash2 } from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";
import { EntityImage } from "@/components/shared/EntityImage";
import { DataTable, type ColumnDef } from "@/components/shared/DataTable";
import { ActiveBadge } from "@/components/shared/StatusBadge";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { FullPageSpinner } from "@/components/ui/Spinner";
import { useProduct, useDeleteProduct } from "@/hooks/useProducts";
import { useStockLevels } from "@/hooks/useStock";
import { formatCurrency } from "@/lib/utils";
import { EntityActionPanel } from "@/components/shared/EntityActionPanel";
import type { StockLevel } from "@/services/stock.service";

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  if (value === null || value === undefined || value === "") return null;
  return (
    <div className="flex gap-3">
      <span className="text-xs text-slate-500 w-28 shrink-0 pt-0.5">
        {label}
      </span>
      <span className="text-sm text-slate-300">{value}</span>
    </div>
  );
}

interface Props {
  id: string;
}

export function ProductDetailPage({ id }: Props) {
  const router = useRouter();
  const { data: product, isLoading } = useProduct(id);
  const deleteProduct = useDeleteProduct();
  const [deleteOpen, setDeleteOpen] = useState(false);

  const { data: stockLevels = [], isLoading: loadingStock } = useStockLevels({
    productId: id,
  });

  const stockColumns: ColumnDef<StockLevel>[] = [
    {
      key: "warehouse",
      header: "Depo",
      render: (r) => (
        <span className="text-slate-200">{r.warehouse?.name ?? "—"}</span>
      ),
    },
    {
      key: "quantity",
      header: "Miktar",
      width: "120px",
      align: "right",
      render: (r) => {
        const isCritical =
          r.product && Number(r.quantity) < Number(r.product.minStockLevel);
        return (
          <span
            className={
              isCritical
                ? "text-red-400 font-semibold"
                : "text-slate-200 font-medium"
            }
          >
            {(() => {
              const v = Number(r.quantity);
              return Number.isInteger(v) ? v : v.toFixed(3);
            })()}
          </span>
        );
      },
    },
  ];

  if (isLoading) return <FullPageSpinner />;
  if (!product)
    return <div className="text-slate-400 text-sm">Ürün bulunamadı.</div>;

  return (
    <div className="space-y-6">
      <PageHeader
        title={product.name}
        subtitle={product.code}
        action={
          <div className="flex gap-2">
            <Button
              variant="secondary"
              leftIcon={<Pencil className="w-4 h-4" />}
              onClick={() => router.push(`/dashboard/products/${id}/edit`)}
            >
              Düzenle
            </Button>
            <Button
              variant="danger"
              leftIcon={<Trash2 className="w-4 h-4" />}
              onClick={() => setDeleteOpen(true)}
            >
              Sil
            </Button>
          </div>
        }
      />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <main className="space-y-6">
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-3">
        <div className="flex items-start gap-5 mb-4">
          <EntityImage entityType="PRODUCT" entityId={id} fallback="package" className="w-24 h-24 rounded-xl shrink-0" />
          <div className="pt-1">
            <ActiveBadge isActive={product.isActive} />
          </div>
        </div>
        <InfoRow label="Kategori" value={product.category?.name} />
        <InfoRow
          label="Birim"
          value={
            product.unit ? `${product.unit.name} (${product.unit.code})` : null
          }
        />
        <InfoRow
          label="KDV Oranı"
          value={
            product.taxRate
              ? `${product.taxRate.name} (%${product.taxRate.rate})`
              : null
          }
        />
        <InfoRow label="Barkod" value={product.barcode} />
        <InfoRow
          label="Alış Fiyatı"
          value={formatCurrency(product.purchasePrice)}
        />
        <InfoRow
          label="Satış Fiyatı"
          value={formatCurrency(product.salesPrice)}
        />
        <InfoRow
          label="Ort. Maliyet"
          value={formatCurrency(product.averageCost)}
        />
        <InfoRow label="Min. Stok" value={product.minStockLevel} />
        {product.description && (
          <InfoRow label="Açıklama" value={product.description} />
        )}
      </div>

      <div>
        <h2 className="text-sm font-semibold text-white mb-3">
          Stok Seviyeleri
        </h2>
        <DataTable
          columns={stockColumns}
          data={stockLevels}
          keyExtractor={(r) => r.id}
          isLoading={loadingStock}
          emptyTitle="Stok kaydı yok"
        />
      </div>

        </main>

      <EntityActionPanel
        entityType="PRODUCT"
        entityId={id}
        displayName={product.name}
        module="inventory"
        availableActions={["task", "attachment", "note", "activity"]}
      />
      </div>

      <ConfirmDialog
        isOpen={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        onConfirm={() =>
          deleteProduct.mutate(id, {
            onSuccess: () => router.push("/dashboard/products"),
          })
        }
        message={`"${product.name}" ürününü silmek istediğinize emin misiniz?`}
        isLoading={deleteProduct.isPending}
      />
    </div>
  );
}
