"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowLeft,
  Barcode,
  Boxes,
  ClipboardList,
  FileClock,
  Image as ImageIcon,
  PackageCheck,
  Pencil,
  ReceiptText,
  ShoppingCart,
  Tags,
  Trash2,
  TrendingUp,
  Warehouse,
} from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";
import { EntityImage } from "@/components/shared/EntityImage";
import { EntityImageManager } from "@/components/shared/EntityImageManager";
import { DataTable, type ColumnDef } from "@/components/shared/DataTable";
import { ActiveBadge } from "@/components/shared/StatusBadge";
import { EntityActionPanel } from "@/components/shared/EntityActionPanel";
import { AttachmentPanel } from "@/components/shared/AttachmentPanel";
import { Badge, type BadgeVariant } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { FullPageSpinner } from "@/components/ui/Spinner";
import { useProduct, useDeleteProduct } from "@/hooks/useProducts";
import { useStockLevels } from "@/hooks/useStock";
import { cn, formatCurrency, formatDateTime, formatNumber } from "@/lib/utils";
import type { RecommendedEntityAction } from "@/components/shared/RecommendedActionsPanel";
import type { Product } from "@/services/product.service";
import type { StockLevel } from "@/services/stock.service";

interface Props {
  id: string;
}

interface SummaryMetricProps {
  label: string;
  value: string;
  hint?: string;
  icon: React.ReactNode;
  tone?: "default" | "success" | "warning" | "danger" | "info";
}

interface InfoRowProps {
  label: string;
  value: React.ReactNode;
  highlight?: boolean;
}

const TONE_CLASSES: Record<NonNullable<SummaryMetricProps["tone"]>, string> = {
  default: "border-slate-800 bg-slate-900 text-slate-300",
  success: "border-emerald-500/20 bg-emerald-500/10 text-emerald-300",
  warning: "border-amber-500/20 bg-amber-500/10 text-amber-300",
  danger: "border-red-500/20 bg-red-500/10 text-red-300",
  info: "border-sky-500/20 bg-sky-500/10 text-sky-300",
};

function addDays(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString();
}

function formatQuantity(value: number, unitCode?: string): string {
  const digits = Number.isInteger(value) ? 0 : 3;
  return `${formatNumber(value, digits)}${unitCode ? ` ${unitCode}` : ""}`;
}

function getMargin(product: Product): number | null {
  if (product.salesPrice <= 0) return null;
  return ((product.salesPrice - product.purchasePrice) / product.salesPrice) * 100;
}

function getMarginVariant(margin: number | null): BadgeVariant {
  if (margin === null) return "neutral";
  if (margin < 0) return "danger";
  if (margin < 15) return "warning";
  return "success";
}

function getStockTone(totalStock: number, minStock: number): {
  label: string;
  variant: BadgeVariant;
  tone: SummaryMetricProps["tone"];
} {
  if (minStock <= 0) return { label: "Minimum tanımsız", variant: "neutral", tone: "default" };
  if (totalStock <= 0) return { label: "Stok yok", variant: "danger", tone: "danger" };
  if (totalStock < minStock) return { label: "Minimum altında", variant: "warning", tone: "warning" };
  return { label: "Sağlıklı", variant: "success", tone: "success" };
}

function InfoRow({ label, value, highlight = false }: InfoRowProps) {
  const empty = value === null || value === undefined || value === "";
  return (
    <div className={cn("rounded-lg border px-3 py-2.5", highlight ? "border-sky-500/20 bg-sky-500/10" : "border-slate-800 bg-slate-950/35")}>
      <p className="text-[11px] font-medium text-slate-500">{label}</p>
      <div className="mt-1 text-sm font-medium text-slate-200">{empty ? <span className="text-slate-600">Eksik</span> : value}</div>
    </div>
  );
}

