'use client';

import { useRouter } from 'next/navigation';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  ArrowLeft, ShoppingCart, Users, Plus, Trash2, Save, X,
  CalendarDays, Hash, DollarSign, Percent, Package, Receipt,
} from 'lucide-react';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Textarea } from '@/components/ui/Textarea';
import { Button } from '@/components/ui/Button';
import { FormRow } from '@/components/shared/FormField';
import { useContacts } from '@/hooks/useContacts';
import { useProducts } from '@/hooks/useProducts';
import { useCreatePurchaseOrder } from '@/hooks/usePurchase';
import { cn, formatCurrency } from '@/lib/utils';

const lineSchema = z.object({
  productId: z.string().min(1, 'Ürün seçiniz'),
  description: z.string().optional(),
  quantity: z.string().min(1, 'Zorunlu'),
  unitPrice: z.string().min(1, 'Zorunlu'),
  discount: z.string().optional(),
  taxRate: z.string().optional(),
});
const orderSchema = z.object({
  contactId: z.string().min(1, 'Tedarikçi seçiniz'),
  date: z.string().min(1, 'Tarih zorunlu'),
  dueDate: z.string().optional(),
  notes: z.string().optional(),
  items: z.array(lineSchema).min(1, 'En az bir kalem'),
});
type OrderForm = z.infer<typeof orderSchema>;

