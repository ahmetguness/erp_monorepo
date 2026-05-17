"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  ArrowLeft,
  Package,
  Tag,
  DollarSign,
  Warehouse,
  Save,
  X,
  Barcode,
  Hash,
  Check,
  Eye,
  TrendingUp,
  TrendingDown,
  Layers,
  AlertCircle,
} from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { FormRow } from "@/components/shared/FormField";
import { WarehouseSelect } from "@/components/shared/EntitySelect";
import {
  ImageUploadBox,
  type ImageUploadStatus,
} from "@/components/shared/ImageUploadBox";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Combobox } from "@/components/ui/Combobox";
import { Textarea } from "@/components/ui/Textarea";
import { Button } from "@/components/ui/Button";
import { FullPageSpinner } from "@/components/ui/Spinner";
import {
  useProduct,
  useCreateProduct,
  useUpdateProduct,
} from "@/hooks/useProducts";
import { useAttachments } from "@/hooks/useAttachments";
import {
  useUnits,
  useCategories,
  useTaxRates,
  useCreateCategory,
} from "@/hooks/useMasterData";
import { createManualMovement } from "@/services/stock.service";
import {
  deleteAttachment,
  downloadAttachment,
  uploadAttachment,
  type Attachment,
} from "@/services/attachment.service";
import { useUIStore } from "@/store/ui.store";
import { cn, formatCurrency } from "@/lib/utils";

// ─────────────────────────────────────────────
// Schema
// ─────────────────────────────────────────────

const productSchema = z.object({
  code: z.string().min(1, "Kod zorunludur"),
  name: z.string().min(1, "Ad zorunludur"),
  unitId: z.string().min(1, "Birim seçiniz"),
  categoryId: z.string().optional(),
  taxRateId: z.string().optional(),
  barcode: z.string().optional(),
  description: z.string().optional(),
  purchasePrice: z.string().optional(),
  salesPrice: z.string().optional(),
  minStockLevel: z.string().optional(),
  initialStock: z.string().optional(),
  warehouseId: z.string().optional(),
});

type ProductForm = z.infer<typeof productSchema>;

function isImageAttachment(attachment: Attachment): boolean {
  return attachment.mimeType?.startsWith("image/") ?? false;
}

// ─────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────

function SectionCard({
  step,
  icon,
  iconColor,
  title,
  description,
  done,
  children,
}: {
  step: number;
  icon: React.ReactNode;
  iconColor: string;
  title: string;
  description?: string;
  done?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "bg-slate-900 border rounded-xl overflow-hidden transition-colors duration-200",
        done ? "border-slate-700/80" : "border-slate-800",
      )}
    >
      <div className="flex items-center gap-3 px-5 py-4 border-b border-slate-800/60">
        <div
          className={cn(
            "relative w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold transition-colors",
            done ? "bg-emerald-500/15 text-emerald-400" : `${iconColor}`,
          )}
        >
          {done ? <Check className="w-4 h-4" /> : icon}
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-600">
              Adım {step}
            </span>
            {done && (
              <span className="text-[10px] font-medium text-emerald-500 bg-emerald-500/10 px-1.5 py-0.5 rounded-full">
                Tamam
              </span>
            )}
          </div>
          <h3 className="text-sm font-semibold text-white">{title}</h3>
          {description && (
            <p className="text-xs text-slate-500 mt-0.5">{description}</p>
          )}
        </div>
      </div>
      <div className="p-5 space-y-4">{children}</div>
    </div>
  );
}

