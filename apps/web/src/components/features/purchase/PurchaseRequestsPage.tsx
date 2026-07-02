'use client';

import { useState } from 'react';
import { useForm, useFieldArray, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  Plus, Save, X, ClipboardList, CheckCircle, ArrowRight,
  Package, Trash2, Hash, DollarSign, CalendarDays, AlertTriangle,
  StickyNote, TrendingDown,
} from 'lucide-react';
import Link from 'next/link';
import { PageHeader } from '@/components/shared/PageHeader';
import { DataTable, type ColumnDef } from '@/components/shared/DataTable';
import { ContactSelect, ProductSelect } from '@/components/shared/EntitySelect';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Input } from '@/components/ui/Input';
import { DatePicker } from '@/components/ui/DatePicker';
import {
  usePurchaseRequests, useCreatePurchaseRequest,
  useApprovePurchaseRequest, useConvertRequestToOrder,
} from '@/hooks/usePurchase';
import { useProducts } from '@/hooks/useProducts';
import { cn, formatDate, formatCurrency } from '@/lib/utils';
import type { PurchaseRequest } from '@/services/purchase.service';

const STATUS_MAP: Record<string, { label: string; variant: 'neutral' | 'success' | 'warning' | 'danger' | 'info' }> = {
  DRAFT: { label: 'Taslak', variant: 'warning' },
  PENDING_APPROVAL: { label: 'Onay Bekliyor', variant: 'info' },
  APPROVED: { label: 'Onaylı', variant: 'success' },
  REJECTED: { label: 'Reddedildi', variant: 'danger' },
  ORDERED: { label: 'Sipariş Verildi', variant: 'neutral' },
  CANCELLED: { label: 'İptal', variant: 'neutral' },
};

const itemSchema = z.object({
  productId: z.string().min(1, 'Ürün seçiniz'),
  quantity: z.string().min(1, 'Zorunlu'),
  unitPrice: z.string().optional(),
});
const requestSchema = z.object({
  date: z.string().min(1, 'Tarih zorunlu'),
  notes: z.string().optional(),
  items: z.array(itemSchema).min(1, 'En az bir kalem'),
});
type RequestForm = z.infer<typeof requestSchema>;

