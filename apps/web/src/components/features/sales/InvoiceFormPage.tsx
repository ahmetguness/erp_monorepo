'use client';

import { useEffect, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useForm, useFieldArray, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  ArrowLeft, Receipt, Users, Plus, Trash2, Save, X,
  Hash, DollarSign, Percent, ShoppingCart,
  FileText, ArrowDownToLine, ArrowUpFromLine,
} from 'lucide-react';
import { Input } from '@/components/ui/Input';
import { DatePicker } from '@/components/ui/DatePicker';
import { Select } from '@/components/ui/Select';
import { Textarea } from '@/components/ui/Textarea';
import { Button } from '@/components/ui/Button';
import { FormRow } from '@/components/shared/FormField';
import { ContactSelect, ProductSelect } from '@/components/shared/EntitySelect';
import { SmartFormSidePanel, type SmartFormLine } from '@/components/shared/SmartFormSidePanel';
import { useCreateInvoice, useSalesOrder, useSalesOrders, useSalesQuotes } from '@/hooks/useSales';
import { useStockLevels } from '@/hooks/useStock';
import { useContacts } from '@/hooks/useContacts';
import { useProducts } from '@/hooks/useProducts';
import { useTaxRates } from '@/hooks/useMasterData';
import { useBusinessRules } from '@/hooks/useSettings';
import {
  applyServerFieldErrors,
  isSubmitLocked,
  optionalPercentString,
  optionalText,
  parseDecimalInput,
  requiredDateString,
  requiredNonNegativeMoneyString,
  requiredQuantityString,
  useDirtyStateWarning,
} from '@/lib/form-standard';
import { cn, formatCurrency } from '@/lib/utils';
import type { BusinessRule } from '@/services/settings.service';
import type { InvoiceLineDTO } from '@/services/sales.service';

// ─────────────────────────────────────────────
// Schema
// ─────────────────────────────────────────────

const lineSchema = z.object({
  description: z.string().min(1, 'Açıklama zorunludur'),
  productId: z.string().optional(),
  taxRateId: z.string().optional(),
  withholdingRateId: z.string().optional(),
  quantity: requiredQuantityString(),
  unitPrice: requiredNonNegativeMoneyString('Birim fiyat negatif olamaz'),
  discount: optionalPercentString(),
});

const invoiceSchema = z.object({
  contactId: z.string().min(1, 'Cari seçiniz'),
  type: z.enum(['SALES', 'PURCHASE', 'RETURN_SALES', 'RETURN_PURCHASE']),
  date: requiredDateString('Tarih zorunludur'),
  dueDate: z.string().optional(),
  notes: z.string().optional(),
  lines: z.array(lineSchema).min(1, 'En az bir kalem ekleyin'),
});

type InvoiceForm = z.infer<typeof invoiceSchema>;
const INVOICE_FORM_SERVER_FIELDS = ['contactId', 'type', 'date', 'dueDate', 'notes', 'lines'] as const satisfies readonly (keyof InvoiceForm)[];

function addDaysString(dateValue: string, days: number): string {
  const date = new Date(dateValue);
  date.setDate(date.getDate() + days);
  return date.toISOString().split('T')[0];
}

function getNumberRule(rules: BusinessRule[], key: BusinessRule['key'], fallback: number): number {
  const rule = rules.find((item) => item.key === key);
  return typeof rule?.value === 'number' ? rule.value : fallback;
}

function findTaxRateIdByRate(taxRates: Array<{ id: string; rate: number }>, rate: number): string {
  return taxRates.find((taxRate) => Number(taxRate.rate) === Number(rate))?.id ?? '';
}

// ─────────────────────────────────────────────
// Type selector config
// ─────────────────────────────────────────────

