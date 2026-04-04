'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Plus, Trash2, ArrowLeft } from 'lucide-react';
import { PageHeader } from '@/components/shared/PageHeader';
import { FormRow, FormSection } from '@/components/shared/FormField';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Textarea } from '@/components/ui/Textarea';
import { Button } from '@/components/ui/Button';
import { useCreateInvoice } from '@/hooks/useSales';
import { useContacts } from '@/hooks/useContacts';
import { useTaxRates } from '@/hooks/useMasterData';
import { formatCurrency } from '@/lib/utils';

// ─────────────────────────────────────────────
// Schema
// ─────────────────────────────────────────────

const lineSchema = z.object({
  description: z.string().min(1, 'Açıklama zorunludur'),
  productId: z.string().optional(),
  taxRateId: z.string().optional(),
  quantity: z.string().min(1, 'Miktar zorunludur'),
  unitPrice: z.string().min(1, 'Birim fiyat zorunludur'),
  discount: z.string().optional(),
});

const invoiceSchema = z.object({
  contactId: z.string().min(1, 'Cari seçiniz'),
  type: z.enum(['SALES', 'PURCHASE', 'RETURN_SALES', 'RETURN_PURCHASE']),
  date: z.string().min(1, 'Tarih zorunludur'),
  dueDate: z.string().optional(),
  notes: z.string().optional(),
  lines: z.array(lineSchema).min(1, 'En az bir kalem ekleyin'),
});

type InvoiceForm = z.infer<typeof invoiceSchema>;

const TYPE_OPTIONS = [
  { value: 'SALES', label: 'Satış Faturası' },
  { value: 'PURCHASE', label: 'Alış Faturası' },
  { value: 'RETURN_SALES', label: 'Satış İade' },
  { value: 'RETURN_PURCHASE', label: 'Alış İade' },
];

// ─────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────