function SummaryMetric({ label, value, hint, icon, tone = "default" }: SummaryMetricProps) {
  return (
    <div className={cn("rounded-xl border p-4", TONE_CLASSES[tone])}>
      <div className="flex items-start gap-3">
        <div className="rounded-lg bg-slate-950/50 p-2">{icon}</div>
        <div className="min-w-0">
          <p className="text-[11px] font-medium uppercase text-slate-500">{label}</p>
          <p className="mt-1 truncate text-lg font-semibold text-slate-100">{value}</p>
          {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
        </div>
      </div>
    </div>
  );
}

function Card({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-slate-800 bg-slate-900 p-5">
      <div className="mb-4 flex items-center gap-2">
        <span className="rounded-lg bg-slate-950/70 p-2 text-slate-400">{icon}</span>
        <h2 className="text-sm font-semibold text-white">{title}</h2>
      </div>
      {children}
    </section>
  );
}

export function ProductDetailPage({ id }: Props) {
  const router = useRouter();
  const { data: product, isLoading } = useProduct(id);
  const deleteProduct = useDeleteProduct();
  const [deleteOpen, setDeleteOpen] = useState(false);

  const { data: stockLevels = [], isLoading: loadingStock } = useStockLevels({
    productId: id,
  });

  const stockSummary = useMemo(() => {
    if (!product) return null;
    const total = stockLevels.reduce((sum, item) => sum + Number(item.quantity), 0);
    const min = Number(product.minStockLevel);
    const gap = Math.max(0, min - total);
    const coverage = min > 0 ? Math.min(100, (total / min) * 100) : 0;
    const stockTone = getStockTone(total, min);
    return { total, min, gap, coverage, ...stockTone };
  }, [product, stockLevels]);

  const margin = product ? getMargin(product) : null;
  const marginVariant = getMarginVariant(margin);
  const profitPerUnit = product ? product.salesPrice - product.purchasePrice : 0;

  const qualityFlags = useMemo(() => {
    if (!product || !stockSummary) return [];
    const flags: Array<{ label: string; variant: BadgeVariant }> = [];
    if (!product.isActive) flags.push({ label: "Pasif ürün", variant: "neutral" });
    if (!product.category) flags.push({ label: "Kategori eksik", variant: "warning" });
    if (!product.barcode) flags.push({ label: "Barkod eksik", variant: "warning" });
    if (product.salesPrice <= 0 || product.purchasePrice <= 0) flags.push({ label: "Fiyat eksik", variant: "danger" });
    if (product.minStockLevel <= 0) flags.push({ label: "Min. stok eksik", variant: "warning" });
    if (stockSummary.gap > 0) flags.push({ label: "Stok açığı var", variant: stockSummary.total <= 0 ? "danger" : "warning" });
    if (margin !== null && margin < 15) flags.push({ label: "Düşük marj", variant: margin < 0 ? "danger" : "warning" });
    if (product.averageCost > product.purchasePrice && product.purchasePrice > 0) flags.push({ label: "Maliyet yükselmiş", variant: "info" });
    return flags;
  }, [margin, product, stockSummary]);

  if (isLoading) return <FullPageSpinner />;
  if (!product || !stockSummary) return <div className="text-sm text-slate-400">Ürün bulunamadı.</div>;

  const unitCode = product.unit?.code;
  const stockColumns: ColumnDef<StockLevel>[] = [
    {
      key: "warehouse",
      header: "Depo",
      render: (row) => (
        <div>
          <p className="font-medium text-slate-200">{row.warehouse?.name ?? "Depo bilgisi yok"}</p>
          <p className="text-xs text-slate-500">{row.warehouse?.code ?? row.warehouseId}</p>
        </div>
      ),
    },
    {
      key: "quantity",
      header: "Miktar",
      width: "140px",
      align: "right",
      render: (row) => {
        const quantity = Number(row.quantity);
        return <span className={cn("font-semibold tabular-nums", quantity < stockSummary.min ? "text-amber-300" : "text-slate-100")}>{formatQuantity(quantity, unitCode)}</span>;
      },
    },
    {
      key: "gap",
      header: "Min. farka göre",
      width: "150px",
      align: "right",
      render: (row) => {
        const diff = Number(row.quantity) - stockSummary.min;
        const isLow = stockSummary.min > 0 && diff < 0;
        return <span className={cn("text-xs font-medium tabular-nums", isLow ? "text-amber-300" : "text-emerald-300")}>{isLow ? "-" : "+"}{formatQuantity(Math.abs(diff), unitCode)}</span>;
      },
    },
    {
      key: "updatedAt",
      header: "Son güncelleme",
      width: "155px",
      render: (row) => <span className="text-xs text-slate-400">{formatDateTime(row.updatedAt)}</span>,
    },
    {
      key: "status",
      header: "Durum",
      width: "130px",
      render: (row) => {
        const quantity = Number(row.quantity);
        const low = stockSummary.min > 0 && quantity < stockSummary.min;
        return <Badge variant={low ? "warning" : "success"}>{low ? "Takip gerekli" : "Yeterli"}</Badge>;
      },
    },
  ];

  const recommendedActions: RecommendedEntityAction[] = stockSummary.gap > 0
    ? [{
        id: `product-${id}-purchase-followup`,
        kind: "task",
        title: "Satın alma taslağı hazırla",
        summary: `Mevcut stok ${formatQuantity(stockSummary.total, unitCode)}, minimum seviye ${formatQuantity(stockSummary.min, unitCode)}. Eksik miktar için satın alma akışı başlatılmalı.`,
        priority: stockSummary.total <= 0 ? "CRITICAL" : "HIGH",
        entityType: "PRODUCT",
        entityId: id,
        module: "purchasing",
        href: `/dashboard/purchase-orders/requests?productId=${id}`,
        steps: ["Öneriyi gör", "Görev taslağını incele", "Onayla", "Satın alma akışında takip et"],
        draft: {
          title: `${product.name} için satın alma taslağı`,
          detail: [
            `${product.code} - ${product.name} minimum stok seviyesinin altında.`,
            `Mevcut stok: ${formatQuantity(stockSummary.total, unitCode)}`,
            `Minimum stok: ${formatQuantity(stockSummary.min, unitCode)}`,
            `Önerilen tamamlanacak miktar: ${formatQuantity(Math.ceil(stockSummary.gap), unitCode)}`,
            `Tahmini birim alış fiyatı: ${formatCurrency(product.purchasePrice)}`,
          ].join("\n"),
          type: "CHECK",
          dueAt: addDays(1),
        },
      }]
    : [];

  return (
    <div className="space-y-6">
      <PageHeader
        title={product.name}
        subtitle={`${product.code} - ${product.category?.name ?? "Kategorisiz ürün"}`}
        action={
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="ghost" leftIcon={<ArrowLeft className="h-4 w-4" />} onClick={() => router.push("/dashboard/products")}>Listeye dön</Button>
            <Button variant="secondary" leftIcon={<FileClock className="h-4 w-4" />} onClick={() => router.push(`/dashboard/stock/movements?productId=${id}`)}>Hareketler</Button>
            <Button variant="secondary" leftIcon={<Warehouse className="h-4 w-4" />} onClick={() => router.push(`/dashboard/stock/levels?productId=${id}`)}>Stok seviyeleri</Button>
            <Button variant="secondary" leftIcon={<ShoppingCart className="h-4 w-4" />} onClick={() => router.push(`/dashboard/purchase-orders/requests?productId=${id}`)}>Talep oluştur</Button>
            <Button variant="secondary" leftIcon={<Pencil className="h-4 w-4" />} onClick={() => router.push(`/dashboard/products/${id}/edit`)}>Düzenle</Button>
            <Button variant="danger" leftIcon={<Trash2 className="h-4 w-4" />} onClick={() => setDeleteOpen(true)}>Sil</Button>
          </div>
        }
      />

      <section className="rounded-xl border border-slate-800 bg-slate-900 p-5">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center">
          <EntityImage entityType="PRODUCT" entityId={id} fallback="package" className="h-28 w-28 shrink-0 rounded-xl" />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <ActiveBadge isActive={product.isActive} />
              <Badge variant={stockSummary.variant}>{stockSummary.label}</Badge>
              <Badge variant={marginVariant}>{margin === null ? "Marj yok" : `%${formatNumber(margin, 1)} marj`}</Badge>
              <Badge variant={product.category ? "info" : "warning"}>{product.category?.name ?? "Kategori eksik"}</Badge>
            </div>
            <h1 className="mt-3 text-2xl font-semibold text-white">{product.name}</h1>
            <p className="mt-1 text-sm text-slate-400">{product.description || "Ürün açıklaması henüz girilmemiş."}</p>
          </div>
          <div className="grid min-w-[260px] grid-cols-2 gap-2 text-sm">
            <InfoRow label="Birim" value={product.unit ? `${product.unit.name} (${product.unit.code})` : null} />
            <InfoRow label="KDV" value={product.taxRate ? `${product.taxRate.name} (%${formatNumber(product.taxRate.rate, 0)})` : null} />
            <InfoRow label="Barkod" value={product.barcode} />
            <InfoRow label="Ort. maliyet" value={formatCurrency(product.averageCost)} />
          </div>
        </div>
      </section>

      {qualityFlags.length > 0 && (
        <section className="rounded-xl border border-amber-500/20 bg-amber-500/10 p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-300" />
              <div>
                <p className="text-sm font-semibold text-amber-100">Kontrol gerektiren alanlar</p>
                <p className="mt-1 text-xs text-amber-100/70">Ürün kartını tamamlamak liste, stok ve satın alma akışlarında daha net karar aldırır.</p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {qualityFlags.map((flag) => <Badge key={flag.label} variant={flag.variant}>{flag.label}</Badge>)}
            </div>
          </div>
        </section>
      )}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <SummaryMetric label="Toplam stok" value={formatQuantity(stockSummary.total, unitCode)} hint={`Minimum: ${formatQuantity(stockSummary.min, unitCode)}`} icon={<Boxes className="h-4 w-4" />} tone={stockSummary.tone} />
        <SummaryMetric label="Eksik miktar" value={formatQuantity(stockSummary.gap, unitCode)} hint={stockSummary.gap > 0 ? "Satın alma önerisi hazır" : "Tamamlama gerekmiyor"} icon={<PackageCheck className="h-4 w-4" />} tone={stockSummary.gap > 0 ? "warning" : "success"} />
        <SummaryMetric label="Birim kar" value={formatCurrency(profitPerUnit)} hint={margin === null ? "Satış fiyatı yok" : `%${formatNumber(margin, 1)} brüt marj`} icon={<TrendingUp className="h-4 w-4" />} tone={profitPerUnit < 0 ? "danger" : profitPerUnit === 0 ? "warning" : "success"} />
        <SummaryMetric label="Satış fiyatı" value={formatCurrency(product.salesPrice)} hint={`Alış: ${formatCurrency(product.purchasePrice)}`} icon={<ReceiptText className="h-4 w-4" />} tone="info" />
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <main className="space-y-6">
          <div className="grid gap-6 lg:grid-cols-2">
            <Card title="Katalog Bilgisi" icon={<Tags className="h-4 w-4" />}>
              <div className="grid gap-3 sm:grid-cols-2">
                <InfoRow label="Ürün kodu" value={product.code} highlight />
                <InfoRow label="Kategori" value={product.category?.name} />
                <InfoRow label="Birim" value={product.unit ? `${product.unit.name} (${product.unit.code})` : null} />
                <InfoRow label="KDV oranı" value={product.taxRate ? `%${formatNumber(product.taxRate.rate, 0)}` : null} />
                <InfoRow label="Barkod" value={product.barcode} />
                <InfoRow label="Durum" value={<ActiveBadge isActive={product.isActive} />} />
              </div>
            </Card>

            <Card title="Fiyat ve Maliyet" icon={<ReceiptText className="h-4 w-4" />}>
              <div className="grid gap-3 sm:grid-cols-2">
                <InfoRow label="Alış fiyatı" value={formatCurrency(product.purchasePrice)} />
                <InfoRow label="Satış fiyatı" value={formatCurrency(product.salesPrice)} highlight />
                <InfoRow label="Ortalama maliyet" value={formatCurrency(product.averageCost)} />
                <InfoRow label="Birim kar" value={formatCurrency(profitPerUnit)} />
              </div>
            </Card>
          </div>

          <Card title="Stok Seviyeleri" icon={<Warehouse className="h-4 w-4" />}>
            <div className="mb-4 grid gap-3 sm:grid-cols-3">
              <InfoRow label="Toplam stok" value={formatQuantity(stockSummary.total, unitCode)} highlight />
              <InfoRow label="Minimum stok" value={formatQuantity(stockSummary.min, unitCode)} />
              <InfoRow label="Eksik miktar" value={formatQuantity(stockSummary.gap, unitCode)} />
            </div>
            <DataTable
              columns={stockColumns}
              data={stockLevels}
              keyExtractor={(row) => row.id}
              isLoading={loadingStock}
              emptyTitle="Stok kaydı yok"
              emptyDescription="Bu ürün için depo bazlı stok seviyesi henüz oluşmamış."
              density="compact"
            />
          </Card>

          <Card title="Ürün Görseli" icon={<ImageIcon className="h-4 w-4" />}>
            <EntityImageManager
              entityType="PRODUCT"
              entityId={id}
              label="Ürün görseli"
              description="Katalog, satış ve stok ekranlarında kullanılacak ürün görselini yükleyin."
            />
          </Card>

          <AttachmentPanel entityType="PRODUCT" entityId={id} />
        </main>

        <aside className="space-y-6">
          <Card title="Stok Sağlığı" icon={<PackageCheck className="h-4 w-4" />}>
            <div className="space-y-3">
              <div className="h-2 overflow-hidden rounded-full bg-slate-950">
                <div className={cn("h-full rounded-full", stockSummary.gap > 0 ? "bg-amber-400" : "bg-emerald-400")} style={{ width: `${stockSummary.coverage}%` }} />
              </div>
              <div className="flex items-center justify-between text-xs text-slate-500">
                <span>{formatQuantity(stockSummary.total, unitCode)}</span>
                <span>{formatQuantity(stockSummary.min, unitCode)}</span>
              </div>
              <Badge variant={stockSummary.variant}>{stockSummary.label}</Badge>
            </div>
          </Card>

          <Card title="Marj Kontrolü" icon={<TrendingUp className="h-4 w-4" />}>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-500">Brüt marj</span>
                <Badge variant={marginVariant}>{margin === null ? "Hesaplanamadı" : `%${formatNumber(margin, 1)}`}</Badge>
              </div>
              <InfoRow label="Satış - alış farkı" value={formatCurrency(profitPerUnit)} highlight={profitPerUnit > 0} />
              <InfoRow label="Ortalama maliyet farkı" value={formatCurrency(product.salesPrice - product.averageCost)} />
            </div>
          </Card>

          <Card title="Kart Kalitesi" icon={<ClipboardList className="h-4 w-4" />}>
            <div className="flex flex-wrap gap-2">
              {qualityFlags.length === 0 ? <Badge variant="success">Kart tamam</Badge> : qualityFlags.map((flag) => <Badge key={flag.label} variant={flag.variant}>{flag.label}</Badge>)}
            </div>
          </Card>

          <Card title="Hızlı Geçişler" icon={<Barcode className="h-4 w-4" />}>
            <div className="grid gap-2">
              <Button variant="outline" leftIcon={<Warehouse className="h-4 w-4" />} onClick={() => router.push(`/dashboard/stock/levels?productId=${id}`)}>Depo stoklarını aç</Button>
              <Button variant="outline" leftIcon={<FileClock className="h-4 w-4" />} onClick={() => router.push(`/dashboard/stock/movements?productId=${id}`)}>Stok hareketlerini aç</Button>
              <Button variant="outline" leftIcon={<ShoppingCart className="h-4 w-4" />} onClick={() => router.push(`/dashboard/purchase-orders/requests?productId=${id}`)}>Satın alma talebi aç</Button>
            </div>
          </Card>

          <EntityActionPanel
            entityType="PRODUCT"
            entityId={id}
            displayName={product.name}
            module="inventory"
            availableActions={["task", "note", "activity"]}
            recommendedActions={recommendedActions}
          />
        </aside>
      </div>

      <ConfirmDialog
        isOpen={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        onConfirm={() =>
          deleteProduct.mutate(id, {
            onSuccess: () => router.push("/dashboard/products"),
          })
        }
        title="Ürünü sil"
        confirmLabel="Sil"
        message={
          <div className="space-y-2">
            <p><strong>{product.name}</strong> ürününü silmek üzeresiniz.</p>
            <p>Bu işlem stok, teklif, sipariş veya fatura geçmişinde kullanılan kayıtlarla ilişkili olabilir. Aktif kullanımdaki ürünlerde silmek yerine pasifleştirme daha güvenli olabilir.</p>
          </div>
        }
        isLoading={deleteProduct.isPending}
      />
    </div>
  );
}
