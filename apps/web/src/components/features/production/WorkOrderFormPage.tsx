'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { PageHeader } from '@/components/shared/PageHeader';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { FormRow } from '@/components/shared/FormField';
import { Textarea } from '@/components/ui/Textarea';
import { useCreateWorkOrder } from '@/hooks/useProduction';

export function WorkOrderFormPage() {
  const router = useRouter();
  const create = useCreateWorkOrder();

  const [form, setForm] = useState({
    productId: '', bomId: '', plannedQty: '',
    startDate: '', endDate: '', notes: '',
    inputWarehouseId: '', outputWarehouseId: '',
  });

  const handleSubmit = () => {
    if (!form.productId || !form.plannedQty) return;
    create.mutate({
      productId: form.productId,
      bomId: form.bomId || undefined,
      plannedQty: Number(form.plannedQty),
      startDate: form.startDate || undefined,
      endDate: form.endDate || undefined,
      notes: form.notes || undefined,
      inputWarehouseId: form.inputWarehouseId || undefined,
      outputWarehouseId: form.outputWarehouseId || undefined,
    }, {
      onSuccess: () => router.push('/dashboard/production/work-orders'),
    });
  };

  return (
    <div className="max-w-2xl">
      <PageHeader title="Yeni İş Emri" subtitle="Üretim iş emri oluşturun." />

      <div className="space-y-6 bg-slate-900 border border-slate-800 rounded-xl p-6">
        <FormRow cols={2}>
          <Input label="Ürün ID" required placeholder="Üretilecek ürün" value={form.productId} onChange={(e) => setForm((p) => ({ ...p, productId: e.target.value }))} />
          <Input label="BOM ID" placeholder="Opsiyonel — BOM seçilirse malzemeler otomatik eklenir" value={form.bomId} onChange={(e) => setForm((p) => ({ ...p, bomId: e.target.value }))} />
        </FormRow>

        <Input label="Planlanan Miktar" required type="number" placeholder="ör. 100" value={form.plannedQty} onChange={(e) => setForm((p) => ({ ...p, plannedQty: e.target.value }))} />

        <FormRow cols={2}>
          <Input label="Başlangıç Tarihi" type="date" value={form.startDate} onChange={(e) => setForm((p) => ({ ...p, startDate: e.target.value }))} />
          <Input label="Bitiş Tarihi" type="date" value={form.endDate} onChange={(e) => setForm((p) => ({ ...p, endDate: e.target.value }))} />
        </FormRow>

        <FormRow cols={2}>
          <Input label="Girdi Deposu ID" placeholder="Hammadde deposu" value={form.inputWarehouseId} onChange={(e) => setForm((p) => ({ ...p, inputWarehouseId: e.target.value }))} />
          <Input label="Çıktı Deposu ID" placeholder="Mamul deposu" value={form.outputWarehouseId} onChange={(e) => setForm((p) => ({ ...p, outputWarehouseId: e.target.value }))} />
        </FormRow>

        <Textarea label="Notlar" placeholder="Opsiyonel açıklama" value={form.notes} onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))} />

        <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-800">
          <Button variant="ghost" size="sm" onClick={() => router.back()}>İptal</Button>
          <Button size="sm" loading={create.isPending} disabled={!form.productId || !form.plannedQty} onClick={handleSubmit}>
            İş Emri Oluştur
          </Button>
        </div>
      </div>
    </div>
  );
}