export function PurchaseRequestsPage() {
  const [page, setPage] = useState(1);
  const [createOpen, setCreateOpen] = useState(false);
  const [convertTarget, setConvertTarget] = useState<PurchaseRequest | null>(null);
  const [convertContactId, setConvertContactId] = useState('');

  const [compareTarget, setCompareTarget] = useState<PurchaseRequest | null>(null);
  const [supplierQuotes, setSupplierQuotes] = useState<Array<{ contactId: string; prices: Record<string, string> }>>([
    { contactId: '', prices: {} },
    { contactId: '', prices: {} },
  ]);

  const addSupplierColumn = () => {
    if (supplierQuotes.length < 3) {
      setSupplierQuotes([...supplierQuotes, { contactId: '', prices: {} }]);
    }
  };

  const removeSupplierColumn = (idx: number) => {
    const copy = [...supplierQuotes];
    copy.splice(idx, 1);
    setSupplierQuotes(copy);
  };

  const updateSupplierContact = (idx: number, contactId: string) => {
    const copy = [...supplierQuotes];
    copy[idx] = { ...copy[idx], contactId };
    setSupplierQuotes(copy);
  };

  const updateSupplierItemPrice = (idx: number, productId: string, value: string) => {
    const copy = [...supplierQuotes];
    copy[idx] = {
      ...copy[idx],
      prices: { ...copy[idx].prices, [productId]: value },
    };
    setSupplierQuotes(copy);
  };

  const { data, isLoading } = usePurchaseRequests({ page, limit: 20 });
  const createReq = useCreatePurchaseRequest();
  const approveReq = useApprovePurchaseRequest();
  const convertReq = useConvertRequestToOrder();

  const { data: productsData } = useProducts({ page: 1, limit: 200 });
  const products = productsData?.data ?? [];

  const today = new Date().toISOString().split('T')[0];
  const { register, handleSubmit, control, reset, setValue, formState: { errors } } = useForm<RequestForm>({
    resolver: zodResolver(requestSchema),
    defaultValues: { date: today, items: [{ productId: '', quantity: '1', unitPrice: '' }] },
  });
  const { fields, append, remove } = useFieldArray({ control, name: 'items' });
  const watchItems = useWatch({ control, name: 'items' }) ?? [];
  const watchDate = useWatch({ control, name: 'date' });

  const closeModal = () => { setCreateOpen(false); reset({ date: today, items: [{ productId: '', quantity: '1', unitPrice: '' }] }); };

  const onSubmit = (formData: RequestForm) => {
    createReq.mutate({
      date: formData.date, notes: formData.notes || undefined,
      items: formData.items.map((i) => ({
        productId: i.productId, quantity: Number(i.quantity),
        unitPrice: i.unitPrice ? Number(i.unitPrice) : undefined,
      })),
    }, { onSuccess: closeModal });
  };

  const columns: ColumnDef<PurchaseRequest>[] = [
    { key: 'number', header: 'No', width: '120px', render: (r) => <span className="font-mono text-sky-400">{r.number}</span> },
    { key: 'date', header: 'Tarih', width: '100px', render: (r) => <span className="text-slate-400 text-xs">{formatDate(r.date)}</span> },
    { key: 'items', header: 'Kalem', width: '70px', align: 'center', render: (r) => <span className="text-slate-300">{r.items?.length ?? 0}</span> },
    { key: 'totalEstimated', header: 'Tahmini Tutar', width: '130px', align: 'right',
      render: (r) => <span className="text-slate-200 tabular-nums">{r.totalEstimated ? formatCurrency(r.totalEstimated) : '—'}</span> },
    { key: 'status', header: 'Durum', width: '130px',
      render: (r) => { const s = STATUS_MAP[r.status]; return s ? <Badge variant={s.variant}>{s.label}</Badge> : <span>{r.status}</span>; } },
    { key: 'actions', header: '', width: '200px', align: 'right',
      render: (r) => (
        <div className="flex items-center justify-end gap-1.5">
          {(r.status === 'DRAFT' || r.status === 'PENDING_APPROVAL') && (
            <button type="button" onClick={(e) => { e.stopPropagation(); approveReq.mutate(r.id); }}
              className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 hover:bg-emerald-500/20 transition-colors">
              <CheckCircle className="w-3 h-3" />Onayla
            </button>
          )}
          {r.status === 'APPROVED' && (
            <div className="flex items-center gap-1.5">
              <button type="button" onClick={(e) => { e.stopPropagation(); setCompareTarget(r); }}
                className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium text-violet-400 bg-violet-500/10 border border-violet-500/20 hover:bg-violet-500/20 transition-colors">
                <TrendingDown className="w-3 h-3" />Teklif Karşılaştır
              </button>
              <button type="button" onClick={(e) => { e.stopPropagation(); setConvertTarget(r); }}
                className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-medium text-sky-400 bg-sky-500/10 border border-sky-500/20 hover:bg-sky-500/20 transition-colors">
                <ArrowRight className="w-3 h-3" />Siparişe Dönüştür
              </button>
            </div>
          )}
        </div>
      ),
    },
  ];

  return (
    <div>
      <PageHeader title="Satın Alma Talepleri" subtitle="Satın alma taleplerini oluşturun ve yönetin."
        action={
          <Link href="#" onClick={(e) => { e.preventDefault(); setCreateOpen(true); }}
            className="group relative inline-flex items-center gap-2.5 h-10 px-5 rounded-xl font-medium text-sm text-white bg-gradient-to-r from-sky-500 to-sky-600 hover:from-sky-400 hover:to-sky-500 shadow-lg shadow-sky-500/20 transition-all duration-200 active:scale-[0.97]">
            <span className="flex items-center justify-center w-5 h-5 rounded-md bg-white/15"><Plus className="w-3.5 h-3.5" /></span>
            Yeni Talep
          </Link>
        }
      />
      <DataTable columns={columns} data={data?.data ?? []} keyExtractor={(r) => r.id} isLoading={isLoading}
        emptyTitle="Satın alma talebi bulunamadı" emptyDescription="Yeni bir talep oluşturarak başlayın."
        pagination={data ? { page, pageSize: 20, total: data.meta.total, totalPages: data.meta.totalPages, onChange: setPage } : undefined} />

      {/* Create request modal */}
      <Modal isOpen={createOpen} onClose={closeModal} title="Yeni Satın Alma Talebi"
        description="Satın alınacak ürünleri ve tahmini miktarları belirleyin." size="lg"
        footer={
          <>
            <Button variant="ghost" size="sm" leftIcon={<X className="w-3.5 h-3.5" />} onClick={closeModal}>İptal</Button>
            <Button size="sm" loading={createReq.isPending} leftIcon={<Save className="w-3.5 h-3.5" />} onClick={handleSubmit(onSubmit)}
              className="bg-gradient-to-r from-violet-500 to-violet-600 hover:from-violet-400 hover:to-violet-500 shadow-lg shadow-violet-500/20">
              Talebi Oluştur
            </Button>
          </>
        }
      >
        <form className="space-y-5">
          {/* ── Talep bilgileri ─────────────────── */}
          <div className="bg-slate-800/30 border border-slate-800 rounded-xl p-4 space-y-3">
            <div className="flex items-center gap-2 mb-1">
              <div className="p-1.5 rounded-lg bg-sky-500/10"><CalendarDays className="w-3.5 h-3.5 text-sky-400" /></div>
              <span className="text-xs font-semibold text-white">Talep Bilgileri</span>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <DatePicker label="Talep Tarihi" required value={watchDate} onValueChange={(value) => setValue('date', value ?? '', { shouldDirty: true, shouldValidate: true })} error={errors.date?.message} clearable={false} />
              <Input label="Notlar / Açıklama" placeholder="Neden bu ürünlere ihtiyaç var?"
                prefixIcon={<StickyNote className="w-3.5 h-3.5" />} {...register('notes')} />
            </div>
          </div>

          {/* ── Kalemler ───────────────────────── */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-emerald-500/10"><Package className="w-3.5 h-3.5 text-emerald-400" /></div>
                <span className="text-xs font-semibold text-white">Talep Kalemleri</span>
              </div>
              <span className="text-[10px] font-medium text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full">{fields.length} kalem</span>
            </div>

            <div className="space-y-2.5">
              {fields.map((field, idx) => {
                const selectedProduct = products.find((p) => p.id === watchItems?.[idx]?.productId);
                const qty = Number(watchItems?.[idx]?.quantity || 0);
                const price = Number(watchItems?.[idx]?.unitPrice || selectedProduct?.purchasePrice || 0);
                const lineEst = qty * price;
                const isBelowMin = selectedProduct && Number(selectedProduct.minStockLevel) > 0;

                return (
                  <div key={field.id} className="relative bg-slate-800/30 border border-slate-800 rounded-xl overflow-hidden hover:border-slate-700/60 transition-colors">
                    {/* Color accent bar */}
                    <div className={cn('absolute left-0 top-0 bottom-0 w-1 rounded-l-xl', selectedProduct ? 'bg-emerald-500/40' : 'bg-slate-700')} />

                    <div className="p-4 pl-5 space-y-3">
                      {/* Product select + info + delete */}
                      <div className="flex items-start gap-3">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1.5">
                            <span className="w-5 h-5 rounded-md bg-slate-800 flex items-center justify-center text-[10px] font-bold text-slate-500">{idx + 1}</span>
                            <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Ürün</label>
                          </div>
                          <ProductSelect
                            value={watchItems?.[idx]?.productId ?? ''}
                            onChange={(value) => setValue(`items.${idx}.productId`, value, { shouldDirty: true, shouldValidate: true })}
                            error={errors.items?.[idx]?.productId?.message}
                          />

                          {/* Product info chips */}
                          {selectedProduct && (
                            <div className="flex flex-wrap items-center gap-2 mt-2">
                              <span className="inline-flex items-center gap-1 text-[10px] font-medium text-sky-400 bg-sky-500/10 px-2 py-0.5 rounded-full">
                                <TrendingDown className="w-2.5 h-2.5" />Alış: {formatCurrency(selectedProduct.purchasePrice)}
                              </span>
                              {isBelowMin && (
                                <span className="inline-flex items-center gap-1 text-[10px] font-medium text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-full">
                                  <AlertTriangle className="w-2.5 h-2.5" />Min. stok: {selectedProduct.minStockLevel}
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                        {fields.length > 1 && (
                          <button type="button" onClick={() => remove(idx)}
                            className="mt-7 p-2 rounded-lg text-slate-600 hover:text-red-400 hover:bg-red-500/10 transition-colors">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>

                      {/* Quantity + price + estimated */}
                      <div className="grid grid-cols-3 gap-3">
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
                            <DollarSign className="w-2.5 h-2.5" />Tahmini Fiyat
                          </label>
                          <input type="number" step="1" min="0" placeholder={selectedProduct ? String(selectedProduct.purchasePrice) : '0'}
                            className="w-full bg-slate-800 border border-slate-700 rounded-lg text-sm text-white px-3 py-2 text-right tabular-nums focus:outline-none focus:ring-2 focus:ring-sky-500 transition-colors"
                            {...register(`items.${idx}.unitPrice`)} />
                        </div>
                        <div>
                          <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-1.5 block text-right">Tahmini Tutar</label>
                          <div className="h-[38px] flex items-center justify-end">
                            <span className={cn('text-sm font-bold tabular-nums', lineEst > 0 ? 'text-white' : 'text-slate-600')}>
                              {formatCurrency(lineEst)}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}

              <button type="button" onClick={() => append({ productId: '', quantity: '1', unitPrice: '' })}
                className="w-full flex items-center justify-center gap-2 py-3 border-2 border-dashed border-slate-700/50 rounded-xl text-xs font-medium text-slate-400 hover:text-violet-400 hover:border-violet-500/30 hover:bg-violet-500/5 transition-all">
                <Plus className="w-4 h-4" /> Yeni Kalem Ekle
              </button>
            </div>
          </div>

          {/* ── Summary ────────────────────────── */}
          {(() => {
            const totalEst = fields.reduce((sum, _, idx) => {
              const p = products.find((pr) => pr.id === watchItems?.[idx]?.productId);
              const qty = Number(watchItems?.[idx]?.quantity || 0);
              const price = Number(watchItems?.[idx]?.unitPrice || p?.purchasePrice || 0);
              return sum + qty * price;
            }, 0);
            const filledCount = fields.filter((_, idx) => watchItems?.[idx]?.productId).length;

            return (
              <div className="flex items-center gap-4 p-4 rounded-xl bg-slate-800/40 border border-slate-800">
                <div className="p-2.5 rounded-lg bg-violet-500/10">
                  <ClipboardList className="w-5 h-5 text-violet-400" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-3 text-xs text-slate-400">
                    <span><span className="font-semibold text-white">{filledCount}</span>/{fields.length} ürün seçildi</span>
                    {totalEst > 0 && (
                      <>
                        <span className="w-px h-3.5 bg-slate-700" />
                        <span>Tahmini toplam</span>
                      </>
                    )}
                  </div>
                  {totalEst > 0 && (
                    <p className="text-lg font-bold text-violet-400 tabular-nums mt-0.5">{formatCurrency(totalEst)}</p>
                  )}
                </div>
                {/* Progress */}
                <div className="w-16 h-1.5 bg-slate-700 rounded-full overflow-hidden">
                  <div className="h-full bg-violet-400 rounded-full transition-all duration-300"
                    style={{ width: `${fields.length > 0 ? (filledCount / fields.length) * 100 : 0}%` }} />
                </div>
              </div>
            );
          })()}

          {/* ── Flow hint ──────────────────────── */}
          <div className="flex items-center gap-2 text-[10px] text-slate-600">
            <span className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-500">Talep</span>
            <ArrowRight className="w-3 h-3" />
            <span className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-500">Onay</span>
            <ArrowRight className="w-3 h-3" />
            <span className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-500">Sipariş</span>
            <ArrowRight className="w-3 h-3" />
            <span className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-500">Teslim</span>
          </div>
        </form>
      </Modal>

      {/* Convert to order modal */}
      <Modal isOpen={!!convertTarget} onClose={() => setConvertTarget(null)} title="Siparişe Dönüştür"
        description={`"${convertTarget?.number}" talebini satın alma siparişine dönüştürün.`} size="sm"
        footer={<>
          <Button variant="ghost" size="sm" onClick={() => setConvertTarget(null)}>İptal</Button>
          <Button size="sm" loading={convertReq.isPending} disabled={!convertContactId}
            onClick={() => { if (convertTarget && convertContactId) convertReq.mutate({ id: convertTarget.id, contactId: convertContactId }, { onSuccess: () => setConvertTarget(null) }); }}
            className="bg-gradient-to-r from-sky-500 to-sky-600 hover:from-sky-400 hover:to-sky-500 shadow-lg shadow-sky-500/20">
            Dönüştür
          </Button>
        </>}>
        <ContactSelect label="Tedarikçi" required type={['SUPPLIER', 'BOTH']} value={convertContactId} onChange={setConvertContactId} />
      </Modal>

      {/* Compare quotes modal */}
      <Modal
        isOpen={!!compareTarget}
        onClose={() => { setCompareTarget(null); setSupplierQuotes([{ contactId: '', prices: {} }, { contactId: '', prices: {} }]); }}
        title="Tedarikçi Teklif Karşılaştırma"
        description={`"${compareTarget?.number}" talebi için tedarikçilerden gelen birim fiyatları kıyaslayın ve en uygun seçeneği belirleyin.`}
        size="xl"
      >
        <div className="space-y-6">
          {/* Header controls */}
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-400">
              Karşılaştırmak istediğiniz tedarikçileri seçin ve teklif birim fiyatlarını girin.
            </span>
            {supplierQuotes.length < 3 && (
              <Button
                variant="outline"
                size="sm"
                leftIcon={<Plus className="w-3.5 h-3.5" />}
                onClick={addSupplierColumn}
              >
                Tedarikçi Sütunu Ekle
              </Button>
            )}
          </div>

          {/* Comparison Matrix */}
          <div className="overflow-x-auto border border-slate-800 rounded-xl bg-slate-900/20">
            <table className="w-full min-w-[600px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-slate-800 bg-slate-950/40 text-slate-400 text-xs font-semibold uppercase tracking-wider">
                  <th className="p-4 w-[250px] align-middle text-left">Talep Edilen Ürün & Miktar</th>
                  {supplierQuotes.map((q, idx) => (
                    <th key={idx} className="p-4 align-top border-l border-slate-800/80 min-w-[200px]">
                      <div className="flex flex-col gap-2">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] text-slate-500 font-bold">TEDARİKÇİ #{idx + 1}</span>
                          {supplierQuotes.length > 2 && (
                            <button
                              type="button"
                              onClick={() => removeSupplierColumn(idx)}
                              className="text-slate-500 hover:text-red-400 transition-colors"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                        <ContactSelect
                          label=""
                          required
                          type={['SUPPLIER', 'BOTH']}
                          value={q.contactId}
                          onChange={(val) => updateSupplierContact(idx, val)}
                        />
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800 text-slate-300">
                {compareTarget?.items?.map((item) => {
                  const product = products.find((p) => p.id === item.productId);
                  const quantity = Number(item.quantity);
                  return (
                    <tr key={item.id} className="hover:bg-slate-900/10">
                      <td className="p-4">
                        <p className="font-semibold text-white">{product?.name || item.description || 'Bilinmeyen Ürün'}</p>
                        <p className="text-xs text-slate-400 mt-1">
                          Adet: <span className="font-mono text-white font-medium">{quantity}</span>
                        </p>
                      </td>
                      {supplierQuotes.map((q, idx) => (
                        <td key={idx} className="p-4 border-l border-slate-800/80">
                          <div className="space-y-1">
                            <label className="text-[10px] text-slate-500 font-medium block">Birim Teklif</label>
                            <div className="relative">
                              <input
                                type="number"
                                step="1"
                                min="0"
                                placeholder={product ? String(product.purchasePrice) : '0'}
                                value={q.prices[item.productId] ?? ''}
                                onChange={(e) => updateSupplierItemPrice(idx, item.productId, e.target.value)}
                                className="w-full bg-slate-800/50 border border-slate-700 rounded-lg text-sm text-white pl-3 pr-8 py-1.5 text-right tabular-nums focus:outline-none focus:ring-2 focus:ring-sky-500 focus:bg-slate-800 transition-all"
                              />
                              <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] font-bold text-slate-500">TL</span>
                            </div>
                            <div className="text-right text-[10px] text-slate-500 font-medium mt-1">
                              Satır Toplamı: <span className="text-slate-300 tabular-nums">
                                {formatCurrency(quantity * Number(q.prices[item.productId] || 0))}
                              </span>
                            </div>
                          </div>
                        </td>
                      ))}
                    </tr>
                  );
                })}

                {/* Total row */}
                {(() => {
                  // Compute totals
                  const totals = supplierQuotes.map((q) => {
                    if (!q.contactId) return 0;
                    return compareTarget?.items?.reduce((sum, item) => {
                      const qty = Number(item.quantity);
                      const price = Number(q.prices[item.productId] || 0);
                      return sum + qty * price;
                    }, 0) ?? 0;
                  });

                  // Identify cheapest
                  const minTotal = Math.min(...totals.filter((t) => t > 0));
                  const cheapestIdx = totals.findIndex((t) => t === minTotal && t > 0);

                  return (
                    <>
                      <tr className="bg-slate-950/20 font-bold">
                        <td className="p-4 text-slate-400">GENEL TOPLAM</td>
                        {supplierQuotes.map((q, idx) => {
                          const isCheapest = idx === cheapestIdx;
                          const total = totals[idx];
                          return (
                            <td key={idx} className={cn('p-4 border-l border-slate-800/80', isCheapest && 'bg-emerald-500/[0.03]')}>
                              <div className="flex flex-col items-end gap-1.5">
                                <span className={cn('text-base tabular-nums', isCheapest ? 'text-emerald-400 text-lg' : 'text-white')}>
                                  {formatCurrency(total)}
                                </span>
                                {isCheapest && (
                                  <span className="inline-flex items-center gap-1 text-[9px] font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full uppercase tracking-wider animate-pulse">
                                    Önerilen Tedarikçi
                                  </span>
                                )}
                              </div>
                            </td>
                          );
                        })}
                      </tr>
                      {/* Action buttons row */}
                      <tr className="bg-slate-950/30">
                        <td className="p-4" />
                        {supplierQuotes.map((q, idx) => {
                          const total = totals[idx];
                          const hasSelectedSupplier = !!q.contactId;
                          const isCheapest = idx === cheapestIdx;
                          return (
                            <td key={idx} className={cn('p-4 border-l border-slate-800/80', isCheapest && 'bg-emerald-500/[0.03]')}>
                              <Button
                                size="sm"
                                disabled={!hasSelectedSupplier || total === 0}
                                className={cn(
                                  'w-full shadow-md text-xs',
                                  isCheapest
                                    ? 'bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-400 hover:to-emerald-500 shadow-emerald-500/15'
                                    : 'bg-slate-800 hover:bg-slate-700 text-slate-300'
                                )}
                                onClick={() => {
                                  if (compareTarget && q.contactId) {
                                    convertReq.mutate({
                                      id: compareTarget.id,
                                      contactId: q.contactId,
                                      items: compareTarget.items?.map((item) => ({
                                        productId: item.productId,
                                        unitPrice: Number(q.prices[item.productId] || 0),
                                      })),
                                    }, {
                                      onSuccess: () => {
                                        setCompareTarget(null);
                                        setSupplierQuotes([{ contactId: '', prices: {} }, { contactId: '', prices: {} }]);
                                      }
                                    });
                                  }
                                }}
                              >
                                Sipariş Oluştur
                              </Button>
                            </td>
                          );
                        })}
                      </tr>
                    </>
                  );
                })()}
              </tbody>
            </table>
          </div>
        </div>
      </Modal>
    </div>
  );
}
