"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/shared/PageHeader";
import { BomSelect, ProductSelect, WarehouseSelect } from "@/components/shared/EntitySelect";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { DatePicker } from "@/components/ui/DatePicker";
import { FormRow } from "@/components/shared/FormField";
import { Textarea } from "@/components/ui/Textarea";
import { useCreateWorkOrder } from "@/hooks/useProduction";

export function WorkOrderFormPage() {
  const router = useRouter();
  const create = useCreateWorkOrder();

  const [form, setForm] = useState({
    productId: "",
    bomId: "",
    plannedQty: "",
    startDate: "",
    endDate: "",
    notes: "",
    inputWarehouseId: "",
    outputWarehouseId: "",
  });

  const handleSubmit = () => {
    if (!form.productId || !form.plannedQty) return;
    create.mutate(
      {
        productId: form.productId,
        bomId: form.bomId || undefined,
        plannedQty: Number(form.plannedQty),
        startDate: form.startDate || undefined,
        endDate: form.endDate || undefined,
        notes: form.notes || undefined,
        inputWarehouseId: form.inputWarehouseId || undefined,
        outputWarehouseId: form.outputWarehouseId || undefined,
      },
      {
        onSuccess: () => router.push("/dashboard/production/work-orders"),
      },
    );
  };

  return (
    <div className="max-w-2xl">
      <PageHeader title="Yeni İş Emri" subtitle="Üretim iş emri oluşturun." />

      <div className="space-y-6 bg-slate-900 border border-slate-800 rounded-xl p-6">
        <FormRow cols={2}>
          <ProductSelect
            label="Ürün"
            required
            value={form.productId}
            onChange={(value) => setForm((p) => ({ ...p, productId: value }))}
          />
          <BomSelect
            label="BOM"
            value={form.bomId}
            onChange={(value) => setForm((p) => ({ ...p, bomId: value }))}
          />
        </FormRow>

        <Input
          label="Planlanan Miktar"
          required
          type="number"
          placeholder="ör. 100"
          value={form.plannedQty}
          onChange={(e) => setForm((p) => ({ ...p, plannedQty: e.target.value }))}
        />

        <FormRow cols={2}>
          <DatePicker
            label="Başlangıç Tarihi"
            value={form.startDate}
            onValueChange={(value) => setForm((p) => ({ ...p, startDate: value ?? "" }))}
          />
          <DatePicker
            label="Bitiş Tarihi"
            value={form.endDate}
            onValueChange={(value) => setForm((p) => ({ ...p, endDate: value ?? "" }))}
          />
        </FormRow>

        <FormRow cols={2}>
          <WarehouseSelect
            label="Girdi Deposu"
            value={form.inputWarehouseId}
            onChange={(value) => setForm((p) => ({ ...p, inputWarehouseId: value }))}
          />
          <WarehouseSelect
            label="Çıktı Deposu"
            value={form.outputWarehouseId}
            onChange={(value) => setForm((p) => ({ ...p, outputWarehouseId: value }))}
          />
        </FormRow>

        <Textarea
          label="Notlar"
          placeholder="Opsiyonel açıklama"
          value={form.notes}
          onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
        />

        <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-800">
          <Button variant="ghost" size="sm" onClick={() => router.back()}>
            İptal
          </Button>
          <Button
            size="sm"
            loading={create.isPending}
            disabled={!form.productId || !form.plannedQty}
            onClick={handleSubmit}
          >
            İş Emri Oluştur
          </Button>
        </div>
      </div>
    </div>
  );
}
