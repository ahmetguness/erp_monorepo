"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowRight,
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
import { EntityImage } from "@/components/shared/EntityImage";
import { EntityImageManager } from "@/components/shared/EntityImageManager";
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

type Tone = "default" | "success" | "warning" | "danger" | "info";

const TONE_TEXT: Record<Tone, string> = {
  default: "text-slate-100",
  success: "text-emerald-300",
  warning: "text-amber-300",
  danger: "text-red-300",
  info: "text-sky-300",
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

function getStockState(totalStock: number, minStock: number): {
  label: string;
  variant: BadgeVariant;
  tone: Tone;
} {
  if (minStock <= 0) return { label: "Minimum tanımsız", variant: "neutral", tone: "default" };
  if (totalStock <= 0) return { label: "Stokta yok", variant: "danger", tone: "danger" };
  if (totalStock < minStock) return { label: "Kritik stok", variant: "danger", tone: "danger" };
  if (totalStock <= minStock * 1.2) return { label: "Düşük stok", variant: "warning", tone: "warning" };
  return { label: "Sağlıklı", variant: "success", tone: "success" };
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  const empty = value === null || value === undefined || value === "";
  return (
    <div className="grid grid-cols-[120px_minmax(0,1fr)] gap-3 border-b border-slate-800/65 py-2.5 last:border-b-0">
      <p className="text-xs text-slate-500">{label}</p>
      <div className="min-w-0 text-sm font-medium text-slate-200">{empty ? <span className="text-slate-600">Eksik</span> : value}</div>
    </div>
  );
}

function Section({ title, description, icon, action, children }: { title: string; description?: string; icon: React.ReactNode; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="overflow-hidden rounded-xl border border-slate-800/80 bg-slate-950/35">
      <div className="flex items-start justify-between gap-3 border-b border-slate-800/70 px-4 py-3">
        <div className="flex items-start gap-2">
          <span className="mt-0.5 text-slate-500">{icon}</span>
          <div>
            <h2 className="text-sm font-semibold text-white">{title}</h2>
            {description && <p className="mt-0.5 text-xs text-slate-500">{description}</p>}
          </div>
        </div>
        {action}
      </div>
      <div className="p-4">{children}</div>
    </section>
  );
}

function StockRow({ row, min, unitCode, onOpen }: { row: StockLevel; min: number; unitCode?: string; onOpen: () => void }) {
  const quantity = Number(row.quantity);
  const diff = quantity - min;
  const ratio = min > 0 ? Math.min(1, Math.max(0, quantity / min)) : 1;
  const isOut = quantity <= 0;
  const isCritical = min > 0 && quantity < min;
  const isLow = min > 0 && quantity >= min && quantity <= min * 1.2;
  const tone = isOut || isCritical ? "danger" : isLow ? "warning" : "success";

  return (
    <tr
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(event) => { if (event.key === "Enter") onOpen(); }}
      className="group cursor-pointer border-b border-slate-800/45 transition-colors duration-150 last:border-b-0 hover:bg-sky-500/[0.04] focus-visible:bg-sky-500/[0.06] focus-visible:outline-none"
    >
      <td className="px-4 py-3.5">
        <p className="font-medium text-slate-100">{row.warehouse?.name ?? "Depo bilgisi yok"}</p>
        <p className="font-mono text-xs text-slate-500">{row.warehouse?.code ?? row.warehouseId}</p>
      </td>
      <td className="px-4 py-3.5 text-right">
        <p className={cn("font-semibold tabular-nums", TONE_TEXT[tone])}>{formatQuantity(quantity, unitCode)}</p>
        <div className="ml-auto mt-1 h-1 w-14 overflow-hidden rounded-full bg-slate-800">
          <div className={cn("h-full rounded-full", tone === "danger" ? "bg-red-400" : tone === "warning" ? "bg-amber-400" : "bg-emerald-400")} style={{ width: `${ratio * 100}%` }} />
        </div>
      </td>
      <td className="px-4 py-3.5 text-right tabular-nums text-slate-500">{formatQuantity(min, unitCode)}</td>
      <td className={cn("px-4 py-3.5 text-right font-semibold tabular-nums", diff < 0 ? "text-red-300" : "text-emerald-300")}>
        {diff > 0 ? "+" : ""}{formatQuantity(diff, unitCode)}
      </td>
      <td className="px-4 py-3.5 text-slate-400">{formatDateTime(row.updatedAt)}</td>
      <td className="px-4 py-3.5 text-center">
        <Badge variant={isOut || isCritical ? "danger" : isLow ? "warning" : "success"}>{isOut ? "Stokta yok" : isCritical ? "Kritik" : isLow ? "Düşük" : "Normal"}</Badge>
      </td>
      <td className="w-10 px-4 py-3.5 text-right"><ArrowRight className="h-4 w-4 text-slate-600 opacity-0 transition-all duration-150 group-hover:translate-x-0.5 group-hover:opacity-100" /></td>
    </tr>
  );
}

