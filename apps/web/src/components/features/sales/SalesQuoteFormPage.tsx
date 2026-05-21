'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm, useFieldArray, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  ArrowLeft, FileSignature, Users, Plus, Trash2,
  Save, X, Package, Receipt, Percent,
  Hash, DollarSign, ShoppingCart,
} from 'lucide-react';
import { DatePicker } from '@/components/ui/DatePicker';
import { Textarea } from '@/components/ui/Textarea';
import { Button } from '@/components/ui/Button';
import { FormRow } from '@/components/shared/FormField';
import { ContactSelect, ProductSelect } from '@/components/shared/EntitySelect';
import { SmartFormSidePanel, type SmartFormLine } from '@/components/shared/SmartFormSidePanel';
import { useContacts } from '@/hooks/useContacts';
import { useProducts } from '@/hooks/useProducts';
import { useCreateSalesQuote, useSalesOrders, useSalesQuotes } from '@/hooks/useSales';
import { useStockLevels } from '@/hooks/useStock';
import { useBusinessRules } from '@/hooks/useSettings';
import { cn, formatCurrency } from '@/lib/utils';
import type { BusinessRule } from '@/services/settings.service';

// ─────────────────────────────────────────────
// Schema
// ─────────────────────────────────────────────

const lineSchema = z.object({
  productId: z.string().min(1, 'Ürün seçiniz'),
  description: z.string().optional(),
  quantity: z.string().min(1, 'Zorunlu'),
  unitPrice: z.string().min(1, 'Zorunlu'),
  discount: z.string().optional(),
  taxRate: z.string().optional(),
});

const quoteSchema = z.object({
  contactId: z.string().min(1, 'Cari seçiniz'),
  date: z.string().min(1, 'Tarih zorunlu'),
  validUntil: z.string().optional(),
  notes: z.string().optional(),
  items: z.array(lineSchema).min(1, 'En az bir kalem ekleyin'),
});

type QuoteForm = z.infer<typeof quoteSchema>;

function addDaysString(dateValue: string, days: number): string {
  const date = new Date(dateValue);
  date.setDate(date.getDate() + days);
  return date.toISOString().split('T')[0];
}

function getNumberRule(rules: BusinessRule[], key: BusinessRule['key'], fallback: number): number {
  const rule = rules.find((item) => item.key === key);
  return typeof rule?.value === 'number' ? rule.value : fallback;
}

// ─────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────

