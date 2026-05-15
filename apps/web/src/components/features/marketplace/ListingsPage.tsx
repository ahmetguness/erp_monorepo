"use client";

import { useMemo, useState } from "react";
import { PackagePlus, Pencil, Plus, Send, Trash2, UploadCloud, XCircle } from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";
import { DataTable, type ColumnDef } from "@/components/shared/DataTable";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Textarea } from "@/components/ui/Textarea";
import { FormRow } from "@/components/shared/FormField";
import {
  useListings,
  useCreateListing,
  useUpdateListing,
  useDeleteListing,
  useIntegrations,
  usePublishListingToMarketplace,
  useUpdateMarketplaceProduct,
  useDeleteMarketplaceProduct,
} from "@/hooks/useMarketplace";
import { useProducts } from "@/hooks/useProducts";
import { formatCurrency } from "@/lib/utils";
import type { MarketplaceListing, TrendyolListingProductDTO } from "@/services/marketplace.service";
import type { Product } from "@/services/product.service";

type ListingForm = {
  integrationId: string;
  productId: string;
  externalId: string;
  externalSku: string;
  price: string;
  stock: string;
};

type TrendyolProductForm = {
  barcode: string;
  title: string;
  productMainId: string;
  brandId: string;
  categoryId: string;
  quantity: string;
  stockCode: string;
  dimensionalWeight: string;
  description: string;
  listPrice: string;
  salePrice: string;
  vatRate: string;
  cargoCompanyId: string;
  shipmentAddressId: string;
  returningAddressId: string;
  imageUrl: string;
  attributeId: string;
  attributeValueId: string;
  customAttributeValue: string;
};

type MarketplaceAction = "publish" | "update";

const emptyListingForm: ListingForm = {
  integrationId: "",
  productId: "",
  externalId: "",
  externalSku: "",
  price: "",
  stock: "",
};

const emptyProducts: Product[] = [];