export function ProductDetailPage({ id }: Props) {
  const router = useRouter();
  const { data: product, isLoading } = useProduct(id);
  const deleteProduct = useDeleteProduct();
  const [deleteOpen, setDeleteOpen] = useState(false);

  const { data: stockLevels = [], isLoading: loadingStock } = useStockLevels({ productId: id });

  const stockSummary = useMemo(() => {
    if (!product) return null;
    const total = stockLevels.reduce((sum, item) => sum + Number(item.quantity), 0);
    const min = Number(product.minStockLevel);
    const gap = Math.max(0, min - total);
    const coverage = min > 0 ? Math.min(100, (total / min) * 100) : 0;
    return { total, min, gap, coverage, ...getStockState(total, min) };
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
  const purchaseDraft: RecommendedEntityAction[] = stockSummary.gap > 0
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
    <div className="space-y-5">
      <div className="flex items-center gap-2 text-xs text-slate-500">
        <Link href="/dashboard/products" className="transition-colors duration-150 hover:text-sky-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/40">Ürünler</Link>
        <span>/</span>
        <span className="truncate text-slate-300">{product.name}</span>
      </div>

      <div className="flex flex-col gap-4 border-b border-slate-800/80 pb-5 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex min-w-0 gap-4">
          <EntityImage entityType="PRODUCT" entityId={id} fallback="package" className="h-20 w-20 shrink-0 rounded-xl border border-slate-800" />
          <div className="min-w-0">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <ActiveBadge isActive={product.isActive} />
              <Badge variant={stockSummary.variant}>{stockSummary.label}</Badge>
              <Badge variant={marginVariant}>{margin === null ? "Marj yok" : `%${formatNumber(margin, 1)} marj`}</Badge>
              <Badge variant={product.category ? "info" : "warning"}>{product.category?.name ?? "Kategori eksik"}</Badge>
            </div>
            <h1 className="truncate text-xl font-semibold tracking-tight text-white">{product.name}</h1>
            <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-500">
              <span className="font-mono">{product.code}</span>
              {product.barcode && <span className="flex items-center gap-1.5"><Barcode className="h-3.5 w-3.5" />{product.barcode}</span>}
              <span>{product.unit ? `${product.unit.name} (${product.unit.code})` : "Birim eksik"}</span>
            </div>
            {product.description && <p className="mt-2 max-w-3xl text-sm text-slate-400">{product.description}</p>}
          </div>
        </div>
        <div className="flex flex-wrap gap-2 xl:justify-end">
          <Button variant="secondary" leftIcon={<FileClock className="h-4 w-4" />} onClick={() => router.push(`/dashboard/stock/movements?productId=${id}`)}>Hareketler</Button>
          <Button variant="secondary" leftIcon={<Warehouse className="h-4 w-4" />} onClick={() => router.push(`/dashboard/stock/levels?productId=${id}`)}>Stok</Button>
          <Button variant="secondary" leftIcon={<ShoppingCart className="h-4 w-4" />} onClick={() => router.push(`/dashboard/purchase-orders/requests?productId=${id}`)}>Talep</Button>
          <Button variant="secondary" leftIcon={<Pencil className="h-4 w-4" />} onClick={() => router.push(`/dashboard/products/${id}/edit`)}>Düzenle</Button>
          <Button variant="danger" leftIcon={<Trash2 className="h-4 w-4" />} onClick={() => setDeleteOpen(true)}>Sil</Button>
        </div>
      </div>

      <div className="grid rounded-xl border border-slate-800/80 bg-slate-950/35 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: "Toplam Stok", value: formatQuantity(stockSummary.total, unitCode), hint: `Min. ${formatQuantity(stockSummary.min, unitCode)}`, tone: stockSummary.tone },
          { label: "Eksik Miktar", value: formatQuantity(stockSummary.gap, unitCode), hint: stockSummary.gap > 0 ? "Tamamlama gerekli" : "Tamamlama gerekmiyor", tone: stockSummary.gap > 0 ? "warning" : "success" },
          { label: "Birim Kar", value: formatCurrency(profitPerUnit), hint: margin === null ? "Satış fiyatı yok" : `%${formatNumber(margin, 1)} brüt marj`, tone: profitPerUnit < 0 ? "danger" : profitPerUnit === 0 ? "warning" : "success" },
          { label: "Satış Fiyatı", value: formatCurrency(product.salesPrice), hint: `Alış ${formatCurrency(product.purchasePrice)}`, tone: "info" },
        ].map((metric) => (
          <div key={metric.label} className="border-b border-slate-800/70 px-4 py-3 last:border-b-0 sm:border-b-0 sm:border-r sm:last:border-r-0">
            <p className={cn("text-base font-semibold tabular-nums", TONE_TEXT[metric.tone as Tone])}>{metric.value}</p>
            <p className="mt-0.5 text-[11px] font-medium uppercase text-slate-500">{metric.label}</p>
            <p className="mt-1 text-xs text-slate-500">{metric.hint}</p>
          </div>
        ))}
      </div>

      {qualityFlags.length > 0 && (
        <div className="rounded-xl border border-slate-800/80 bg-slate-950/35 px-4 py-3">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" />
              <div>
                <p className="text-sm font-semibold text-white">Kontrol gerektiren alanlar</p>
                <p className="mt-0.5 text-xs text-slate-500">Ürün kartındaki eksikler stok, satış ve satın alma kararlarını etkileyebilir.</p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {qualityFlags.map((flag) => <Badge key={flag.label} variant={flag.variant}>{flag.label}</Badge>)}
            </div>
          </div>
        </div>
      )}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <main className="space-y-5">
          <Section title="Stok Seviyeleri" description="Depo bazında güncel miktar ve minimum stok karşılaştırması." icon={<Warehouse className="h-4 w-4" />} action={<Button size="sm" variant="outline" onClick={() => router.push(`/dashboard/stock/levels?productId=${id}`)}>Tümünü Aç</Button>}>
            <div className="mb-4">
              <div className="h-2 overflow-hidden rounded-full bg-slate-900">
                <div className={cn("h-full rounded-full", stockSummary.gap > 0 ? "bg-amber-400" : "bg-emerald-400")} style={{ width: `${stockSummary.coverage}%` }} />
              </div>
              <div className="mt-1 flex justify-between text-xs text-slate-500">
                <span>{formatQuantity(stockSummary.total, unitCode)}</span>
                <span>Min. {formatQuantity(stockSummary.min, unitCode)}</span>
              </div>
            </div>
            <div className="overflow-hidden rounded-xl border border-slate-800/80 bg-slate-950/40">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[820px] text-sm">
                  <thead className="bg-slate-900/95">
                    <tr className="border-b border-slate-800/80">
                      {["Depo", "Mevcut", "Min. Stok", "Fark", "Son Güncelleme", "Durum", ""].map((header, index) => (
                        <th key={header || index} className={cn("px-4 py-3 text-left text-[11px] font-semibold uppercase text-slate-500", [1, 2, 3].includes(index) && "text-right", index === 5 && "text-center")}>{header}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {loadingStock ? (
                      Array.from({ length: 4 }).map((_, row) => (
                        <tr key={row} className="border-b border-slate-800/45 last:border-0">
                          {Array.from({ length: 7 }).map((__, col) => <td key={col} className="px-4 py-3.5"><div className="h-3.5 w-2/3 animate-pulse rounded bg-slate-800/75" /></td>)}
                        </tr>
                      ))
                    ) : stockLevels.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="px-4 py-10 text-center">
                          <p className="text-sm font-semibold text-slate-200">Stok kaydı yok</p>
                          <p className="mt-1 text-sm text-slate-500">Bu ürün için depo bazlı stok seviyesi henüz oluşmamış.</p>
                        </td>
                      </tr>
                    ) : stockLevels.map((row) => (
                      <StockRow key={row.id} row={row} min={stockSummary.min} unitCode={unitCode} onOpen={() => router.push(`/dashboard/stock/levels?productId=${id}`)} />
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </Section>

          <div className="grid gap-5 lg:grid-cols-2">
            <Section title="Katalog Bilgisi" icon={<Tags className="h-4 w-4" />}>
              <InfoRow label="Ürün kodu" value={<span className="font-mono text-sky-300">{product.code}</span>} />
              <InfoRow label="Kategori" value={product.category?.name} />
              <InfoRow label="Birim" value={product.unit ? `${product.unit.name} (${product.unit.code})` : null} />
              <InfoRow label="KDV oranı" value={product.taxRate ? `%${formatNumber(product.taxRate.rate, 0)}` : null} />
              <InfoRow label="Barkod" value={product.barcode} />
              <InfoRow label="Durum" value={<ActiveBadge isActive={product.isActive} />} />
            </Section>

            <Section title="Fiyat ve Maliyet" icon={<ReceiptText className="h-4 w-4" />}>
              <InfoRow label="Alış fiyatı" value={formatCurrency(product.purchasePrice)} />
              <InfoRow label="Satış fiyatı" value={<span className="text-slate-100">{formatCurrency(product.salesPrice)}</span>} />
              <InfoRow label="Ortalama maliyet" value={formatCurrency(product.averageCost)} />
              <InfoRow label="Birim kar" value={<span className={cn(profitPerUnit < 0 ? "text-red-300" : "text-emerald-300")}>{formatCurrency(profitPerUnit)}</span>} />
            </Section>
          </div>

          <Section title="Ürün Görseli" description="Katalog, satış ve stok ekranlarında kullanılacak ürün görselini yönetin." icon={<ImageIcon className="h-4 w-4" />}>
            <EntityImageManager entityType="PRODUCT" entityId={id} label="Ürün görseli" description="Katalog, satış ve stok ekranlarında kullanılacak ürün görselini yükleyin." />
          </Section>

          <AttachmentPanel entityType="PRODUCT" entityId={id} />
        </main>

        <aside className="space-y-5">
          <Section title="Operasyon Özeti" icon={<ClipboardList className="h-4 w-4" />}>
            <InfoRow label="Stok durumu" value={<Badge variant={stockSummary.variant}>{stockSummary.label}</Badge>} />
            <InfoRow label="Brüt marj" value={<Badge variant={marginVariant}>{margin === null ? "Hesaplanamadı" : `%${formatNumber(margin, 1)}`}</Badge>} />
            <InfoRow label="Kart kalitesi" value={qualityFlags.length === 0 ? <Badge variant="success">Kart tamam</Badge> : `${qualityFlags.length} kontrol`} />
          </Section>

          <Section title="Hızlı Geçişler" icon={<Boxes className="h-4 w-4" />}>
            <div className="grid gap-2">
              <Button variant="outline" leftIcon={<Warehouse className="h-4 w-4" />} onClick={() => router.push(`/dashboard/stock/levels?productId=${id}`)}>Depo stoklarını aç</Button>
              <Button variant="outline" leftIcon={<FileClock className="h-4 w-4" />} onClick={() => router.push(`/dashboard/stock/movements?productId=${id}`)}>Stok hareketlerini aç</Button>
              <Button variant="outline" leftIcon={<ShoppingCart className="h-4 w-4" />} onClick={() => router.push(`/dashboard/purchase-orders/requests?productId=${id}`)}>Satın alma talebi aç</Button>
            </div>
          </Section>

          <Section title="Marj Kontrolü" icon={<TrendingUp className="h-4 w-4" />}>
            <InfoRow label="Satış - alış" value={formatCurrency(profitPerUnit)} />
            <InfoRow label="Satış - ort. maliyet" value={formatCurrency(product.salesPrice - product.averageCost)} />
          </Section>

          <EntityActionPanel
            entityType="PRODUCT"
            entityId={id}
            displayName={product.name}
            module="inventory"
            availableActions={["task", "note", "activity"]}
            recommendedActions={purchaseDraft}
          />
        </aside>
      </div>

      <ConfirmDialog
        isOpen={deleteOpen}
        onClose={() => setDeleteOpen(false)}
        onConfirm={() => deleteProduct.mutate(id, { onSuccess: () => router.push("/dashboard/products") })}
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