const INVOICE_TYPES = [
  { value: 'SALES', label: 'Satış', icon: ArrowUpFromLine, color: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/30', ring: 'ring-emerald-500/20' },
  { value: 'PURCHASE', label: 'Alış', icon: ArrowDownToLine, color: 'text-sky-400', bg: 'bg-sky-500/10', border: 'border-sky-500/30', ring: 'ring-sky-500/20' },
  { value: 'RETURN_SALES', label: 'Satış İade', icon: ArrowDownToLine, color: 'text-amber-400', bg: 'bg-amber-500/10', border: 'border-amber-500/30', ring: 'ring-amber-500/20' },
  { value: 'RETURN_PURCHASE', label: 'Alış İade', icon: ArrowUpFromLine, color: 'text-violet-400', bg: 'bg-violet-500/10', border: 'border-violet-500/30', ring: 'ring-violet-500/20' },
] as const;

// ─────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────

export function InvoiceFormPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialContactId = searchParams.get('contactId') ?? '';
  const sourceSalesOrderId = searchParams.get('salesOrderId') ?? '';
  const createInvoice = useCreateInvoice();
  const { data: sourceSalesOrder } = useSalesOrder(sourceSalesOrderId);
  const { data: contactsData } = useContacts({ limit: 200 });
  const { data: productsData } = useProducts({ page: 1, limit: 200 });
  const { data: taxRates = [] } = useTaxRates();
  const { data: businessRules = [] } = useBusinessRules();

  const contacts = contactsData?.data ?? [];
  const products = productsData?.data ?? [];

  const vatRateOptions = [{ value: '', label: '— KDV yok —' }, ...taxRates.filter((t) => !t.isWithholding).map((t) => ({ value: t.id, label: `${t.name} (%${t.rate})` }))];
  const withholdingRateOptions = [{ value: '', label: '— Stopaj yok —' }, ...taxRates.filter((t) => t.isWithholding).map((t) => ({ value: t.id, label: `${t.name} (%${t.rate})` }))];

  const today = new Date().toISOString().split('T')[0];

  const { register, control, handleSubmit, setValue, setError, formState: { errors, dirtyFields, isDirty, isSubmitting } } = useForm<InvoiceForm>({
    resolver: zodResolver(invoiceSchema),
    defaultValues: {
      type: 'SALES', date: today, dueDate: addDaysString(today, 30),
      lines: [{ description: '', quantity: '1', unitPrice: '0', discount: '0', taxRateId: '', withholdingRateId: '' }],
    },
  });

  const { fields, append, remove, replace } = useFieldArray({ control, name: 'lines' });
  const sourceOrderAppliedRef = useRef<string | null>(null);
  const initialContactAppliedRef = useRef(false);
  useDirtyStateWarning(isDirty && !createInvoice.isSuccess);
  const watchedLines = useWatch({ control, name: 'lines' }) ?? [];
  const watchType = useWatch({ control, name: 'type' });
  const watchContact = useWatch({ control, name: 'contactId' });
  const watchDate = useWatch({ control, name: 'date' });
  const watchDueDate = useWatch({ control, name: 'dueDate' });
  const invoiceDueDays = getNumberRule(businessRules, 'invoicing.invoice_due_days', 30);
  const { data: openQuotesData } = useSalesQuotes(
    { page: 1, limit: 5, contactId: watchContact || undefined, status: 'DRAFT' },
    { enabled: Boolean(watchContact) },
  );
  const { data: openOrdersData } = useSalesOrders(
    { page: 1, limit: 5, contactId: watchContact || undefined, status: 'CONFIRMED' },
    { enabled: Boolean(watchContact) },
  );
  const selectedProductIds = watchedLines.map((line) => line.productId).filter(Boolean);
  const { data: stockLevels = [], isLoading: stockLoading } = useStockLevels({}, { enabled: selectedProductIds.length > 0 });

  useEffect(() => {
    if (!watchDate || dirtyFields.dueDate) return;
    setValue('dueDate', addDaysString(watchDate, invoiceDueDays), { shouldDirty: false, shouldValidate: true });
  }, [dirtyFields.dueDate, invoiceDueDays, setValue, watchDate]);

  useEffect(() => {
    if (!initialContactId || sourceSalesOrderId || initialContactAppliedRef.current) return;
    setValue('contactId', initialContactId, { shouldDirty: false, shouldValidate: true });
    initialContactAppliedRef.current = true;
  }, [initialContactId, setValue, sourceSalesOrderId]);

  useEffect(() => {
    if (!sourceSalesOrder || sourceOrderAppliedRef.current === sourceSalesOrder.id) return;
    if ((sourceSalesOrder.items ?? []).some((item) => Number(item.taxRate) > 0) && taxRates.length === 0) return;

    setValue('type', 'SALES', { shouldDirty: false, shouldValidate: true });
    setValue('contactId', sourceSalesOrder.contactId, { shouldDirty: false, shouldValidate: true });
    setValue('notes', `Siparisten olusturuldu: ${sourceSalesOrder.number}`, { shouldDirty: false });
    replace((sourceSalesOrder.items ?? []).map((item) => ({
      productId: item.productId,
      description: item.description ?? item.product?.name ?? sourceSalesOrder.number,
      quantity: String(item.quantity),
      unitPrice: String(item.unitPrice),
      discount: String(item.discount ?? 0),
      taxRateId: findTaxRateIdByRate(taxRates, item.taxRate),
      withholdingRateId: '',
    })));
    sourceOrderAppliedRef.current = sourceSalesOrder.id;
  }, [replace, setValue, sourceSalesOrder, taxRates]);

  const selectedContact = contacts.find((c) => c.id === watchContact);
  const activeType = INVOICE_TYPES.find((t) => t.value === watchType) ?? INVOICE_TYPES[0];

  // Line totals
  const lineTotals = watchedLines.map((line) => {
    const qty = parseDecimalInput(line.quantity);
    const price = parseDecimalInput(line.unitPrice);
    const disc = parseDecimalInput(line.discount);
    const net = qty * price * (1 - disc / 100);
    const taxRate = taxRates.find((t) => t.id === line.taxRateId);
    const taxAmt = net * ((taxRate?.rate ?? 0) / 100);
    const withholdingRate = taxRates.find((t) => t.id === line.withholdingRateId);
    const withholdingAmt = net * ((withholdingRate?.rate ?? 0) / 100);
    return { net, taxAmt, withholdingAmt, gross: net + taxAmt - withholdingAmt };
  });
  const totalNet = lineTotals.reduce((s, l) => s + l.net, 0);
  const totalTax = lineTotals.reduce((s, l) => s + l.taxAmt, 0);
  const totalWithholding = lineTotals.reduce((s, l) => s + l.withholdingAmt, 0);
  const totalGross = totalNet + totalTax - totalWithholding;
  const smartLines: SmartFormLine[] = watchedLines.map((line, index) => ({
    productId: line.productId || undefined,
    quantity: parseDecimalInput(line.quantity),
    unitPrice: parseDecimalInput(line.unitPrice),
    discount: parseDecimalInput(line.discount),
    net: lineTotals[index]?.net ?? 0,
    gross: lineTotals[index]?.gross ?? 0,
  }));

  const handleProductSelect = (idx: number, productId: string) => {
    setValue(`lines.${idx}.productId`, productId, { shouldDirty: true, shouldValidate: true });
    const product = products.find((p) => p.id === productId);
    if (product) {
      setValue(`lines.${idx}.description`, product.name);
      setValue(`lines.${idx}.unitPrice`, String(product.salesPrice));
    }
  };

  const onSubmit = (data: InvoiceForm) => {
    createInvoice.mutate({
      contactId: data.contactId, type: data.type, date: data.date,
      salesOrderId: optionalText(sourceSalesOrderId),
      dueDate: optionalText(data.dueDate), notes: optionalText(data.notes),
      lines: data.lines.map((l) => ({
        description: l.description, productId: optionalText(l.productId),
        taxRateId: optionalText(l.taxRateId), 
        withholdingRateId: optionalText(l.withholdingRateId),
        quantity: parseDecimalInput(l.quantity),
        unitPrice: parseDecimalInput(l.unitPrice), discount: parseDecimalInput(l.discount),
      } satisfies InvoiceLineDTO)),
    }, {
      onSuccess: (inv) => router.push(`/dashboard/invoices/${inv.id}`),
      onError: (error) => {
        applyServerFieldErrors<InvoiceForm>(error, setError, INVOICE_FORM_SERVER_FIELDS);
      },
    });
  };

  return (
    <div>
      {/* ── Header banner ───────────────────────── */}
      <div className="relative overflow-hidden bg-gradient-to-r from-emerald-600/10 via-slate-900 to-sky-600/5 border border-slate-800 rounded-2xl p-5 mb-6">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_rgba(16,185,129,0.06)_0%,transparent_60%)]" />
        <div className="relative z-10 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button type="button" onClick={() => router.back()}
              className="p-2.5 rounded-xl bg-slate-800/80 border border-slate-700/50 text-slate-400 hover:text-white hover:border-slate-600 transition-all backdrop-blur-sm">
              <ArrowLeft className="w-4 h-4" />
            </button>
            <div>
              <h1 className="text-lg font-semibold text-white flex items-center gap-2.5">
                <div className="p-1.5 rounded-lg bg-emerald-500/10"><Receipt className="w-4 h-4 text-emerald-400" /></div>
                Yeni Fatura Oluştur
              </h1>
              <p className="text-xs text-slate-500 mt-1 ml-[38px]">Satış veya alış faturası düzenleyin.</p>
            </div>
          </div>
          {totalGross > 0 && (
            <div className="hidden sm:block text-right">
              <p className="text-[10px] text-slate-500 uppercase tracking-wider">Toplam</p>
              <p className="text-xl font-bold text-emerald-400 tabular-nums">{formatCurrency(totalGross)}</p>
            </div>
          )}
        </div>
      </div>

      <form onSubmit={handleSubmit(onSubmit)}>
        <div className="flex gap-6">
          {/* ── Left: main form ─────────────────── */}
          <div className="flex-1 min-w-0 space-y-5">

            {/* ── Fatura Tipi ──────────────────── */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
              <div className="flex items-center gap-3 px-5 py-3.5 border-b border-slate-800/60">
                <div className="p-2 rounded-lg bg-violet-500/10"><FileText className="w-4 h-4 text-violet-400" /></div>
                <div>
                  <h3 className="text-sm font-semibold text-white">Fatura Tipi</h3>
                  <p className="text-xs text-slate-500 mt-0.5">Fatura türünü seçin</p>
                </div>
              </div>
              <div className="p-5">
                <div className="grid grid-cols-4 gap-2">
                  {INVOICE_TYPES.map((t) => {
                    const Icon = t.icon;
                    const active = watchType === t.value;
                    return (
                      <button key={t.value} type="button" onClick={() => setValue('type', t.value as InvoiceForm['type'])}
                        className={cn(
                          'flex flex-col items-center gap-1.5 p-3 rounded-xl border transition-all duration-200',
                          active ? `${t.bg} ${t.border} ring-2 ${t.ring}` : 'border-slate-800 bg-slate-800/40 hover:border-slate-700 hover:bg-slate-800/70',
                        )}>
                        <Icon className={cn('w-5 h-5', active ? t.color : 'text-slate-500')} />
                        <span className={cn('text-xs font-medium', active ? t.color : 'text-slate-500')}>{t.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* ── Fatura Bilgileri ──────────────── */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
              <div className="flex items-center gap-3 px-5 py-3.5 border-b border-slate-800/60">
                <div className="p-2 rounded-lg bg-sky-500/10"><Users className="w-4 h-4 text-sky-400" /></div>
                <div>
                  <h3 className="text-sm font-semibold text-white">Fatura Bilgileri</h3>
                  <p className="text-xs text-slate-500 mt-0.5">Cari, tarih ve vade</p>
                </div>
              </div>
              <div className="p-5 space-y-4">
                <ContactSelect label="Cari" required value={watchContact ?? ''} onChange={(value) => setValue('contactId', value, { shouldDirty: true, shouldValidate: true })} error={errors.contactId?.message} />
                <FormRow cols={2}>
                  <DatePicker label="Fatura Tarihi" required value={watchDate} onValueChange={(value) => setValue('date', value ?? '', { shouldDirty: true, shouldValidate: true })} error={errors.date?.message} clearable={false} />
                  <DatePicker label="Vade Tarihi" value={watchDueDate ?? ''} onValueChange={(value) => setValue('dueDate', value ?? '', { shouldDirty: true, shouldValidate: true })} />
                </FormRow>
                <Textarea label="Notlar" placeholder="Fatura ile ilgili notlar…" {...register('notes')} />
              </div>
            </div>

            {/* ── Kalemler ─────────────────────── */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
              <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-800/60">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-emerald-500/10"><ShoppingCart className="w-4 h-4 text-emerald-400" /></div>
                  <div>
                    <h3 className="text-sm font-semibold text-white">Fatura Kalemleri</h3>
                    <p className="text-xs text-slate-500 mt-0.5">Ürün veya hizmet kalemlerini ekleyin</p>
                  </div>
                </div>
                <span className="text-[10px] font-medium text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full">
                  {fields.length} kalem
                </span>
              </div>

              <div className="p-5 space-y-3">
                {fields.map((field, idx) => {
                  const lineTotal = lineTotals[idx]?.gross ?? 0;

                  return (
                    <div key={field.id} className="relative bg-slate-800/30 border border-slate-800 rounded-xl p-4 hover:border-slate-700/60 transition-colors">
                      {/* Row number */}
                      <div className="absolute -left-0 top-4 w-6 h-6 rounded-r-lg bg-slate-800 flex items-center justify-center">
                        <span className="text-[10px] font-bold text-slate-500">{idx + 1}</span>
                      </div>

                      {/* Top: description + product quick-fill + delete */}
                      <div className="flex items-start gap-3 ml-4">
                        <div className="flex-1 space-y-2">
                          <div className="flex gap-2">
                            <div className="flex-1">
                              <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5 block">Açıklama</label>
                              <input placeholder="Ürün / hizmet açıklaması"
                                className={cn(
                                  'w-full bg-slate-800 border rounded-lg text-sm text-white px-3 py-2.5',
                                  'focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent transition-colors',
                                  errors.lines?.[idx]?.description ? 'border-red-500' : 'border-slate-700',
                                )}
                                {...register(`lines.${idx}.description`)} />
                            </div>
                            <div className="w-48 shrink-0">
                              <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5 block">Ürün (opsiyonel)</label>
                              <ProductSelect value={watchedLines[idx]?.productId ?? ''} onChange={(value) => handleProductSelect(idx, value)} />
                            </div>
                          </div>
                        </div>
                        {fields.length > 1 && (
                          <button type="button" onClick={() => remove(idx)}
                            className="mt-6 p-2 rounded-lg text-slate-600 hover:text-red-400 hover:bg-red-500/10 transition-colors">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>

                      {/* Bottom: qty, price, discount, VAT, withholding, total */}
                      <div className="grid grid-cols-6 gap-3 mt-3 ml-4">
                        <div>
                          <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5 flex items-center gap-1">
                            <Hash className="w-2.5 h-2.5" />Miktar
                          </label>
                          <input type="number" step="1" min="1" placeholder="1"
                            className={cn(
                              'w-full bg-slate-800 border border-slate-700 rounded-lg text-sm text-white px-3 py-2 text-center tabular-nums',
                              'focus:outline-none focus:ring-2 focus:ring-sky-500 transition-colors',
                              errors.lines?.[idx]?.quantity && 'border-red-500',
                            )}
                            {...register(`lines.${idx}.quantity`)} />
                        </div>
                        <div>
                          <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5 flex items-center gap-1">
                            <DollarSign className="w-2.5 h-2.5" />Birim Fiyat
                          </label>
                          <input type="number" step="0.01" min="0" placeholder="0.00"
                            className="w-full bg-slate-800 border border-slate-700 rounded-lg text-sm text-white px-3 py-2 text-right tabular-nums focus:outline-none focus:ring-2 focus:ring-sky-500 transition-colors"
                            {...register(`lines.${idx}.unitPrice`)} />
                        </div>
                        <div>
                          <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5 flex items-center gap-1">
                            <Percent className="w-2.5 h-2.5" />İskonto
                          </label>
                          <input type="number" step="1" min="0" max="100" placeholder="0"
                            className="w-full bg-slate-800 border border-slate-700 rounded-lg text-sm text-white px-3 py-2 text-center tabular-nums focus:outline-none focus:ring-2 focus:ring-sky-500 transition-colors"
                            {...register(`lines.${idx}.discount`)} />
                        </div>
                        <div>
                          <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5 block">KDV</label>
                          <select
                            className="w-full bg-slate-800 border border-slate-700 rounded-lg text-sm text-white px-2.5 py-2 focus:outline-none focus:ring-2 focus:ring-sky-500 transition-colors"
                            {...register(`lines.${idx}.taxRateId`)}>
                            {vatRateOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                          </select>
                        </div>
                        <div>
                          <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5 block">Stopaj</label>
                          <select
                            className="w-full bg-slate-800 border border-slate-700 rounded-lg text-sm text-white px-2.5 py-2 focus:outline-none focus:ring-2 focus:ring-sky-500 transition-colors"
                            {...register(`lines.${idx}.withholdingRateId`)}>
                            {withholdingRateOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                          </select>
                        </div>
                        <div>
                          <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5 block text-right">Tutar</label>
                          <div className="h-[38px] flex items-center justify-end">
                            <span className={cn('text-sm font-bold tabular-nums', lineTotal > 0 ? 'text-white' : 'text-slate-600')}>
                              {formatCurrency(lineTotal)}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}

                <button type="button"
                  onClick={() => append({ description: '', quantity: '1', unitPrice: '0', discount: '0' })}
                  className="w-full flex items-center justify-center gap-2 py-3 border-2 border-dashed border-slate-700/50 rounded-xl text-xs font-medium text-slate-400 hover:text-emerald-400 hover:border-emerald-500/30 hover:bg-emerald-500/5 transition-all">
                  <Plus className="w-4 h-4" /> Yeni Kalem Ekle
                </button>
              </div>
            </div>

            {/* ── Sticky action bar ─────────────── */}
            <div className="sticky bottom-0 z-20 -mx-1 px-1 pb-4 pt-3 bg-gradient-to-t from-slate-950 via-slate-950/95 to-transparent">
              <div className="flex items-center justify-between bg-slate-900/80 backdrop-blur-xl border border-slate-800 rounded-xl px-5 py-3">
                <div className="flex items-center gap-4 text-xs text-slate-500">
                  <span className="flex items-center gap-1.5">
                    <ShoppingCart className="w-3.5 h-3.5 text-slate-600" />
                    {fields.length} kalem
                  </span>
                  <span className="w-px h-3.5 bg-slate-800" />
                  <span className="font-semibold text-white text-sm">{formatCurrency(totalGross)}</span>
                </div>
                <div className="flex items-center gap-2.5">
                  <Button type="button" variant="ghost" size="sm" leftIcon={<X className="w-3.5 h-3.5" />}
                    onClick={() => router.back()}>İptal</Button>
                  <Button type="submit" size="sm" loading={createInvoice.isPending} disabled={isSubmitLocked(isSubmitting, createInvoice.isPending)} leftIcon={<Save className="w-3.5 h-3.5" />}
                    className="bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-400 hover:to-emerald-500 shadow-lg shadow-emerald-500/20">
                    Fatura Oluştur
                  </Button>
                </div>
              </div>
            </div>
          </div>

          {/* ── Right sidebar ───────────────────── */}
          <div className="hidden lg:block w-72 shrink-0">
            <div className="sticky top-4 space-y-4">
              <SmartFormSidePanel
                formKind="invoice"
                contact={selectedContact}
                products={products}
                stockLevels={stockLevels}
                stockLoading={stockLoading}
                lines={smartLines}
                totalGross={totalGross}
                balanceImpact={watchType === 'PURCHASE' || watchType === 'RETURN_SALES' ? 'increase-payable' : 'increase-receivable'}
                openQuoteCount={openQuotesData?.meta.total ?? 0}
                openOrderCount={openOrdersData?.meta.total ?? 0}
              />

              {/* Type indicator */}
              <div className={cn('border rounded-xl p-4 flex items-center gap-3', activeType.bg, activeType.border)}>
                <activeType.icon className={cn('w-5 h-5', activeType.color)} />
                <div>
                  <p className={cn('text-sm font-semibold', activeType.color)}>{activeType.label} Faturası</p>
                  <p className="text-[10px] text-slate-500 mt-0.5">Seçili fatura tipi</p>
                </div>
              </div>

              {/* Customer card */}
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-3">
                  <Users className="w-3.5 h-3.5 text-slate-500" />
                  <span className="text-xs font-semibold text-slate-400">Cari</span>
                </div>
                {selectedContact ? (
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center text-xs font-bold text-emerald-400">
                      {selectedContact.name.charAt(0)}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-white truncate">{selectedContact.name}</p>
                      <p className="text-[10px] text-slate-500 font-mono">{selectedContact.code}</p>
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-slate-600">Henüz seçilmedi</p>
                )}
              </div>

              {/* Totals card */}
              <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
                <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-800/60">
                  <Receipt className="w-3.5 h-3.5 text-slate-500" />
                  <span className="text-xs font-semibold text-slate-400">Tutar Özeti</span>
                </div>
                <div className="p-4 space-y-2.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-500">Ara Toplam</span>
                    <span className="text-slate-300 font-medium tabular-nums">{formatCurrency(totalNet)}</span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-500">KDV</span>
                    <span className="text-slate-300 font-medium tabular-nums">{formatCurrency(totalTax)}</span>
                  </div>
                  {totalWithholding > 0 && (
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-500">Stopaj / Tevkifat</span>
                      <span className="text-amber-400 font-medium tabular-nums">-{formatCurrency(totalWithholding)}</span>
                    </div>
                  )}
                  <div className="h-px bg-slate-800" />
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-white">Genel Toplam</span>
                    <span className="text-base font-bold text-emerald-400 tabular-nums">{formatCurrency(totalGross)}</span>
                  </div>
                </div>
              </div>

              {/* Tips */}
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
                <p className="text-xs font-semibold text-slate-400 mb-2">💡 İpuçları</p>
                <ul className="space-y-1.5 text-[11px] text-slate-500 leading-relaxed">
                  <li>• &quot;Hızlı doldur&quot; ile ürün seçerek otomatik doldurun</li>
                  <li>• KDV oranı kalem bazında seçilebilir</li>
                  <li>• Vade tarihi ödeme takibi için önemlidir</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </form>
    </div>
  );
}
