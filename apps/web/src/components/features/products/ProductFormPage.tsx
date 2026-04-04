'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { ArrowLeft } from 'lucide-react';
import { PageHeader } from '@/components/shared/PageHeader';
import { FormRow, FormSection } from '@/components/shared/FormField';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Combobox } from '@/components/ui/Combobox';
import { Textarea } from '@/components/ui/Textarea';
import { Button } from '@/components/ui/Button';
import { FullPageSpinner } from '@/components/ui/Spinner';
import { useProduct, useCreateProduct, useUpdateProduct } from '@/hooks/useProducts';
import { useUnits, useCategories, useTaxRates, useCreateCategory } from '@/hooks/useMasterData';
import { useWarehouses } from '@/hooks/useStock';
import { createManualMovement } from '@/services/stock.service';
import { useUIStore } from '@/store/ui.store';

// ─────────────────────────────────────────────
// Schema
// ─────────────────────────────────────────────

const productSchema = z.object({
  code: z.string().min(1, 'Kod zorunludur'),
  name: z.string().min(1, 'Ad zorunludur'),
  unitId: z.string().min(1, 'Birim seçiniz'),
  categoryId: z.string().optional(),
  taxRateId: z.string().optional(),
  barcode: z.string().optional(),
  description: z.string().optional(),
  purchasePrice: z.string().optional(),
  salesPrice: z.string().optional(),
  minStockLevel: z.string().optional(),
  // Başlangıç stoğu (opsiyonel, sadece yeni ürün)
  initialStock: z.string().optional(),
  warehouseId: z.string().optional(),
});

type ProductForm = z.infer<typeof productSchema>;

// ─────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────

interface Props { editId?: string }

export function ProductFormPage({ editId }: Props) {
  const router = useRouter();
  const isEdit = !!editId;

  const { data: existing, isLoading: loadingExisting } = useProduct(editId ?? '');
  const createProduct = useCreateProduct();
  const updateProduct = useUpdateProduct(editId ?? '');

  const { data: units = [] } = useUnits();
  const { data: categories = [] } = useCategories();
  const { data: taxRates = [] } = useTaxRates();
  const { data: warehouses = [] } = useWarehouses();
  const { toast } = useUIStore();

  const unitOptions = units.map((u) => ({ value: u.id, label: `${u.name} (${u.code})` }));
  const categoryOptions = categories.map((c) => ({ value: c.id, label: c.name }));
  const taxRateOptions = [{ value: '', label: '— KDV yok —' }, ...taxRates.map((t) => ({ value: t.id, label: `${t.name} (%${t.rate})` }))];
  const warehouseOptions = [{ value: '', label: '— Depo seçin —' }, ...warehouses.map((w) => ({ value: w.id, label: `${w.name} (${w.code})` }))];

  const createCategory = useCreateCategory();

  const { register, handleSubmit, reset, setValue, watch, formState: { errors } } = useForm<ProductForm>({
    resolver: zodResolver(productSchema),
    defaultValues: { purchasePrice: '0', salesPrice: '0', minStockLevel: '0' },
  });

  useEffect(() => {
    if (existing) {
      reset({
        code: existing.code,
        name: existing.name,
        unitId: existing.unitId,
        categoryId: existing.categoryId ?? '',
        taxRateId: existing.taxRateId ?? '',
        barcode: existing.barcode ?? '',
        description: existing.description ?? '',
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
      updateProduct.mutate(payload, { onSuccess: () => router.push(`/dashboard/products/${editId}`) });
    } else {
      createProduct.mutate(payload, {
        onSuccess: async (p) => {
          // Başlangıç stoğu varsa stok hareketi oluştur
          const qty = Number(data.initialStock);
          const wId = data.warehouseId;
          if (qty > 0 && wId) {
            try {
              await createManualMovement({
                productId: p.id,
                type: 'OPENING',
                quantity: qty,
                warehouseId: wId,
                unitCost: payload.purchasePrice,
                notes: 'Ürün oluşturma — başlangıç stoğu',
              });
              toast.success(`${qty} adet başlangıç stoğu eklendi.`);
            } catch {
              toast.warning('Ürün oluşturuldu ama stok girişi yapılamadı.');
            }
          }
          router.push(`/dashboard/products/${p.id}`);
        },
      });
    }
  };

  if (isEdit && loadingExisting) return <FullPageSpinner />;

  const isPending = createProduct.isPending || updateProduct.isPending;

  return (
    <div>
      <PageHeader
        title={isEdit ? 'Ürün Düzenle' : 'Yeni Ürün'}
        action={<Button variant="ghost" leftIcon={<ArrowLeft className="w-4 h-4" />} onClick={() => router.back()}>Geri</Button>}
      />

      <form onSubmit={handleSubmit(onSubmit)} className="max-w-2xl space-y-6">
        <FormSection title="Temel Bilgiler">
          <FormRow cols={2}>
            <Input label="Kod" required placeholder="P001" error={errors.code?.message} {...register('code')} />
            <Input label="Ad" required placeholder="Ürün adı" error={errors.name?.message} {...register('name')} />
          </FormRow>
          <FormRow cols={2}>
            <Select label="Birim" required options={unitOptions} placeholder="Birim seçin" error={errors.unitId?.message} {...register('unitId')} />
            <Combobox
              label="Kategori"
              options={categoryOptions}
              value={watch('categoryId') ?? ''}
              onChange={(v) => setValue('categoryId', v)}
              onCreateNew={(name) => {
                createCategory.mutate({ name }, {
                  onSuccess: (newCat) => setValue('categoryId', newCat.id),
                });
              }}
              createLabel="Yeni kategori"
              placeholder="Kategori seçin veya yazın…"
            />
          </FormRow>
          <FormRow cols={2}>
            <Input label="Barkod" placeholder="1234567890" {...register('barcode')} />
            <Select label="KDV Oranı" options={taxRateOptions} {...register('taxRateId')} />
          </FormRow>
          <Textarea label="Açıklama" placeholder="Ürün açıklaması…" {...register('description')} />
        </FormSection>

        <FormSection title="Fiyatlandırma">
          <FormRow cols={3}>
            <Input label="Alış Fiyatı (₺)" type="number" step="0.01" placeholder="0.00" {...register('purchasePrice')} />
            <Input label="Satış Fiyatı (₺)" type="number" step="0.01" placeholder="0.00" {...register('salesPrice')} />
            <Input label="Min. Stok" type="number" step="0.001" placeholder="0" {...register('minStockLevel')} />
          </FormRow>
        </FormSection>

        {!isEdit && (
          <FormSection title="Başlangıç Stoğu" description="Opsiyonel — ürünü bir depoya başlangıç stoğu ile ekleyin.">
            <FormRow cols={2}>
              <Select label="Depo" options={warehouseOptions} {...register('warehouseId')} />
              <Input label="Miktar" type="number" step="0.001" placeholder="0" helperText="Boş bırakırsanız stok girişi yapılmaz." {...register('initialStock')} />
            </FormRow>
          </FormSection>
        )}

        <div className="flex gap-3 pt-2">
          <Button type="submit" loading={isPending}>{isEdit ? 'Güncelle' : 'Kaydet'}</Button>
          <Button type="button" variant="ghost" onClick={() => router.back()}>İptal</Button>
        </div>
      </form>
    </div>
  );
}
