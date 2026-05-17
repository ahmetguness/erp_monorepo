"use client";

import { useMemo, useState } from "react";
import { PackagePlus, Pencil, Plus, Send, Trash2, UploadCloud, XCircle } from "lucide-react";
import { PageHeader } from "@/components/shared/PageHeader";
import { DataTable, type ColumnDef } from "@/components/shared/DataTable";
import { ProductSelect } from "@/components/shared/EntitySelect";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { SearchableSelect } from "@/components/ui/SearchableSelect";
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
  useTrendyolAttributes,
  useTrendyolBrands,
  useTrendyolCargoProviders,
  useTrendyolCategories,
} from "@/hooks/useMarketplace";
import { useProducts } from "@/hooks/useProducts";
import { formatCurrency } from "@/lib/utils";
import { getFieldErrors, type FieldErrors } from "@/lib/form-errors";
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
type ListingField = keyof ListingForm;
type TrendyolField = keyof TrendyolProductForm;

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
  const [formErrors, setFormErrors] = useState<FieldErrors<ListingField>>({});
  const [editForm, setEditForm] = useState({ price: "", stock: "" });
  const [editErrors, setEditErrors] = useState<FieldErrors<"price" | "stock">>({});
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
  const [trendyolErrors, setTrendyolErrors] = useState<FieldErrors<TrendyolField>>({});
  const [brandQuery, setBrandQuery] = useState("");
  const [categoryQuery, setCategoryQuery] = useState("");

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
  const selectedMarketplaceIntegrationId = marketplaceTarget?.integrationId ?? "";
  const selectedCategoryId = toRequiredNumber(trendyolForm.categoryId);
  const { data: brandOptionsData = [], isLoading: brandsLoading } = useTrendyolBrands(selectedMarketplaceIntegrationId, brandQuery);
  const { data: categoryOptionsData = [], isLoading: categoriesLoading } = useTrendyolCategories(selectedMarketplaceIntegrationId, categoryQuery);
  const { data: cargoProviders = [], isLoading: cargoLoading } = useTrendyolCargoProviders(selectedMarketplaceIntegrationId);
  const { data: categoryAttributes = [] } = useTrendyolAttributes(selectedMarketplaceIntegrationId, selectedCategoryId);

  const integrationOptions = useMemo(
    () => integrations.map((integration) => ({
      value: integration.id,
      label: `${integration.name} (${integration.channel})`,
      disabled: !integration.isActive,
    })),
    [integrations],
  );

  const brandOptions = useMemo(
    () => brandOptionsData.map((option) => ({ value: String(option.id), label: option.name, helperText: `ID ${option.id}` })),
    [brandOptionsData],
  );
  const categoryOptions = useMemo(
    () => categoryOptionsData.map((option) => ({ value: String(option.id), label: option.name, helperText: `ID ${option.id}` })),
    [categoryOptionsData],
  );
  const cargoOptions = useMemo(
    () => cargoProviders.map((option) => ({ value: String(option.id), label: option.name, helperText: `ID ${option.id}` })),
    [cargoProviders],
  );
  const attributeOptions = useMemo(
    () => categoryAttributes.map((attribute) => ({
      value: String(attribute.id),
      label: attribute.required ? `${attribute.name} *` : attribute.name,
      helperText: attribute.allowCustom ? "Özel değer destekler" : undefined,
    })),
    [categoryAttributes],
  );
  const selectedAttribute = categoryAttributes.find((attribute) => String(attribute.id) === trendyolForm.attributeId);
  const attributeValueOptions = useMemo(
    () => (selectedAttribute?.values ?? []).map((option) => ({ value: String(option.id), label: option.name, helperText: `ID ${option.id}` })),
    [selectedAttribute],
  );

  const openMarketplaceAction = (listing: MarketplaceListing, action: MarketplaceAction) => {
    setMarketplaceTarget(listing);
    setMarketplaceAction(action);
    setTrendyolForm(buildTrendyolForm(listing));
    setTrendyolErrors({});
    setBrandQuery("");
    setCategoryQuery("");
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
                      setFormErrors({});
                    },
                    onError: (error) => setFormErrors(getFieldErrors(error, ["integrationId", "productId", "externalId", "price", "stock"])),
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
            error={formErrors.integrationId}
            onChange={(e) => {
              setFormErrors((p) => ({ ...p, integrationId: undefined }));
              setForm((p) => ({ ...p, integrationId: e.target.value }));
            }}
          />
          <ProductSelect
            label="Ürün"
            required
            placeholder="Ürün seçin"
            value={form.productId}
            error={formErrors.productId}
            onChange={(value) => {
              const product = products.find((item) => item.id === value);
              setFormErrors((p) => ({ ...p, productId: undefined }));
              setForm((p) => ({
                ...p,
                productId: value,
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
              error={formErrors.externalId}
              onChange={(e) => {
                setFormErrors((p) => ({ ...p, externalId: undefined }));
                setForm((p) => ({ ...p, externalId: e.target.value }));
              }}
            />
            <Input
              label="Stok Kodu"
              value={form.externalSku}
              placeholder={selectedProduct?.code}
              onChange={(e) => setForm((p) => ({ ...p, externalSku: e.target.value }))}
            />
          </FormRow>
          <FormRow cols={2}>
            <Input label="Fiyat" required type="number" value={form.price} error={formErrors.price} onChange={(e) => {
              setFormErrors((p) => ({ ...p, price: undefined }));
              setForm((p) => ({ ...p, price: e.target.value }));
            }} />
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
                  {
                    onSuccess: () => {
                      setMarketplaceTarget(null);
                      setTrendyolErrors({});
                    },
                    onError: (error) => setTrendyolErrors(getFieldErrors(error, ["brandId", "categoryId", "cargoCompanyId", "attributeId", "attributeValueId"])),
                  },
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
            <SearchableSelect
              label="Marka"
              required
              value={trendyolForm.brandId}
              query={brandQuery}
              placeholder="Marka ara"
              options={brandOptions}
              isLoading={brandsLoading}
              error={trendyolErrors.brandId}
              helperText="En az 2 karakter yazın"
              onQueryChange={setBrandQuery}
              onChange={(value) => {
                setTrendyolErrors((p) => ({ ...p, brandId: undefined }));
                setTrendyolForm((p) => ({ ...p, brandId: value }));
              }}
            />
            <SearchableSelect
              label="Kategori"
              required
              value={trendyolForm.categoryId}
              query={categoryQuery}
              placeholder="Kategori ara"
              options={categoryOptions}
              isLoading={categoriesLoading}
              error={trendyolErrors.categoryId}
              onQueryChange={setCategoryQuery}
              onChange={(value) => {
                setTrendyolErrors((p) => ({ ...p, categoryId: undefined, attributeId: undefined, attributeValueId: undefined }));
                setTrendyolForm((p) => ({ ...p, categoryId: value, attributeId: "", attributeValueId: "", customAttributeValue: "" }));
              }}
            />
            <SearchableSelect
              label="Kargo firması"
              required
              value={trendyolForm.cargoCompanyId}
              query={cargoOptions.find((item) => item.value === trendyolForm.cargoCompanyId)?.label ?? ""}
              placeholder="Kargo firması seç"
              options={cargoOptions}
              isLoading={cargoLoading}
              error={trendyolErrors.cargoCompanyId}
              onQueryChange={() => undefined}
              onChange={(value) => {
                setTrendyolErrors((p) => ({ ...p, cargoCompanyId: undefined }));
                setTrendyolForm((p) => ({ ...p, cargoCompanyId: value }));
              }}
            />
          </FormRow>
          <FormRow cols={4}>
            <Input label="Satış Fiyatı" type="number" value={trendyolForm.salePrice} onChange={(e) => setTrendyolForm((p) => ({ ...p, salePrice: e.target.value }))} />
            <Input label="Liste Fiyatı" type="number" value={trendyolForm.listPrice} onChange={(e) => setTrendyolForm((p) => ({ ...p, listPrice: e.target.value }))} />
            <Input label="Stok" type="number" value={trendyolForm.quantity} onChange={(e) => setTrendyolForm((p) => ({ ...p, quantity: e.target.value }))} />
            <Input label="KDV" type="number" value={trendyolForm.vatRate} onChange={(e) => setTrendyolForm((p) => ({ ...p, vatRate: e.target.value }))} />
          </FormRow>
          <FormRow cols={3}>
            <Input label="Ana Ürün Kodu" value={trendyolForm.productMainId} onChange={(e) => setTrendyolForm((p) => ({ ...p, productMainId: e.target.value }))} />
            <Input label="Desi" type="number" value={trendyolForm.dimensionalWeight} onChange={(e) => setTrendyolForm((p) => ({ ...p, dimensionalWeight: e.target.value }))} />
            <Input label="Görsel URL" value={trendyolForm.imageUrl} onChange={(e) => setTrendyolForm((p) => ({ ...p, imageUrl: e.target.value }))} />
          </FormRow>
          <FormRow cols={3}>
            <Input label="Adres ID" type="number" value={trendyolForm.shipmentAddressId} onChange={(e) => setTrendyolForm((p) => ({ ...p, shipmentAddressId: e.target.value }))} />
            <Input label="İade Adres ID" type="number" value={trendyolForm.returningAddressId} onChange={(e) => setTrendyolForm((p) => ({ ...p, returningAddressId: e.target.value }))} />
            <Select
              label="Kategori özelliği"
              placeholder="Özellik seç"
              options={attributeOptions}
              value={trendyolForm.attributeId}
              error={trendyolErrors.attributeId}
              onChange={(e) => setTrendyolForm((p) => ({ ...p, attributeId: e.target.value, attributeValueId: "", customAttributeValue: "" }))}
            />
          </FormRow>
          <FormRow cols={2}>
            <Select
              label="Özellik değeri"
              placeholder="Değer seç"
              options={attributeValueOptions}
              value={trendyolForm.attributeValueId}
              error={trendyolErrors.attributeValueId}
              disabled={!selectedAttribute || attributeValueOptions.length === 0}
              onChange={(e) => setTrendyolForm((p) => ({ ...p, attributeValueId: e.target.value }))}
            />
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
                  {
                    onSuccess: () => {
                      setEditTarget(null);
                      setEditErrors({});
                    },
                    onError: (error) => setEditErrors(getFieldErrors(error, ["price", "stock"])),
                  },
                );
              }}
            >
              Kaydet
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Input label="Fiyat" type="number" value={editForm.price} error={editErrors.price} onChange={(e) => {
            setEditErrors((p) => ({ ...p, price: undefined }));
            setEditForm((p) => ({ ...p, price: e.target.value }));
          }} />
          <Input label="Stok" type="number" value={editForm.stock} error={editErrors.stock} onChange={(e) => {
            setEditErrors((p) => ({ ...p, stock: undefined }));
            setEditForm((p) => ({ ...p, stock: e.target.value }));
          }} />
        </div>
      </Modal>
    </div>
  );
}
