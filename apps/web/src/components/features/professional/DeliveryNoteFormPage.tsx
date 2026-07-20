'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Save, Trash2 } from 'lucide-react';
import { PageHeader } from '@/components/shared/PageHeader';
import { ContactSelect, ProductSelect, WarehouseSelect } from '@/components/shared/EntitySelect';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { useCreateDeliveryNote } from '@/hooks/useDeliveryNotes';
import type { CreateDeliveryNoteDTO, DeliveryNoteType } from '@/services/delivery-note.service';

interface FormLine {
  productId: string;
  description: string;
  orderedQty: number;
  deliveredQty: number;
}

const TYPE_OPTIONS: Array<{ value: DeliveryNoteType; label: string }> = [
  { value: 'OUTBOUND', label: 'Sevk' },
  { value: 'INBOUND', label: 'Giriş' },
  { value: 'RETURN', label: 'İade' },
];

function todayInputValue(): string {
  return new Date().toISOString().slice(0, 10);
}

function emptyLine(): FormLine {
  return { productId: '', description: '', orderedQty: 1, deliveredQty: 1 };
}

export function DeliveryNoteFormPage() {
  const router = useRouter();
  const createNote = useCreateDeliveryNote();
  const [type, setType] = useState<DeliveryNoteType>('OUTBOUND');
  const [date, setDate] = useState(todayInputValue());
  const [warehouseId, setWarehouseId] = useState('');
  const [contactId, setContactId] = useState('');
  const [carrier, setCarrier] = useState('');
  const [trackingNumber, setTrackingNumber] = useState('');
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<FormLine[]>([emptyLine()]);

  const canSubmit = Boolean(warehouseId && date && lines.every((line) => line.productId && line.orderedQty > 0 && line.deliveredQty >= 0));

  const submit = () => {
    if (!canSubmit) return;
    const payload: CreateDeliveryNoteDTO = {
      type,
      date,
      warehouseId,
      ...(contactId ? { contactId } : {}),
      ...(carrier ? { carrier } : {}),
      ...(trackingNumber ? { trackingNumber } : {}),
      ...(notes ? { notes } : {}),
      items: lines.map((line, index) => ({
        productId: line.productId,
        description: line.description || undefined,
        orderedQty: line.orderedQty,
        deliveredQty: line.deliveredQty,
        sortOrder: index,
      })),
    };
    createNote.mutate(payload, { onSuccess: () => router.push('/dashboard/delivery-notes') });
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Yeni irsaliye"
        subtitle="Sevk, giriş veya iade irsaliyesi oluşturun."
        action={<Button variant="ghost" onClick={() => router.push('/dashboard/delivery-notes')}>Listeye dön</Button>}
      />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <main className="space-y-6">
          <div className="rounded-xl border border-slate-800 bg-slate-900 p-5">
            <h2 className="text-sm font-semibold text-slate-200">Belge bilgileri</h2>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <Select label="Tip" options={TYPE_OPTIONS} value={type} onChange={(event) => setType(event.target.value as DeliveryNoteType)} />
              <Input label="Tarih" type="date" value={date} onChange={(event) => setDate(event.target.value)} required />
              <WarehouseSelect label="Depo" value={warehouseId} onChange={setWarehouseId} required />
              <ContactSelect label="Cari" value={contactId} onChange={setContactId} />
              <Input label="Taşıyıcı" value={carrier} onChange={(event) => setCarrier(event.target.value)} />
              <Input label="Takip no" value={trackingNumber} onChange={(event) => setTrackingNumber(event.target.value)} />
            </div>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-900 p-5">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-sm font-semibold text-slate-200">Kalemler</h2>
              <Button variant="outline" size="sm" leftIcon={<Plus className="h-3.5 w-3.5" />} onClick={() => setLines((current) => [...current, emptyLine()])}>Satır ekle</Button>
            </div>
            <div className="mt-4 space-y-3">
              {lines.map((line, index) => (
                <div key={index} className="grid gap-3 rounded-lg border border-slate-800 bg-slate-950/35 p-3 lg:grid-cols-[minmax(0,1fr)_120px_120px_44px]">
                  <ProductSelect label="Ürün" value={line.productId} onChange={(value) => setLines((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, productId: value } : item))} required />
                  <Input label="Sipariş" type="number" min={0} value={line.orderedQty} onChange={(event) => setLines((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, orderedQty: Number(event.target.value) } : item))} />
                  <Input label="Teslim" type="number" min={0} value={line.deliveredQty} onChange={(event) => setLines((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, deliveredQty: Number(event.target.value) } : item))} />
                  <Button variant="ghost" size="sm" className="mt-6" disabled={lines.length === 1} onClick={() => setLines((current) => current.filter((_, itemIndex) => itemIndex !== index))} leftIcon={<Trash2 className="h-3.5 w-3.5" />} />
                  <div className="lg:col-span-4">
                    <Input label="Açıklama" value={line.description} onChange={(event) => setLines((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, description: event.target.value } : item))} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </main>

        <aside className="space-y-4 xl:sticky xl:top-24 xl:self-start">
          <div className="rounded-xl border border-slate-800 bg-slate-900 p-5">
            <h2 className="text-sm font-semibold text-slate-200">Kontrol</h2>
            <div className="mt-4 space-y-2 text-sm text-slate-400">
              <p>Depo: {warehouseId ? 'Seçildi' : 'Zorunlu'}</p>
              <p>Kalem: {lines.length}</p>
              <p>Stok etkisi: Onay/sevk akışında oluşur.</p>
              <p>E-irsaliye: Sevk sonrası e-belge ekranından oluşturulur.</p>
            </div>
            <textarea
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="Not"
              className="mt-4 min-h-24 w-full rounded-xl border border-slate-700 bg-slate-950/35 px-3.5 py-2.5 text-sm text-white placeholder-slate-500 focus:border-sky-500/60 focus:outline-none focus:ring-2 focus:ring-sky-500/35"
            />
            <Button className="mt-4 w-full" leftIcon={<Save className="h-4 w-4" />} loading={createNote.isPending} disabled={!canSubmit} onClick={submit}>Kaydet</Button>
          </div>
        </aside>
      </div>
    </div>
  );
}