function LivePreview({
  name,
  code,
  category,
  purchasePrice,
  salesPrice,
  unit,
  imagePreviewUrl,
}: {
  name: string;
  code: string;
  category: string;
  purchasePrice: string;
  salesPrice: string;
  unit: string;
  imagePreviewUrl: string | null;
}) {
  const hasData = name || code;
  const margin = Number(salesPrice || 0) - Number(purchasePrice || 0);
  const marginPct =
    Number(purchasePrice || 0) > 0
      ? ((margin / Number(purchasePrice)) * 100).toFixed(1)
      : "0.0";

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-800/60">
        <Eye className="w-3.5 h-3.5 text-slate-500" />
        <span className="text-xs font-semibold text-slate-400">
          Canlı Önizleme
        </span>
      </div>
      <div className="p-4">
        {!hasData ? (
          <div className="py-8 text-center">
            <Package className="w-8 h-8 text-slate-700 mx-auto mb-2" />
            <p className="text-xs text-slate-600">
              Bilgileri girdikçe burada görünecek
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Product card preview */}
            <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-4">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-lg bg-slate-950 border border-slate-700/70 flex items-center justify-center shrink-0 overflow-hidden">
                  {imagePreviewUrl ? (
                    <div
                      className="w-full h-full bg-center bg-cover"
                      style={{ backgroundImage: `url("${imagePreviewUrl}")` }}
                    />
                  ) : (
                    <Package className="w-5 h-5 text-sky-400" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-white truncate">
                    {name || "Ürün Adı"}
                  </p>
                  <p className="text-xs text-slate-500 font-mono">
                    {code || "KOD"}
                  </p>
                </div>
              </div>
              {category && (
                <div className="mt-3">
                  <span className="inline-flex items-center gap-1 text-[10px] font-medium text-sky-400 bg-sky-500/10 px-2 py-0.5 rounded-full">
                    <Layers className="w-2.5 h-2.5" />
                    {category}
                  </span>
                </div>
              )}
            </div>

            {/* Price summary */}
            {(Number(purchasePrice || 0) > 0 ||
              Number(salesPrice || 0) > 0) && (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="flex items-center gap-1.5 text-slate-500">
                    <TrendingDown className="w-3 h-3 text-red-400" />
                    Alış
                  </span>
                  <span className="font-semibold text-slate-300">
                    {formatCurrency(Number(purchasePrice || 0))}
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="flex items-center gap-1.5 text-slate-500">
                    <TrendingUp className="w-3 h-3 text-emerald-400" />
                    Satış
                  </span>
                  <span className="font-semibold text-slate-300">
                    {formatCurrency(Number(salesPrice || 0))}
                  </span>
                </div>
                <div className="h-px bg-slate-800 my-1" />
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-500">Kar Marjı</span>
                  <span
                    className={cn(
                      "font-bold",
                      margin >= 0 ? "text-emerald-400" : "text-red-400",
                    )}
                  >
                    {formatCurrency(margin)} ({marginPct}%)
                  </span>
                </div>
              </div>
            )}

            {unit && (
              <div className="text-[10px] text-slate-600 text-center pt-1">
                Birim: {unit}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────

interface Props {
  editId?: string;
}

export function ProductFormPage({ editId }: Props) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const isEdit = !!editId;

  const { data: existing, isLoading: loadingExisting } = useProduct(
    editId ?? "",
  );
  const createProduct = useCreateProduct();
  const updateProduct = useUpdateProduct(editId ?? "");

  const { data: units = [] } = useUnits();
  const { data: categories = [] } = useCategories();
  const { data: taxRates = [] } = useTaxRates();
  const { data: productAttachments = [] } = useAttachments(
    "PRODUCT",
    editId ?? "",
  );
  const { toast } = useUIStore();
  const imageInputRef = useRef<HTMLInputElement>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [existingImagePreviewUrl, setExistingImagePreviewUrl] = useState<
    string | null
  >(null);
  const [imageStatus, setImageStatus] = useState<ImageUploadStatus>("idle");

  const unitOptions = units.map((u) => ({
    value: u.id,
    label: `${u.name} (${u.code})`,
  }));
  const categoryOptions = categories.map((c) => ({
    value: c.id,
    label: c.name,
  }));
  const taxRateOptions = [
    { value: "", label: "— KDV yok —" },
    ...taxRates.map((t) => ({ value: t.id, label: `${t.name} (%${t.rate})` })),
  ];
  const createCategory = useCreateCategory();

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    control,
    formState: { errors },
  } = useForm<ProductForm>({
    resolver: zodResolver(productSchema),
    defaultValues: { purchasePrice: "0", salesPrice: "0", minStockLevel: "0" },
  });

  const watchAll = useWatch({ control });

  // Section completion checks
  const step1Done = !!(watchAll.code && watchAll.name && watchAll.unitId);
  const step2Done = !!(
    Number(watchAll.purchasePrice || 0) > 0 ||
    Number(watchAll.salesPrice || 0) > 0
  );
  const step3Done = !!(
    Number(watchAll.initialStock || 0) > 0 && watchAll.warehouseId
  );
  const completedSteps = [
    step1Done,
    step2Done,
    ...(isEdit ? [] : [step3Done]),
  ].filter(Boolean).length;
  const totalSteps = isEdit ? 2 : 3;

  // Resolve display names for preview
  const selectedUnit = useMemo(
    () => units.find((u) => u.id === watchAll.unitId),
    [units, watchAll.unitId],
  );
  const selectedCategory = useMemo(
    () => categories.find((c) => c.id === watchAll.categoryId),
    [categories, watchAll.categoryId],
  );
  const productImage = useMemo(
    () => productAttachments.find(isImageAttachment) ?? null,
    [productAttachments],
  );
  const selectedImagePreviewUrl = useMemo(
    () => (imageFile ? URL.createObjectURL(imageFile) : null),
    [imageFile],
  );
  const visibleImagePreviewUrl =
    selectedImagePreviewUrl ??
    (productImage && !imageFile ? existingImagePreviewUrl : null);
  const hasProductImage = !!imageFile || !!productImage;

  useEffect(() => {
    if (!selectedImagePreviewUrl) return undefined;
    return () => URL.revokeObjectURL(selectedImagePreviewUrl);
  }, [selectedImagePreviewUrl]);

  useEffect(() => {
    if (!productImage || imageFile) {
      return undefined;
    }

    let mounted = true;
    let objectUrl: string | null = null;

    downloadAttachment(productImage.id)
      .then((blob) => {
        if (!mounted) return;
        objectUrl = URL.createObjectURL(blob);
        setExistingImagePreviewUrl(objectUrl);
      })
      .catch(() => {
        if (mounted) setExistingImagePreviewUrl(null);
      });

    return () => {
      mounted = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [productImage, imageFile]);

  const handleImageChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    setImageFile(file);
    setImageStatus(file ? "selected" : "idle");
    if (imageInputRef.current) imageInputRef.current.value = "";
  };

  const clearSelectedImage = () => {
    setImageFile(null);
    setImageStatus("idle");
  };

  const invalidateProductAttachments = async (productId: string) => {
    await queryClient.invalidateQueries({
      queryKey: ["attachments", "PRODUCT", productId],
    });
  };

  const uploadProductImage = async (
    productId: string,
    previousImageId?: string,
  ) => {
    if (!imageFile) return;
    setImageStatus("uploading");
    await uploadAttachment("PRODUCT", productId, imageFile);
    if (previousImageId) {
      await deleteAttachment(previousImageId);
    }
    await invalidateProductAttachments(productId);
    setImageFile(null);
    setImageStatus("uploaded");
  };

  const removeProductImage = async () => {
    if (!productImage || !editId) return;

    try {
      setImageStatus("removing");
      await deleteAttachment(productImage.id);
      await invalidateProductAttachments(editId);
      setImageFile(null);
      setExistingImagePreviewUrl(null);
      setImageStatus("idle");
      toast.success("Ürün görseli kaldırıldı.");
    } catch {
      setImageStatus("error");
      toast.error("Ürün görseli kaldırılamadı.");
    }
  };

  useEffect(() => {
    if (existing) {
      reset({
        code: existing.code,
        name: existing.name,
        unitId: existing.unitId,
        categoryId: existing.categoryId ?? "",
        taxRateId: existing.taxRateId ?? "",
        barcode: existing.barcode ?? "",
        description: existing.description ?? "",
        purchasePrice: String(existing.purchasePrice),
        salesPrice: String(existing.salesPrice),
        minStockLevel: String(existing.minStockLevel),
      });
    }
  }, [existing, reset]);

  const onSubmit = async (data: ProductForm) => {
    const payload = {
      code: data.code,
      name: data.name,
      unitId: data.unitId,
      categoryId: data.categoryId || undefined,
      taxRateId: data.taxRateId || undefined,
      barcode: data.barcode || undefined,
      description: data.description || undefined,
      purchasePrice: data.purchasePrice ? Number(data.purchasePrice) : 0,
      salesPrice: data.salesPrice ? Number(data.salesPrice) : 0,
      minStockLevel: data.minStockLevel ? Number(data.minStockLevel) : 0,
    };

    if (isEdit) {
      updateProduct.mutate(payload, {
        onSuccess: async () => {
          if (editId && imageFile) {
            try {
              await uploadProductImage(editId, productImage?.id);
              toast.success(
                productImage
                  ? "Ürün görseli güncellendi."
                  : "Ürün görseli yüklendi.",
              );
            } catch {
              setImageStatus("error");
              toast.warning("Ürün güncellendi ama görsel yüklenemedi.");
            }
          }
          router.push(`/dashboard/products/${editId}`);
        },
      });
    } else {
      createProduct.mutate(payload, {
        onSuccess: async (p) => {
          if (imageFile) {
            try {
              await uploadProductImage(p.id);
              toast.success("Ürün görseli yüklendi.");
            } catch {
              setImageStatus("error");
              toast.warning("Ürün oluşturuldu ama görsel yüklenemedi.");
            }
          }
          const qty = Number(data.initialStock);
          const wId = data.warehouseId;
          if (qty > 0 && wId) {
            try {
              await createManualMovement({
                productId: p.id,
                type: "OPENING",
                quantity: qty,
                warehouseId: wId,
                unitCost: payload.purchasePrice,
                notes: "Ürün oluşturma — başlangıç stoğu",
              });
              toast.success(`${qty} adet başlangıç stoğu eklendi.`);
            } catch {
              toast.warning("Ürün oluşturuldu ama stok girişi yapılamadı.");
            }
          }
          router.push(`/dashboard/products/${p.id}`);
        },
      });
    }
  };

  if (isEdit && loadingExisting) return <FullPageSpinner />;

  const isImageBusy = imageStatus === "uploading" || imageStatus === "removing";
  const isPending =
    createProduct.isPending || updateProduct.isPending || isImageBusy;
  const errorCount = Object.keys(errors).length;

  return (
    <div>
      {/* ── Header banner ───────────────────────── */}
      <div className="relative overflow-hidden bg-gradient-to-r from-sky-600/10 via-slate-900 to-violet-600/5 border border-slate-800 rounded-2xl p-5 mb-6">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_rgba(56,189,248,0.06)_0%,transparent_60%)]" />
        <div className="relative z-10 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => router.back()}
              className="p-2.5 rounded-xl bg-slate-800/80 border border-slate-700/50 text-slate-400 hover:text-white hover:border-slate-600 transition-all duration-200 hover:bg-slate-800 backdrop-blur-sm"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <div>
              <h1 className="text-lg font-semibold text-white flex items-center gap-2.5">
                <div className="p-1.5 rounded-lg bg-sky-500/10">
                  <Package className="w-4.5 h-4.5 text-sky-400" />
                </div>
                {isEdit ? "Ürün Düzenle" : "Yeni Ürün Oluştur"}
              </h1>
              <p className="text-xs text-slate-500 mt-1 ml-[38px]">
                {isEdit
                  ? "Mevcut ürün bilgilerini güncelleyin."
                  : "Kataloğunuza yeni bir ürün ekleyin — adımları takip edin."}
              </p>
            </div>
          </div>

          {/* Progress indicator */}
          <div className="hidden sm:flex items-center gap-3">
            <div className="text-right">
              <p className="text-xs text-slate-500">İlerleme</p>
              <p className="text-sm font-bold text-white">
                {completedSteps}/{totalSteps}
              </p>
            </div>
            <div className="w-12 h-12 relative">
              <svg className="w-12 h-12 -rotate-90" viewBox="0 0 48 48">
                <circle
                  cx="24"
                  cy="24"
                  r="20"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="3"
                  className="text-slate-800"
                />
                <circle
                  cx="24"
                  cy="24"
                  r="20"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="3"
                  className="text-sky-400 transition-all duration-500"
                  strokeDasharray={`${(completedSteps / totalSteps) * 125.6} 125.6`}
                  strokeLinecap="round"
                />
              </svg>
              <span className="absolute inset-0 flex items-center justify-center text-[10px] font-bold text-sky-400">
                {Math.round((completedSteps / totalSteps) * 100)}%
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Main layout: form + sidebar ─────────── */}
      <div className="flex gap-6">
        {/* Form column */}
        <form
          onSubmit={handleSubmit(onSubmit)}
          className="flex-1 min-w-0 space-y-5"
        >
          {/* ── Step 1: Temel Bilgiler ──────────── */}
          <SectionCard
            step={1}
            icon={<Tag className="w-4 h-4 text-sky-400" />}
            iconColor="bg-sky-500/10"
            title="Temel Bilgiler"
            description="Ürün kodu, adı ve sınıflandırma"
            done={step1Done}
          >
            <FormRow cols={2}>
              <Input
                label="Ürün Kodu"
                required
                placeholder="P001"
                error={errors.code?.message}
                prefixIcon={<Hash className="w-3.5 h-3.5" />}
                {...register("code")}
              />
              <Input
                label="Ürün Adı"
                required
                placeholder="Ürün adını girin"
                error={errors.name?.message}
                prefixIcon={<Package className="w-3.5 h-3.5" />}
                {...register("name")}
              />
            </FormRow>
            <FormRow cols={2}>
              <Select
                label="Birim"
                required
                options={unitOptions}
                placeholder="Birim seçin"
                error={errors.unitId?.message}
                {...register("unitId")}
              />
              <Combobox
                label="Kategori"
                options={categoryOptions}
                value={watchAll.categoryId ?? ""}
                onChange={(v) => setValue("categoryId", v)}
                onCreateNew={(name) => {
                  createCategory.mutate(
                    { name },
                    { onSuccess: (c) => setValue("categoryId", c.id) },
                  );
                }}
                createLabel="Yeni kategori"
                placeholder="Kategori seçin veya yazın…"
              />
            </FormRow>
            <FormRow cols={2}>
              <Input
                label="Barkod"
                placeholder="1234567890"
                prefixIcon={<Barcode className="w-3.5 h-3.5" />}
                {...register("barcode")}
              />
              <Select
                label="KDV Oranı"
                options={taxRateOptions}
                {...register("taxRateId")}
              />
            </FormRow>
            <Textarea
              label="Açıklama"
              placeholder="Ürün hakkında kısa bir açıklama…"
              {...register("description")}
            />
            <ImageUploadBox
              label="Ürün görseli"
              description={
                isEdit
                  ? "Mevcut görseli güncelleyin veya kaldırın."
                  : "Ürün kaydedildiğinde bu görsel otomatik yüklenecek."
              }
              previewUrl={visibleImagePreviewUrl}
              fileName={imageFile?.name ?? null}
              status={imageStatus}
              hasImage={hasProductImage}
              disabled={isPending}
              onSelect={() => imageInputRef.current?.click()}
              onClearSelection={imageFile ? clearSelectedImage : undefined}
              onRemove={isEdit && productImage ? removeProductImage : undefined}
            />
            <input
              ref={imageInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={handleImageChange}
            />
          </SectionCard>

          {/* ── Step 2: Fiyatlandırma ───────────── */}
          <SectionCard
            step={2}
            icon={<DollarSign className="w-4 h-4 text-emerald-400" />}
            iconColor="bg-emerald-500/10"
            title="Fiyatlandırma"
            description="Alış, satış fiyatı ve minimum stok seviyesi"
            done={step2Done}
          >
            <FormRow cols={3}>
              <Input
                label="Alış Fiyatı (₺)"
                type="number"
                step="0.01"
                placeholder="0.00"
                {...register("purchasePrice")}
              />
              <Input
                label="Satış Fiyatı (₺)"
                type="number"
                step="0.01"
                placeholder="0.00"
                {...register("salesPrice")}
              />
              <Input
                label="Min. Stok Seviyesi"
                type="number"
                step="0.001"
                placeholder="0"
                {...register("minStockLevel")}
              />
            </FormRow>
          </SectionCard>

          {/* ── Step 3: Başlangıç Stoğu ─────────── */}
          {!isEdit && (
            <SectionCard
              step={3}
              icon={<Warehouse className="w-4 h-4 text-violet-400" />}
              iconColor="bg-violet-500/10"
              title="Başlangıç Stoğu"
              description="Opsiyonel — ürünü bir depoya başlangıç stoğu ile ekleyin"
              done={step3Done}
            >
              <FormRow cols={2}>
                <WarehouseSelect
                  label="Depo"
                  value={watchAll.warehouseId ?? ""}
                  onChange={(value) => setValue("warehouseId", value, { shouldDirty: true, shouldValidate: true })}
                />
                <Input
                  label="Miktar"
                  type="number"
                  step="0.001"
                  placeholder="0"
                  helperText="Boş bırakırsanız stok girişi yapılmaz."
                  {...register("initialStock")}
                />
              </FormRow>
            </SectionCard>
          )}

          {/* ── Sticky action bar ───────────────── */}
          <div className="sticky bottom-0 z-20 -mx-1 px-1 pb-4 pt-3 bg-gradient-to-t from-slate-950 via-slate-950/95 to-transparent">
            <div className="flex items-center justify-between bg-slate-900/80 backdrop-blur-xl border border-slate-800 rounded-xl px-5 py-3">
              <div className="flex items-center gap-2 text-xs text-slate-500">
                {errorCount > 0 ? (
                  <span className="flex items-center gap-1 text-red-400">
                    <AlertCircle className="w-3.5 h-3.5" />
                    {errorCount} hata düzeltilmeli
                  </span>
                ) : step1Done ? (
                  <span className="flex items-center gap-1 text-emerald-400">
                    <Check className="w-3.5 h-3.5" />
                    Kaydetmeye hazır
                  </span>
                ) : (
                  <span>Zorunlu alanları doldurun</span>
                )}
              </div>
              <div className="flex items-center gap-2.5">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  leftIcon={<X className="w-3.5 h-3.5" />}
                  onClick={() => router.back()}
                >
                  İptal
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  loading={isPending}
                  leftIcon={<Save className="w-3.5 h-3.5" />}
                  className="bg-gradient-to-r from-sky-500 to-sky-600 hover:from-sky-400 hover:to-sky-500 shadow-lg shadow-sky-500/20 hover:shadow-sky-500/30"
                >
                  {isEdit ? "Güncelle" : "Ürünü Kaydet"}
                </Button>
              </div>
            </div>
          </div>
        </form>

        {/* ── Sidebar: live preview ─────────────── */}
        <div className="hidden lg:block w-72 shrink-0">
          <div className="sticky top-4 space-y-4">
            <LivePreview
              name={watchAll.name ?? ""}
              code={watchAll.code ?? ""}
              category={selectedCategory?.name ?? ""}
              purchasePrice={watchAll.purchasePrice ?? "0"}
              salesPrice={watchAll.salesPrice ?? "0"}
              unit={
                selectedUnit
                  ? `${selectedUnit.name} (${selectedUnit.code})`
                  : ""
              }
              imagePreviewUrl={visibleImagePreviewUrl}
            />

            {/* Tips card */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
              <p className="text-xs font-semibold text-slate-400 mb-2">
                İpuçları
              </p>
              <ul className="space-y-1.5 text-[11px] text-slate-500 leading-relaxed">
                <li>• Ürün kodu benzersiz olmalıdır</li>
                <li>• Kategori bulamazsanız yeni oluşturabilirsiniz</li>
                <li>• Başlangıç stoğu sonradan da eklenebilir</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