function toNumber(value: string): number | undefined {
  if (!value.trim()) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function toRequiredNumber(value: string): number | null {
  const parsed = toNumber(value);
  return parsed === undefined ? null : parsed;
}

function productLabel(product: Product): string {
  return `${product.code} - ${product.name}`;
}

function buildTrendyolForm(listing: MarketplaceListing): TrendyolProductForm {
  const product = listing.product;
  const price = String(Number(listing.price));
  const stock = String(Number(listing.stock));

  return {
    barcode: listing.externalId || "",
    title: product?.name ?? "",
    productMainId: product?.code ?? "",
    brandId: "",
    categoryId: "",
    quantity: stock,
    stockCode: listing.externalSku ?? product?.code ?? "",
    dimensionalWeight: "1",
    description: product?.name ?? "",
    listPrice: price,
    salePrice: price,
    vatRate: "20",
    cargoCompanyId: "",
    shipmentAddressId: "",
    returningAddressId: "",
    imageUrl: "",
    attributeId: "",
    attributeValueId: "",
    customAttributeValue: "",
  };
}

function buildTrendyolPayload(form: TrendyolProductForm): TrendyolListingProductDTO | null {
  const brandId = toRequiredNumber(form.brandId);
  const categoryId = toRequiredNumber(form.categoryId);
  const cargoCompanyId = toRequiredNumber(form.cargoCompanyId);
  if (brandId === null || categoryId === null || cargoCompanyId === null) return null;

  const attributeId = toNumber(form.attributeId);
  const attributeValueId = toNumber(form.attributeValueId);
  const attributes = attributeId === undefined
    ? []
    : [{
        attributeId,
        ...(attributeValueId !== undefined && { attributeValueId }),
        ...(form.customAttributeValue.trim() && { customAttributeValue: form.customAttributeValue.trim() }),
      }];

  return {
    barcode: form.barcode.trim() || undefined,
    title: form.title.trim() || undefined,
    productMainId: form.productMainId.trim() || undefined,
    brandId,
    categoryId,
    quantity: toNumber(form.quantity),
    stockCode: form.stockCode.trim() || undefined,
    dimensionalWeight: toNumber(form.dimensionalWeight),
    description: form.description.trim() || undefined,
    listPrice: toNumber(form.listPrice),
    salePrice: toNumber(form.salePrice),
    vatRate: toNumber(form.vatRate),
    cargoCompanyId,
    shipmentAddressId: toNumber(form.shipmentAddressId),
    returningAddressId: toNumber(form.returningAddressId),
    images: form.imageUrl.trim() ? [form.imageUrl.trim()] : undefined,
    attributes,
  };
}

export function ListingsPage() {
  const [page, setPage] = useState(1);
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<MarketplaceListing | null>(null);
  const [marketplaceTarget, setMarketplaceTarget] = useState<MarketplaceListing | null>(null);
  const [marketplaceAction, setMarketplaceAction] = useState<MarketplaceAction>("publish");
  const [form, setForm] = useState<ListingForm>(emptyListingForm);
  const [editForm, setEditForm] = useState({ price: "", stock: "" });
  const [trendyolForm, setTrendyolForm] = useState<TrendyolProductForm>(() => buildTrendyolForm({
    id: "",
    tenantId: "",
    integrationId: "",
    productId: "",
    externalId: "",
    externalSku: null,
    price: 0,
    stock: 0,
    isActive: true,
    lastSyncAt: null,
    syncError: null,
  }));

  const { data, isLoading } = useListings({ page, limit: 20 });
  const { data: integrations = [] } = useIntegrations();
  const { data: productsData } = useProducts({ page: 1, limit: 200, isActive: true });
  const create = useCreateListing();
  const update = useUpdateListing();
  const remove = useDeleteListing();
  const publish = usePublishListingToMarketplace();
  const updateMarketplace = useUpdateMarketplaceProduct();
  const deleteMarketplace = useDeleteMarketplaceProduct();

  const products = productsData?.data ?? emptyProducts;
  const selectedProduct = products.find((product) => product.id === form.productId);
  const trendPayload = buildTrendyolPayload(trendyolForm);

  const integrationOptions = useMemo(
    () => integrations.map((integration) => ({
      value: integration.id,
      label: `${integration.name} (${integration.channel})`,
      disabled: !integration.isActive,
    })),
    [integrations],
  );

  const productOptions = useMemo(
    () => products.map((product) => ({ value: product.id, label: productLabel(product) })),
    [products],
  );

  const openMarketplaceAction = (listing: MarketplaceListing, action: MarketplaceAction) => {
    setMarketplaceTarget(listing);
    setMarketplaceAction(action);
    setTrendyolForm(buildTrendyolForm(listing));
  };

  const columns: ColumnDef<MarketplaceListing>[] = [
    {
      key: "product",
      header: "Ürün",
      render: (r) => (
        <div>
          <span className="text-white text-sm font-medium">{r.product?.name ?? "-"}</span>
          <span className="block text-xs text-slate-500 font-mono">{r.product?.code}</span>
          {r.syncError && <span className="block text-xs text-red-400 mt-1">{r.syncError}</span>}
        </div>
      ),
    },
    {
      key: "channel",
      header: "Kanal",
      width: "140px",
      render: (r) => <Badge variant="info">{r.integration?.name ?? r.integration?.channel ?? "-"}</Badge>,
    },
    {
      key: "externalId",
      header: "Barkod",
      width: "150px",
      render: (r) => (
        <code className="text-xs text-slate-400 bg-slate-800/60 px-2 py-0.5 rounded">{r.externalId}</code>
      ),
    },
    {
      key: "price",
      header: "Fiyat",
      width: "110px",
      align: "right",
      render: (r) => <span className="text-white font-medium tabular-nums">{formatCurrency(r.price)}</span>,
    },
    {
      key: "stock",
      header: "Stok",
      width: "80px",
      align: "center",
      render: (r) => (
        <span className={`font-medium ${Number(r.stock) <= 0 ? "text-red-400" : "text-slate-300"}`}>{r.stock}</span>
      ),
    },
    {
      key: "isActive",
      header: "Durum",
      width: "90px",
      render: (r) => r.isActive ? <Badge variant="success">Aktif</Badge> : <Badge variant="neutral">Pasif</Badge>,
    },
    {
      key: "actions",
      header: "",
      width: "170px",
      align: "right",
      render: (r) => (
        <div className="flex items-center justify-end gap-1">
          <button
            title="Pazaryerine gönder"
            onClick={(e) => {
              e.stopPropagation();
              openMarketplaceAction(r, "publish");
            }}
            className="p-1.5 rounded-lg text-slate-500 hover:text-sky-400 hover:bg-sky-500/10 transition-colors"
          >
            <Send className="w-3.5 h-3.5" />
          </button>
          <button
            title="Pazaryerinde güncelle"
            onClick={(e) => {
              e.stopPropagation();
              openMarketplaceAction(r, "update");
            }}
            className="p-1.5 rounded-lg text-slate-500 hover:text-emerald-400 hover:bg-emerald-500/10 transition-colors"
          >
            <UploadCloud className="w-3.5 h-3.5" />
          </button>
          <button
            title="Pazaryerinden sil"
            onClick={(e) => {
              e.stopPropagation();
              deleteMarketplace.mutate({ id: r.id, data: { barcode: r.externalId } });
            }}
            className="p-1.5 rounded-lg text-slate-500 hover:text-red-400 hover:bg-red-500/10 transition-colors"
          >
            <XCircle className="w-3.5 h-3.5" />
          </button>
          <button
            title="ERP kaydını düzenle"
            onClick={(e) => {
              e.stopPropagation();
              setEditTarget(r);
              setEditForm({ price: String(r.price), stock: String(r.stock) });
            }}
            className="p-1.5 rounded-lg text-slate-500 hover:text-amber-400 hover:bg-amber-500/10 transition-colors"
          >
            <Pencil className="w-3.5 h-3.5" />
          </button>
          <button
            title="ERP kaydını sil"
            onClick={(e) => {
              e.stopPropagation();
              remove.mutate(r.id);
            }}
            className="p-1.5 rounded-lg text-slate-500 hover:text-red-400 hover:bg-red-500/10 transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Ürün Listelemeleri"
        subtitle="Pazaryeri ürünlerini ERP üzerinden yayınlayın, güncelleyin ve pasife alın."
        action={
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="w-4 h-4" />
            Yeni Listeleme
          </Button>
        }
      />

      <DataTable
        columns={columns}
        data={data?.data ?? []}
        keyExtractor={(r) => r.id}
        isLoading={isLoading}
        emptyTitle="Listeleme bulunamadı"
        emptyDescription="Bir ürünü pazaryerine listeleyerek başlayın."
        pagination={
          data
            ? { page, pageSize: 20, total: data.meta.total, totalPages: data.meta.totalPages, onChange: setPage }
            : undefined
        }
      />

      <Modal
        isOpen={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Yeni Listeleme"
        size="md"
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={() => setCreateOpen(false)}>İptal</Button>
            <Button
              size="sm"
              loading={create.isPending}
              disabled={!form.integrationId || !form.productId || !form.externalId || !form.price}
              onClick={() =>
                create.mutate(
                  {
                    integrationId: form.integrationId,
                    productId: form.productId,
                    externalId: form.externalId,
                    externalSku: form.externalSku || undefined,
                    price: Number(form.price),
                    stock: form.stock ? Number(form.stock) : undefined,
                  },
                  {
                    onSuccess: () => {
                      setCreateOpen(false);
                      setForm(emptyListingForm);
                    },
                  },
                )
              }
            >
              Oluştur
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Select
            label="Entegrasyon"
            required
            placeholder="Entegrasyon seçin"
            options={integrationOptions}
            value={form.integrationId}
            onChange={(e) => setForm((p) => ({ ...p, integrationId: e.target.value }))}
          />
          <Select
            label="Ürün"
            required
            placeholder="Ürün seçin"
            options={productOptions}
            value={form.productId}
            onChange={(e) => {
              const product = products.find((item) => item.id === e.target.value);
              setForm((p) => ({
                ...p,
                productId: e.target.value,
                externalId: product?.barcode ?? product?.code ?? p.externalId,
                externalSku: product?.code ?? p.externalSku,
                price: product ? String(product.salesPrice) : p.price,
              }));
            }}
          />
          <FormRow cols={2}>
            <Input
              label="Barkod"
              required
              value={form.externalId}
              onChange={(e) => setForm((p) => ({ ...p, externalId: e.target.value }))}
            />
            <Input
              label="Stok Kodu"
              value={form.externalSku}
              placeholder={selectedProduct?.code}
              onChange={(e) => setForm((p) => ({ ...p, externalSku: e.target.value }))}
            />
          </FormRow>
          <FormRow cols={2}>
            <Input label="Fiyat" required type="number" value={form.price} onChange={(e) => setForm((p) => ({ ...p, price: e.target.value }))} />
            <Input label="Stok" type="number" value={form.stock} onChange={(e) => setForm((p) => ({ ...p, stock: e.target.value }))} />
          </FormRow>
        </div>
      </Modal>

      <Modal
        isOpen={!!marketplaceTarget}
        onClose={() => setMarketplaceTarget(null)}
        title={marketplaceAction === "publish" ? "Trendyol'a Ürün Gönder" : "Trendyol Ürününü Güncelle"}
        size="lg"
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={() => setMarketplaceTarget(null)}>İptal</Button>
            <Button
              size="sm"
              loading={publish.isPending || updateMarketplace.isPending}
              disabled={!marketplaceTarget || trendPayload === null}
              onClick={() => {
                if (!marketplaceTarget || trendPayload === null) return;
                const mutation = marketplaceAction === "publish" ? publish : updateMarketplace;
                mutation.mutate(
                  { id: marketplaceTarget.id, data: trendPayload },
                  { onSuccess: () => setMarketplaceTarget(null) },
                );
              }}
            >
              <PackagePlus className="w-4 h-4" />
              Gönder
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <FormRow cols={2}>
            <Input label="Barkod" value={trendyolForm.barcode} onChange={(e) => setTrendyolForm((p) => ({ ...p, barcode: e.target.value }))} />
            <Input label="Stok Kodu" value={trendyolForm.stockCode} onChange={(e) => setTrendyolForm((p) => ({ ...p, stockCode: e.target.value }))} />
          </FormRow>
          <Input label="Başlık" value={trendyolForm.title} onChange={(e) => setTrendyolForm((p) => ({ ...p, title: e.target.value }))} />
          <Textarea label="Açıklama" value={trendyolForm.description} onChange={(e) => setTrendyolForm((p) => ({ ...p, description: e.target.value }))} />
          <FormRow cols={3}>
            <Input label="Marka ID" required type="number" value={trendyolForm.brandId} onChange={(e) => setTrendyolForm((p) => ({ ...p, brandId: e.target.value }))} />
            <Input label="Kategori ID" required type="number" value={trendyolForm.categoryId} onChange={(e) => setTrendyolForm((p) => ({ ...p, categoryId: e.target.value }))} />
            <Input label="Kargo Firma ID" required type="number" value={trendyolForm.cargoCompanyId} onChange={(e) => setTrendyolForm((p) => ({ ...p, cargoCompanyId: e.target.value }))} />
          </FormRow>
          <FormRow cols={4}>
            <Input label="Satış Fiyatı" type="number" value={trendyolForm.salePrice} onChange={(e) => setTrendyolForm((p) => ({ ...p, salePrice: e.target.value }))} />
            <Input label="Liste Fiyatı" type="number" value={trendyolForm.listPrice} onChange={(e) => setTrendyolForm((p) => ({ ...p, listPrice: e.target.value }))} />
            <Input label="Stok" type="number" value={trendyolForm.quantity} onChange={(e) => setTrendyolForm((p) => ({ ...p, quantity: e.target.value }))} />
            <Input label="KDV" type="number" value={trendyolForm.vatRate} onChange={(e) => setTrendyolForm((p) => ({ ...p, vatRate: e.target.value }))} />
          </FormRow>
          <FormRow cols={3}>
            <Input label="Ana Ürün ID" value={trendyolForm.productMainId} onChange={(e) => setTrendyolForm((p) => ({ ...p, productMainId: e.target.value }))} />
            <Input label="Desi" type="number" value={trendyolForm.dimensionalWeight} onChange={(e) => setTrendyolForm((p) => ({ ...p, dimensionalWeight: e.target.value }))} />
            <Input label="Görsel URL" value={trendyolForm.imageUrl} onChange={(e) => setTrendyolForm((p) => ({ ...p, imageUrl: e.target.value }))} />
          </FormRow>
          <FormRow cols={3}>
            <Input label="Adres ID" type="number" value={trendyolForm.shipmentAddressId} onChange={(e) => setTrendyolForm((p) => ({ ...p, shipmentAddressId: e.target.value }))} />
            <Input label="İade Adres ID" type="number" value={trendyolForm.returningAddressId} onChange={(e) => setTrendyolForm((p) => ({ ...p, returningAddressId: e.target.value }))} />
            <Input label="Özellik ID" type="number" value={trendyolForm.attributeId} onChange={(e) => setTrendyolForm((p) => ({ ...p, attributeId: e.target.value }))} />
          </FormRow>
          <FormRow cols={2}>
            <Input label="Özellik Değer ID" type="number" value={trendyolForm.attributeValueId} onChange={(e) => setTrendyolForm((p) => ({ ...p, attributeValueId: e.target.value }))} />
            <Input label="Özel Özellik Değeri" value={trendyolForm.customAttributeValue} onChange={(e) => setTrendyolForm((p) => ({ ...p, customAttributeValue: e.target.value }))} />
          </FormRow>
        </div>
      </Modal>

      <Modal
        isOpen={!!editTarget}
        onClose={() => setEditTarget(null)}
        title="ERP Fiyat / Stok"
        size="sm"
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={() => setEditTarget(null)}>İptal</Button>
            <Button
              size="sm"
              loading={update.isPending}
              onClick={() => {
                if (!editTarget) return;
                update.mutate(
                  { id: editTarget.id, data: { price: Number(editForm.price), stock: Number(editForm.stock) } },
                  { onSuccess: () => setEditTarget(null) },
                );
              }}
            >
              Kaydet
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Input label="Fiyat" type="number" value={editForm.price} onChange={(e) => setEditForm((p) => ({ ...p, price: e.target.value }))} />
          <Input label="Stok" type="number" value={editForm.stock} onChange={(e) => setEditForm((p) => ({ ...p, stock: e.target.value }))} />
        </div>
      </Modal>
    </div>
  );
}