export function SalesQuoteFormPage() {
  const router = useRouter();
  const createQuote = useCreateSalesQuote();
  const { data: businessRules = [] } = useBusinessRules();

  const { data: contactsData } = useContacts({ page: 1, limit: 200 });
  const { data: productsData } = useProducts({ page: 1, limit: 200 });

  const contacts = contactsData?.data ?? [];
  const products = productsData?.data ?? [];

  const [defaultDates] = useState(() => {
    const today = new Date();
    const validUntil = new Date(today);
    validUntil.setDate(validUntil.getDate() + 30);

    return {
      today: today.toISOString().split('T')[0],
      validUntil: validUntil.toISOString().split('T')[0],
    };
  });

  const { register, handleSubmit, control, setValue, formState: { errors, dirtyFields } } = useForm<QuoteForm>({
    resolver: zodResolver(quoteSchema),
    defaultValues: { contactId: '', date: defaultDates.today, validUntil: defaultDates.validUntil, notes: '', items: [{ productId: '', quantity: '1', unitPrice: '0', discount: '0', taxRate: '0' }] },
  });

  const { fields, append, remove } = useFieldArray({ control, name: 'items' });
  const watchItems = useWatch({ control, name: 'items' }) ?? [];
  const watchContact = useWatch({ control, name: 'contactId' });
  const watchDate = useWatch({ control, name: 'date' });
  const watchValidUntil = useWatch({ control, name: 'validUntil' });
  const quoteValidityDays = getNumberRule(businessRules, 'sales.quote_validity_days', 30);
  const { data: openQuotesData } = useSalesQuotes(
    { page: 1, limit: 5, contactId: watchContact || undefined, status: 'DRAFT' },
    { enabled: Boolean(watchContact) },
  );
  const { data: openOrdersData } = useSalesOrders(
    { page: 1, limit: 5, contactId: watchContact || undefined, status: 'CONFIRMED' },
    { enabled: Boolean(watchContact) },
  );
  const selectedProductIds = watchItems.map((item) => item.productId).filter(Boolean);
  const { data: stockLevels = [], isLoading: stockLoading } = useStockLevels({}, { enabled: selectedProductIds.length > 0 });

  useEffect(() => {
    if (!watchDate || dirtyFields.validUntil) return;
    setValue('validUntil', addDaysString(watchDate, quoteValidityDays), { shouldDirty: false, shouldValidate: true });
  }, [dirtyFields.validUntil, quoteValidityDays, setValue, watchDate]);

  const handleProductChange = (idx: number, productId: string) => {
    setValue(`items.${idx}.productId`, productId);
    const product = products.find((p) => p.id === productId);
    if (product) {
      setValue(`items.${idx}.unitPrice`, String(product.salesPrice));
      setValue(`items.${idx}.description`, product.name);
    }
  };

  const lineTotals = watchItems.map((item) => {
    const qty = Number(item.quantity || 0);
    const price = Number(item.unitPrice || 0);
    const disc = Number(item.discount || 0);
    const tax = Number(item.taxRate || 0);
    const net = qty * price * (1 - disc / 100);
    const taxAmt = net * (tax / 100);
    return { net, taxAmt, gross: net + taxAmt };
  });
  const totalNet = lineTotals.reduce((s, l) => s + l.net, 0);
  const totalTax = lineTotals.reduce((s, l) => s + l.taxAmt, 0);
  const totalGross = lineTotals.reduce((s, l) => s + l.gross, 0);
  const smartLines: SmartFormLine[] = watchItems.map((item, index) => ({
    productId: item.productId || undefined,
    quantity: Number(item.quantity || 0),
    unitPrice: Number(item.unitPrice || 0),
    discount: Number(item.discount || 0),
    net: lineTotals[index]?.net ?? 0,
    gross: lineTotals[index]?.gross ?? 0,
  }));

  const selectedContact = contacts.find((c) => c.id === watchContact);

  const onSubmit = (data: QuoteForm) => {
    createQuote.mutate(
      {
        contactId: data.contactId,
        date: data.date,
        validUntil: data.validUntil || undefined,
        notes: data.notes || undefined,
        items: data.items.map((item) => ({
          productId: item.productId,
          description: item.description || undefined,
          quantity: Number(item.quantity),
          unitPrice: Number(item.unitPrice),
          discount: item.discount ? Number(item.discount) : undefined,
          taxRate: item.taxRate ? Number(item.taxRate) : undefined,
        })),
      },
      { onSuccess: (q) => router.push(`/dashboard/sales-orders/quotes/${q.id}`) },
    );
  };

  return (
    <div>
      {/* ── Header banner ───────────────────────── */}
      <div className="relative overflow-hidden bg-gradient-to-r from-sky-600/10 via-slate-900 to-violet-600/5 border border-slate-800 rounded-2xl p-5 mb-6">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_rgba(56,189,248,0.06)_0%,transparent_60%)]" />
        <div className="relative z-10 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button type="button" onClick={() => router.back()}
              className="p-2.5 rounded-xl bg-slate-800/80 border border-slate-700/50 text-slate-400 hover:text-white hover:border-slate-600 transition-all backdrop-blur-sm">
              <ArrowLeft className="w-4 h-4" />
            </button>
            <div>
              <h1 className="text-lg font-semibold text-white flex items-center gap-2.5">
                <div className="p-1.5 rounded-lg bg-sky-500/10"><FileSignature className="w-4 h-4 text-sky-400" /></div>
                Yeni Teklif Oluştur
              </h1>
              <p className="text-xs text-slate-500 mt-1 ml-[38px]">Müşterinize fiyat teklifi hazırlayın. Kabul edilirse siparişe dönüştürebilirsiniz.</p>
            </div>
          </div>
          {/* Live total in header */}
          {totalGross > 0 && (
            <div className="hidden sm:block text-right">
              <p className="text-[10px] text-slate-500 uppercase tracking-wider">Toplam</p>
              <p className="text-xl font-bold text-sky-400 tabular-nums">{formatCurrency(totalGross)}</p>
            </div>
          )}
        </div>
      </div>

      <form onSubmit={handleSubmit(onSubmit)}>
        <div className="flex gap-6">
          {/* ── Left: main form ─────────────────── */}
          <div className="flex-1 min-w-0 space-y-5">
            {/* ── Teklif Bilgileri ──────────────── */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
              <div className="flex items-center gap-3 px-5 py-3.5 border-b border-slate-800/60">
                <div className="p-2 rounded-lg bg-sky-500/10"><Users className="w-4 h-4 text-sky-400" /></div>
                <div>
                  <h3 className="text-sm font-semibold text-white">Teklif Bilgileri</h3>
                  <p className="text-xs text-slate-500 mt-0.5">Müşteri, tarih ve geçerlilik</p>
                </div>
              </div>
              <div className="p-5 space-y-4">
                <ContactSelect label="Müşteri" required value={watchContact ?? ''} onChange={(value) => setValue('contactId', value, { shouldDirty: true, shouldValidate: true })} error={errors.contactId?.message} />
                <FormRow cols={2}>
                  <DatePicker label="Teklif Tarihi" required value={watchDate} onValueChange={(value) => setValue('date', value ?? '', { shouldDirty: true, shouldValidate: true })} error={errors.date?.message} clearable={false} />
                  <DatePicker label="Geçerlilik Tarihi" value={watchValidUntil ?? ''} onValueChange={(value) => setValue('validUntil', value ?? '', { shouldDirty: true, shouldValidate: true })} />
                </FormRow>
                <Textarea label="Notlar" placeholder="Teklif ile ilgili notlar…" {...register('notes')} />
              </div>
            </div>

            {/* ── Kalemler ─────────────────────── */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
              <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-800/60">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-emerald-500/10"><Package className="w-4 h-4 text-emerald-400" /></div>
                  <div>
                    <h3 className="text-sm font-semibold text-white">Teklif Kalemleri</h3>
                    <p className="text-xs text-slate-500 mt-0.5">Ürün seçince fiyat otomatik dolar</p>
                  </div>
                </div>
                <span className="text-[10px] font-medium text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full">
                  {fields.length} kalem
                </span>
              </div>

              <div className="p-5 space-y-3">
                {/* Lines */}
                {fields.map((field, idx) => {
                  const product = products.find((p) => p.id === watchItems[idx]?.productId);
                  const lineTotal = lineTotals[idx]?.gross ?? 0;

                  return (
                    <div key={field.id} className="relative bg-slate-800/30 border border-slate-800 rounded-xl p-4 hover:border-slate-700/60 transition-colors">
                      {/* Row number */}
                      <div className="absolute -left-0 top-4 w-6 h-6 rounded-r-lg bg-slate-800 flex items-center justify-center">
                        <span className="text-[10px] font-bold text-slate-500">{idx + 1}</span>
                      </div>

                      {/* Top row: product + delete */}
                      <div className="flex items-start gap-3 ml-4">
                        <div className="flex-1">
                          <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5 block">Ürün</label>
                          <ProductSelect
                            value={watchItems[idx]?.productId ?? ''}
                            onChange={(value) => handleProductChange(idx, value)}
                            error={errors.items?.[idx]?.productId?.message}
                          />
                          {product && (
                            <p className="text-[10px] text-slate-500 mt-1">
                              Katalog fiyatı: <span className="text-slate-400">{formatCurrency(product.salesPrice)}</span>
                            </p>
                          )}
                        </div>
                        {fields.length > 1 && (
                          <button type="button" onClick={() => remove(idx)}
                            className="mt-6 p-2 rounded-lg text-slate-600 hover:text-red-400 hover:bg-red-500/10 transition-colors">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>

                      {/* Bottom row: qty, price, discount, tax, total */}
                      <div className="grid grid-cols-5 gap-3 mt-3 ml-4">
                        <div>
                          <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5 flex items-center gap-1">
                            <Hash className="w-2.5 h-2.5" />Miktar
                          </label>
                          <input type="number" step="1" min="1" placeholder="1"
                            className={cn(
                              'w-full bg-slate-800 border border-slate-700 rounded-lg text-sm text-white px-3 py-2 text-center tabular-nums',
                              'focus:outline-none focus:ring-2 focus:ring-sky-500 transition-colors',
                              errors.items?.[idx]?.quantity && 'border-red-500',
                            )}
                            {...register(`items.${idx}.quantity`)} />
                        </div>
                        <div>
                          <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5 flex items-center gap-1">
                            <DollarSign className="w-2.5 h-2.5" />Birim Fiyat
                          </label>
                          <input type="number" step="0.01" min="0" placeholder="0.00"
                            className="w-full bg-slate-800 border border-slate-700 rounded-lg text-sm text-white px-3 py-2 text-right tabular-nums focus:outline-none focus:ring-2 focus:ring-sky-500 transition-colors"
                            {...register(`items.${idx}.unitPrice`)} />
                        </div>
                        <div>
                          <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5 flex items-center gap-1">
                            <Percent className="w-2.5 h-2.5" />İskonto
                          </label>
                          <input type="number" step="1" min="0" max="100" placeholder="0"
                            className="w-full bg-slate-800 border border-slate-700 rounded-lg text-sm text-white px-3 py-2 text-center tabular-nums focus:outline-none focus:ring-2 focus:ring-sky-500 transition-colors"
                            {...register(`items.${idx}.discount`)} />
                        </div>
                        <div>
                          <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5 flex items-center gap-1">
                            <Percent className="w-2.5 h-2.5" />KDV
                          </label>
                          <input type="number" step="1" min="0" placeholder="0"
                            className="w-full bg-slate-800 border border-slate-700 rounded-lg text-sm text-white px-3 py-2 text-center tabular-nums focus:outline-none focus:ring-2 focus:ring-sky-500 transition-colors"
                            {...register(`items.${idx}.taxRate`)} />
                        </div>
                        <div>
                          <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5 block text-right">Tutar</label>
                          <div className="h-[38px] flex items-center justify-end">
                            <span className={cn(
                              'text-sm font-bold tabular-nums',
                              lineTotal > 0 ? 'text-white' : 'text-slate-600',
                            )}>{formatCurrency(lineTotal)}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}

                {/* Add line */}
                <button type="button"
                  onClick={() => append({ productId: '', quantity: '1', unitPrice: '0', discount: '0', taxRate: '0' })}
                  className="w-full flex items-center justify-center gap-2 py-3 border-2 border-dashed border-slate-700/50 rounded-xl text-xs font-medium text-slate-400 hover:text-sky-400 hover:border-sky-500/30 hover:bg-sky-500/5 transition-all">
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
                  <Button type="submit" size="sm" loading={createQuote.isPending} leftIcon={<Save className="w-3.5 h-3.5" />}
                    className="bg-gradient-to-r from-sky-500 to-sky-600 hover:from-sky-400 hover:to-sky-500 shadow-lg shadow-sky-500/20">
                    Teklifi Kaydet
                  </Button>
                </div>
              </div>
            </div>
          </div>

          {/* ── Right sidebar: summary ──────────── */}
          <div className="hidden lg:block w-72 shrink-0">
            <div className="sticky top-4 space-y-4">
              <SmartFormSidePanel
                formKind="quote"
                contact={selectedContact}
                products={products}
                stockLevels={stockLevels}
                stockLoading={stockLoading}
                lines={smartLines}
                totalGross={totalGross}
                openQuoteCount={openQuotesData?.meta.total ?? 0}
                openOrderCount={openOrdersData?.meta.total ?? 0}
              />

              {/* Customer card */}
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-3">
                  <Users className="w-3.5 h-3.5 text-slate-500" />
                  <span className="text-xs font-semibold text-slate-400">Müşteri</span>
                </div>
                {selectedContact ? (
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-lg bg-sky-500/10 flex items-center justify-center text-xs font-bold text-sky-400">
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
                  <div className="h-px bg-slate-800" />
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-white">Genel Toplam</span>
                    <span className="text-base font-bold text-sky-400 tabular-nums">{formatCurrency(totalGross)}</span>
                  </div>
                </div>
              </div>

              {/* Tips */}
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
                <p className="text-xs font-semibold text-slate-400 mb-2">💡 İpuçları</p>
                <ul className="space-y-1.5 text-[11px] text-slate-500 leading-relaxed">
                  <li>• Ürün seçince fiyat otomatik dolar</li>
                  <li>• İskonto satır bazında uygulanır</li>
                  <li>• Teklif kabul edilirse siparişe dönüştürülebilir</li>
                  <li>• Geçerlilik tarihi varsayılan {quoteValidityDays} gündür</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </form>
    </div>
  );
}