export function InvoiceFormPage() {
  const router = useRouter();
  const createInvoice = useCreateInvoice();
  const { data: contactsData } = useContacts({ limit: 200 });
  const { data: taxRates = [] } = useTaxRates();

  const contactOptions = (contactsData?.data ?? []).map((c) => ({ value: c.id, label: c.name }));
  const taxRateOptions = [
    { value: '', label: '— KDV yok —' },
    ...taxRates.map((t) => ({ value: t.id, label: `${t.name} (%${t.rate})` })),
  ];

  const { register, control, handleSubmit, watch, formState: { errors } } = useForm<InvoiceForm>({
    resolver: zodResolver(invoiceSchema),
    defaultValues: {
      type: 'SALES',
      date: new Date().toISOString().split('T')[0],
      lines: [{ description: '', quantity: '1', unitPrice: '0', discount: '0' }],
    },
  });

  const { fields, append, remove } = useFieldArray({ control, name: 'lines' });
  const watchedLines = watch('lines');

  // Live totals
  const totals = watchedLines.reduce(
    (acc, line) => {
      const qty = Number(line.quantity) || 0;
      const price = Number(line.unitPrice) || 0;
      const disc = Number(line.discount) || 0;
      const net = qty * price * (1 - disc / 100);
      const taxRate = taxRates.find((t) => t.id === line.taxRateId);
      const tax = net * ((taxRate?.rate ?? 0) / 100);
      return { net: acc.net + net, tax: acc.tax + tax };
    },
    { net: 0, tax: 0 },
  );

  const onSubmit = (data: InvoiceForm) => {
    const payload = {
      contactId: data.contactId,
      type: data.type,
      date: data.date,
      dueDate: data.dueDate || undefined,
      notes: data.notes || undefined,
      lines: data.lines.map((l) => ({
        description: l.description,
        productId: l.productId || undefined,
        taxRateId: l.taxRateId || undefined,
        quantity: Number(l.quantity),
        unitPrice: Number(l.unitPrice),
        discount: Number(l.discount) || 0,
      })),
    };
    createInvoice.mutate(payload, { onSuccess: (inv) => router.push(`/dashboard/invoices/${inv.id}`) });
  };

  return (
    <div>
      <PageHeader
        title="Yeni Fatura"
        action={<Button variant="ghost" leftIcon={<ArrowLeft className="w-4 h-4" />} onClick={() => router.back()}>Geri</Button>}
      />

      <form onSubmit={handleSubmit(onSubmit)} className="max-w-4xl space-y-6">
        <FormSection title="Fatura Bilgileri">
          <FormRow cols={2}>
            <Select label="Cari" required options={contactOptions} placeholder="Cari seçin" error={errors.contactId?.message} {...register('contactId')} />
            <Select label="Fatura Tipi" required options={TYPE_OPTIONS} error={errors.type?.message} {...register('type')} />
          </FormRow>
          <FormRow cols={2}>
            <Input label="Tarih" required type="date" error={errors.date?.message} {...register('date')} />
            <Input label="Vade Tarihi" type="date" {...register('dueDate')} />
          </FormRow>
        </FormSection>

        <FormSection title="Fatura Kalemleri">
          <div className="space-y-3">
            {/* Header */}
            <div className="hidden sm:grid grid-cols-12 gap-2 px-1 text-xs font-semibold text-slate-500 uppercase tracking-wider">
              <div className="col-span-4">Açıklama</div>
              <div className="col-span-2 text-right">Miktar</div>
              <div className="col-span-2 text-right">Birim Fiyat</div>
              <div className="col-span-1 text-right">İsk.%</div>
              <div className="col-span-2">KDV</div>
              <div className="col-span-1" />
            </div>

            {fields.map((field, idx) => {
              const line = watchedLines[idx];
              const qty = Number(line?.quantity) || 0;
              const price = Number(line?.unitPrice) || 0;
              const disc = Number(line?.discount) || 0;
              const net = qty * price * (1 - disc / 100);
              const taxRate = taxRates.find((t) => t.id === line?.taxRateId);
              const lineTotal = net + net * ((taxRate?.rate ?? 0) / 100);

              return (
                <div key={field.id} className="grid grid-cols-12 gap-2 items-start bg-slate-800/30 rounded-lg p-3">
                  <div className="col-span-12 sm:col-span-4">
                    <Input placeholder="Ürün / hizmet açıklaması" error={errors.lines?.[idx]?.description?.message} {...register(`lines.${idx}.description`)} />
                  </div>
                  <div className="col-span-4 sm:col-span-2">
                    <Input type="number" step="0.001" placeholder="1" error={errors.lines?.[idx]?.quantity?.message} {...register(`lines.${idx}.quantity`)} />
                  </div>
                  <div className="col-span-4 sm:col-span-2">
                    <Input type="number" step="0.01" placeholder="0.00" error={errors.lines?.[idx]?.unitPrice?.message} {...register(`lines.${idx}.unitPrice`)} />
                  </div>
                  <div className="col-span-4 sm:col-span-1">
                    <Input type="number" step="0.01" placeholder="0" {...register(`lines.${idx}.discount`)} />
                  </div>
                  <div className="col-span-10 sm:col-span-2">
                    <Select options={taxRateOptions} {...register(`lines.${idx}.taxRateId`)} />
                  </div>
                  <div className="col-span-2 sm:col-span-1 flex items-center justify-end gap-1 pt-1">
                    <span className="text-xs text-slate-400 hidden sm:block">{formatCurrency(lineTotal)}</span>
                    {fields.length > 1 && (
                      <button type="button" onClick={() => remove(idx)} className="p-1.5 text-slate-500 hover:text-red-400 transition-colors">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}

            <Button
              type="button"
              variant="ghost"
              size="sm"
              leftIcon={<Plus className="w-3.5 h-3.5" />}
              onClick={() => append({ description: '', quantity: '1', unitPrice: '0', discount: '0' })}
            >
              Kalem Ekle
            </Button>
          </div>

          {/* Totals */}
          <div className="flex justify-end mt-4">
            <div className="w-64 space-y-2 text-sm">
              <div className="flex justify-between text-slate-400"><span>Net Tutar</span><span>{formatCurrency(totals.net)}</span></div>
              <div className="flex justify-between text-slate-400"><span>KDV</span><span>{formatCurrency(totals.tax)}</span></div>
              <div className="flex justify-between text-white font-semibold text-base border-t border-slate-700 pt-2">
                <span>Genel Toplam</span><span>{formatCurrency(totals.net + totals.tax)}</span>
              </div>
            </div>
          </div>
        </FormSection>

        <FormSection title="Notlar">
          <Textarea placeholder="Fatura notu…" {...register('notes')} />
        </FormSection>

        <div className="flex gap-3 pt-2">
          <Button type="submit" loading={createInvoice.isPending}>Fatura Oluştur</Button>
          <Button type="button" variant="ghost" onClick={() => router.back()}>İptal</Button>
        </div>
      </form>
    </div>
  );
}