export function PurchaseOrderFormPage() {
  const router = useRouter();
  const createOrder = useCreatePurchaseOrder();
  const { data: contactsData } = useContacts({ page: 1, limit: 200 });
  const { data: productsData } = useProducts({ page: 1, limit: 200 });

  const contacts = contactsData?.data ?? [];
  const products = productsData?.data ?? [];
  const contactOptions = [{ value: '', label: '— Tedarikçi seçin —' }, ...contacts.filter((c) => c.type === 'SUPPLIER' || c.type === 'BOTH').map((c) => ({ value: c.id, label: `${c.name} (${c.code})` }))];
  const productOptions = [{ value: '', label: '— Ürün seçin —' }, ...products.map((p) => ({ value: p.id, label: `${p.name} (${p.code})` }))];

  const today = new Date().toISOString().split('T')[0];
  const { register, handleSubmit, control, watch, setValue, formState: { errors } } = useForm<OrderForm>({
    resolver: zodResolver(orderSchema),
    defaultValues: { contactId: '', date: today, items: [{ productId: '', quantity: '1', unitPrice: '0', discount: '0', taxRate: '0' }] },
  });
  const { fields, append, remove } = useFieldArray({ control, name: 'items' });
  const watchItems = watch('items');
  const watchContact = watch('contactId');
  const selectedContact = contacts.find((c) => c.id === watchContact);

  const handleProductChange = (idx: number, productId: string) => {
    setValue(`items.${idx}.productId`, productId);
    const product = products.find((p) => p.id === productId);
    if (product) { setValue(`items.${idx}.unitPrice`, String(product.purchasePrice)); setValue(`items.${idx}.description`, product.name); }
  };

  const lineTotals = watchItems.map((item) => {
    const qty = Number(item.quantity || 0); const price = Number(item.unitPrice || 0);
    const disc = Number(item.discount || 0); const tax = Number(item.taxRate || 0);
    const net = qty * price * (1 - disc / 100); const taxAmt = net * (tax / 100);
    return { net, taxAmt, gross: net + taxAmt };
  });
  const totalNet = lineTotals.reduce((s, l) => s + l.net, 0);
  const totalTax = lineTotals.reduce((s, l) => s + l.taxAmt, 0);
  const totalGross = totalNet + totalTax;

  const onSubmit = (data: OrderForm) => {
    createOrder.mutate({
      contactId: data.contactId, date: data.date, dueDate: data.dueDate || undefined, notes: data.notes || undefined,
      items: data.items.map((i) => ({
        productId: i.productId, description: i.description || undefined,
        quantity: Number(i.quantity), unitPrice: Number(i.unitPrice),
        discount: i.discount ? Number(i.discount) : undefined, taxRate: i.taxRate ? Number(i.taxRate) : undefined,
      })),
    }, { onSuccess: () => router.push('/dashboard/purchase-orders') });
  };

  return (
    <div>
      <div className="relative overflow-hidden bg-gradient-to-r from-violet-600/10 via-slate-900 to-sky-600/5 border border-slate-800 rounded-2xl p-5 mb-6">
        <div className="relative z-10 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button type="button" onClick={() => router.back()} className="p-2.5 rounded-xl bg-slate-800/80 border border-slate-700/50 text-slate-400 hover:text-white hover:border-slate-600 transition-all backdrop-blur-sm">
              <ArrowLeft className="w-4 h-4" />
            </button>
            <div>
              <h1 className="text-lg font-semibold text-white flex items-center gap-2.5">
                <div className="p-1.5 rounded-lg bg-violet-500/10"><ShoppingCart className="w-4 h-4 text-violet-400" /></div>
                Yeni Satın Alma Siparişi
              </h1>
              <p className="text-xs text-slate-500 mt-1 ml-[38px]">Tedarikçinize sipariş oluşturun.</p>
            </div>
          </div>
          {totalGross > 0 && (
            <div className="hidden sm:block text-right">
              <p className="text-[10px] text-slate-500 uppercase tracking-wider">Toplam</p>
              <p className="text-xl font-bold text-violet-400 tabular-nums">{formatCurrency(totalGross)}</p>
            </div>
          )}
        </div>
      </div>

      <form onSubmit={handleSubmit(onSubmit)}>
        <div className="flex gap-6">
          <div className="flex-1 min-w-0 space-y-5">
            {/* Info */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
              <div className="flex items-center gap-3 px-5 py-3.5 border-b border-slate-800/60">
                <div className="p-2 rounded-lg bg-sky-500/10"><Users className="w-4 h-4 text-sky-400" /></div>
                <h3 className="text-sm font-semibold text-white">Sipariş Bilgileri</h3>
              </div>
              <div className="p-5 space-y-4">
                <Select label="Tedarikçi" required options={contactOptions} error={errors.contactId?.message} {...register('contactId')} />
                <FormRow cols={2}>
                  <Input label="Sipariş Tarihi" required type="date" prefixIcon={<CalendarDays className="w-3.5 h-3.5" />} {...register('date')} />
                  <Input label="Teslim Tarihi" type="date" prefixIcon={<CalendarDays className="w-3.5 h-3.5" />} {...register('dueDate')} />
                </FormRow>
                <Textarea label="Notlar" placeholder="Sipariş notları…" {...register('notes')} />
              </div>
            </div>

            {/* Items */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
              <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-800/60">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-emerald-500/10"><Package className="w-4 h-4 text-emerald-400" /></div>
                  <h3 className="text-sm font-semibold text-white">Sipariş Kalemleri</h3>
                </div>
                <span className="text-[10px] font-medium text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full">{fields.length} kalem</span>
              </div>
              <div className="p-5 space-y-3">
                {fields.map((field, idx) => {
                  const lineTotal = lineTotals[idx]?.gross ?? 0;
                  return (
                    <div key={field.id} className="relative bg-slate-800/30 border border-slate-800 rounded-xl p-4 hover:border-slate-700/60 transition-colors">
                      <div className="absolute -left-0 top-4 w-6 h-6 rounded-r-lg bg-slate-800 flex items-center justify-center">
                        <span className="text-[10px] font-bold text-slate-500">{idx + 1}</span>
                      </div>
                      <div className="flex items-start gap-3 ml-4">
                        <div className="flex-1">
                          <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5 block">Ürün</label>
                          <select className={cn('w-full bg-slate-800 border rounded-lg text-sm text-white px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-sky-500',
                            errors.items?.[idx]?.productId ? 'border-red-500' : 'border-slate-700')}
                            value={watchItems[idx]?.productId ?? ''} onChange={(e) => handleProductChange(idx, e.target.value)}>
                            {productOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                          </select>
                        </div>
                        {fields.length > 1 && (
                          <button type="button" onClick={() => remove(idx)} className="mt-6 p-2 rounded-lg text-slate-600 hover:text-red-400 hover:bg-red-500/10 transition-colors">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                      <div className="grid grid-cols-5 gap-3 mt-3 ml-4">
                        <div><label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5 flex items-center gap-1"><Hash className="w-2.5 h-2.5" />Miktar</label>
                          <input type="number" step="1" min="1" placeholder="1" className="w-full bg-slate-800 border border-slate-700 rounded-lg text-sm text-white px-3 py-2 text-center tabular-nums focus:outline-none focus:ring-2 focus:ring-sky-500" {...register(`items.${idx}.quantity`)} /></div>
                        <div><label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5 flex items-center gap-1"><DollarSign className="w-2.5 h-2.5" />Birim Fiyat</label>
                          <input type="number" step="0.01" min="0" placeholder="0.00" className="w-full bg-slate-800 border border-slate-700 rounded-lg text-sm text-white px-3 py-2 text-right tabular-nums focus:outline-none focus:ring-2 focus:ring-sky-500" {...register(`items.${idx}.unitPrice`)} /></div>
                        <div><label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5 flex items-center gap-1"><Percent className="w-2.5 h-2.5" />İskonto</label>
                          <input type="number" step="1" min="0" max="100" placeholder="0" className="w-full bg-slate-800 border border-slate-700 rounded-lg text-sm text-white px-3 py-2 text-center tabular-nums focus:outline-none focus:ring-2 focus:ring-sky-500" {...register(`items.${idx}.discount`)} /></div>
                        <div><label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5 flex items-center gap-1"><Percent className="w-2.5 h-2.5" />KDV</label>
                          <input type="number" step="1" min="0" placeholder="0" className="w-full bg-slate-800 border border-slate-700 rounded-lg text-sm text-white px-3 py-2 text-center tabular-nums focus:outline-none focus:ring-2 focus:ring-sky-500" {...register(`items.${idx}.taxRate`)} /></div>
                        <div><label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5 block text-right">Tutar</label>
                          <div className="h-[38px] flex items-center justify-end"><span className={cn('text-sm font-bold tabular-nums', lineTotal > 0 ? 'text-white' : 'text-slate-600')}>{formatCurrency(lineTotal)}</span></div></div>
                      </div>
                    </div>
                  );
                })}
                <button type="button" onClick={() => append({ productId: '', quantity: '1', unitPrice: '0', discount: '0', taxRate: '0' })}
                  className="w-full flex items-center justify-center gap-2 py-3 border-2 border-dashed border-slate-700/50 rounded-xl text-xs font-medium text-slate-400 hover:text-violet-400 hover:border-violet-500/30 hover:bg-violet-500/5 transition-all">
                  <Plus className="w-4 h-4" /> Yeni Kalem Ekle
                </button>
              </div>
            </div>

            {/* Sticky bar */}
            <div className="sticky bottom-0 z-20 -mx-1 px-1 pb-4 pt-3 bg-gradient-to-t from-slate-950 via-slate-950/95 to-transparent">
              <div className="flex items-center justify-between bg-slate-900/80 backdrop-blur-xl border border-slate-800 rounded-xl px-5 py-3">
                <p className="text-xs text-slate-500">{fields.length} kalem · <span className="font-semibold text-white text-sm">{formatCurrency(totalGross)}</span></p>
                <div className="flex items-center gap-2.5">
                  <Button type="button" variant="ghost" size="sm" leftIcon={<X className="w-3.5 h-3.5" />} onClick={() => router.back()}>İptal</Button>
                  <Button type="submit" size="sm" loading={createOrder.isPending} leftIcon={<Save className="w-3.5 h-3.5" />}
                    className="bg-gradient-to-r from-violet-500 to-violet-600 hover:from-violet-400 hover:to-violet-500 shadow-lg shadow-violet-500/20">Siparişi Kaydet</Button>
                </div>
              </div>
            </div>
          </div>

          {/* Sidebar */}
          <div className="hidden lg:block w-72 shrink-0">
            <div className="sticky top-4 space-y-4">
              <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-3"><Users className="w-3.5 h-3.5 text-slate-500" /><span className="text-xs font-semibold text-slate-400">Tedarikçi</span></div>
                {selectedContact ? (
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-lg bg-violet-500/10 flex items-center justify-center text-xs font-bold text-violet-400">{selectedContact.name.charAt(0)}</div>
                    <div><p className="text-sm font-medium text-white truncate">{selectedContact.name}</p><p className="text-[10px] text-slate-500 font-mono">{selectedContact.code}</p></div>
                  </div>
                ) : <p className="text-xs text-slate-600">Henüz seçilmedi</p>}
              </div>
              <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
                <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-800/60"><Receipt className="w-3.5 h-3.5 text-slate-500" /><span className="text-xs font-semibold text-slate-400">Tutar Özeti</span></div>
                <div className="p-4 space-y-2.5">
                  <div className="flex items-center justify-between text-xs"><span className="text-slate-500">Ara Toplam</span><span className="text-slate-300 tabular-nums">{formatCurrency(totalNet)}</span></div>
                  <div className="flex items-center justify-between text-xs"><span className="text-slate-500">KDV</span><span className="text-slate-300 tabular-nums">{formatCurrency(totalTax)}</span></div>
                  <div className="h-px bg-slate-800" />
                  <div className="flex items-center justify-between"><span className="text-xs font-semibold text-white">Genel Toplam</span><span className="text-base font-bold text-violet-400 tabular-nums">{formatCurrency(totalGross)}</span></div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </form>
    </div>
  );
}
