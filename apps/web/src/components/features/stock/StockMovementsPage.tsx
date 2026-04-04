'use client';

import { useState } from 'react';
import { Plus, ArrowDownToLine, ArrowUpFromLine, RotateCcw, FolderOpen,
  Package, Warehouse as WarehouseIcon, Hash, StickyNote, Coins, Save, X,
} from 'lucide-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import Link from 'next/link';
import { PageHeader } from '@/components/shared/PageHeader';
import { DataTable, type ColumnDef } from '@/components/shared/DataTable';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { FormRow } from '@/components/shared/FormField';
import { useStockMovements, useCreateManualMovement, useWarehouses } from '@/hooks/useStock';
import { cn, formatDate } from '@/lib/utils';
import type { StockMovement, StockMovementType } from '@/services/stock.service';

const MOVEMENT_TYPE_LABELS: Record<StockMovementType, string> = {
  IN: 'Giriş', OUT: 'Çıkış', TRANSFER: 'Transfer',
  ADJUSTMENT: 'Düzeltme', RETURN: 'İade', OPENING: 'Açılış',
};

const MOVEMENT_TYPE_COLORS: Record<StockMovementType, string> = {
  IN: 'text-emerald-400', OUT: 'text-red-400', TRANSFER: 'text-sky-400',
  ADJUSTMENT: 'text-amber-400', RETURN: 'text-violet-400', OPENING: 'text-slate-400',
};

// ─────────────────────────────────────────────
// Movement type visual config
// ─────────────────────────────────────────────

const MOVE_TYPES = [
  { value: 'IN',         label: 'Giriş',    icon: ArrowDownToLine, color: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/30', ring: 'ring-emerald-500/20' },
  { value: 'OUT',        label: 'Çıkış',    icon: ArrowUpFromLine,  color: 'text-red-400',     bg: 'bg-red-500/10',     border: 'border-red-500/30',     ring: 'ring-red-500/20' },
  { value: 'ADJUSTMENT', label: 'Düzeltme', icon: RotateCcw,        color: 'text-amber-400',   bg: 'bg-amber-500/10',   border: 'border-amber-500/30',   ring: 'ring-amber-500/20' },
  { value: 'OPENING',    label: 'Açılış',   icon: FolderOpen,       color: 'text-sky-400',     bg: 'bg-sky-500/10',     border: 'border-sky-500/30',     ring: 'ring-sky-500/20' },
] as const;

// ─────────────────────────────────────────────
// Schema
// ─────────────────────────────────────────────

const manualMovementSchema = z.object({
  productId: z.string().min(1, 'Ürün ID zorunludur'),
  type: z.enum(['IN', 'OUT', 'ADJUSTMENT', 'OPENING']),
  quantity: z.string().min(1, 'Miktar zorunludur'),
  warehouseId: z.string().min(1, 'Depo seçiniz'),
  unitCost: z.string().optional(),
  notes: z.string().optional(),
});
type ManualMovementForm = z.infer<typeof manualMovementSchema>;

// ─────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────

export function StockMovementsPage() {
  const [page, setPage] = useState(1);
  const [createOpen, setCreateOpen] = useState(false);

  const { data: warehouses = [] } = useWarehouses();
  const { data, isLoading } = useStockMovements({ page, limit: 20 });
  const createMovement = useCreateManualMovement();

  const warehouseOptions = warehouses.map((w) => ({ value: w.id, label: w.name }));

  const { register, handleSubmit, reset, watch, setValue, formState: { errors } } = useForm<ManualMovementForm>({
    resolver: zodResolver(manualMovementSchema),
    defaultValues: { type: 'IN' },
  });

  const selectedType = watch('type');

  const onSubmit = (formData: ManualMovementForm) => {
    createMovement.mutate(
      { ...formData, quantity: Number(formData.quantity), unitCost: formData.unitCost ? Number(formData.unitCost) : undefined },
      { onSuccess: () => { setCreateOpen(false); reset(); } },
    );
  };

  const closeModal = () => { setCreateOpen(false); reset(); };

  const columns: ColumnDef<StockMovement>[] = [
    { key: 'date', header: 'Tarih', width: '110px', render: (r) => <span className="text-slate-400">{formatDate(r.createdAt)}</span> },
    {
      key: 'type', header: 'Tip', width: '100px',
      render: (r) => <span className={`text-sm font-medium ${MOVEMENT_TYPE_COLORS[r.type]}`}>{MOVEMENT_TYPE_LABELS[r.type]}</span>,
    },
    {
      key: 'product', header: 'Ürün',
      render: (r) => (
        <div>
          <p className="text-slate-200">{r.product?.name ?? '—'}</p>
          <p className="text-xs text-slate-500 font-mono">{r.product?.code}</p>
        </div>
      ),
    },
    {
      key: 'warehouse', header: 'Depo',
      render: (r) => (
        <span className="text-sm text-slate-400">
          {r.fromWarehouse?.name ?? r.toWarehouse?.name ?? '—'}
        </span>
      ),
    },
    {
      key: 'quantity', header: 'Miktar', width: '100px', align: 'right',
      render: (r) => { const v = Number(r.quantity); return <span className="font-medium text-slate-200">{Number.isInteger(v) ? v : v.toFixed(3)}</span>; },
    },
  ];

  const activeType = MOVE_TYPES.find((t) => t.value === selectedType) ?? MOVE_TYPES[0];

  return (
    <div>
      <PageHeader
        title="Stok Hareketleri"
        subtitle="Tüm stok giriş, çıkış ve transfer hareketleri."
        action={
          <Link
            href="#"
            onClick={(e) => { e.preventDefault(); setCreateOpen(true); }}
            className="group relative inline-flex items-center gap-2.5 h-10 px-5 rounded-xl font-medium text-sm text-white
                       bg-gradient-to-r from-sky-500 to-sky-600 hover:from-sky-400 hover:to-sky-500
                       shadow-lg shadow-sky-500/20 hover:shadow-sky-500/30
                       transition-all duration-200 active:scale-[0.97]"
          >
            <span className="flex items-center justify-center w-5 h-5 rounded-md bg-white/15 group-hover:bg-white/20 transition-colors">
              <Plus className="w-3.5 h-3.5" />
            </span>
            Manuel Hareket
          </Link>
        }
      />

      <DataTable
        columns={columns}
        data={data?.data ?? []}
        keyExtractor={(r) => r.id}
        isLoading={isLoading}
        emptyTitle="Stok hareketi bulunamadı"
        pagination={data ? { page, pageSize: 20, total: data.meta.total, totalPages: data.meta.totalPages, onChange: setPage } : undefined}
      />

      {/* ── Manual movement modal ───────────────── */}
      <Modal isOpen={createOpen} onClose={closeModal} title="Manuel Stok Hareketi"
        description="Ürün için manuel stok giriş, çıkış veya düzeltme yapın." size="md"
        footer={
          <>
            <Button variant="ghost" size="sm" leftIcon={<X className="w-3.5 h-3.5" />} onClick={closeModal}>İptal</Button>
            <Button size="sm" loading={createMovement.isPending} leftIcon={<Save className="w-3.5 h-3.5" />}
              onClick={handleSubmit(onSubmit)}
              className="bg-gradient-to-r from-sky-500 to-sky-600 hover:from-sky-400 hover:to-sky-500 shadow-lg shadow-sky-500/20">
              Kaydet
            </Button>
          </>
        }
      >
        <form className="space-y-5">
          {/* ── Type selector ─────────────────────── */}
          <div>
            <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2.5 block">Hareket Tipi</label>
            <div className="grid grid-cols-4 gap-2">
              {MOVE_TYPES.map((t) => {
                const Icon = t.icon;
                const active = selectedType === t.value;
                return (
                  <button key={t.value} type="button"
                    onClick={() => setValue('type', t.value)}
                    className={cn(
                      'flex flex-col items-center gap-1.5 p-3 rounded-xl border transition-all duration-200',
                      active
                        ? `${t.bg} ${t.border} ring-2 ${t.ring}`
                        : 'border-slate-800 bg-slate-800/40 hover:border-slate-700 hover:bg-slate-800/70',
                    )}
                  >
                    <Icon className={cn('w-5 h-5', active ? t.color : 'text-slate-500')} />
                    <span className={cn('text-xs font-medium', active ? t.color : 'text-slate-500')}>{t.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* ── Divider ───────────────────────────── */}
          <div className="h-px bg-slate-800" />

          {/* ── Product & Warehouse ───────────────── */}
          <div>
            <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2.5 block">Ürün & Depo</label>
            <div className="space-y-3">
              <Input label="Ürün ID" required placeholder="Ürün ID'sini girin" error={errors.productId?.message}
                prefixIcon={<Package className="w-3.5 h-3.5" />} {...register('productId')} />
              <Select label="Depo" required options={warehouseOptions} placeholder="Depo seçin"
                error={errors.warehouseId?.message} {...register('warehouseId')} />
            </div>
          </div>

          {/* ── Divider ───────────────────────────── */}
          <div className="h-px bg-slate-800" />

          {/* ── Quantity & Cost ────────────────────── */}
          <div>
            <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2.5 block">Miktar & Maliyet</label>
            <FormRow cols={2}>
              <Input label="Miktar" required type="number" step="0.001" placeholder="0.000"
                error={errors.quantity?.message} prefixIcon={<Hash className="w-3.5 h-3.5" />} {...register('quantity')} />
              <Input label="Birim Maliyet (₺)" type="number" step="0.01" placeholder="0.00"
                prefixIcon={<Coins className="w-3.5 h-3.5" />} {...register('unitCost')} />
            </FormRow>
          </div>

          {/* ── Notes ─────────────────────────────── */}
          <Input label="Notlar" placeholder="Açıklama veya referans notu…"
            prefixIcon={<StickyNote className="w-3.5 h-3.5" />} {...register('notes')} />

          {/* ── Summary hint ──────────────────────── */}
          <div className={cn('flex items-center gap-2.5 p-3 rounded-lg border', activeType.bg, activeType.border)}>
            <activeType.icon className={cn('w-4 h-4 shrink-0', activeType.color)} />
            <p className="text-xs text-slate-400">
              <span className={cn('font-semibold', activeType.color)}>{activeType.label}</span> hareketi oluşturulacak.
              Kaydet butonuna basarak işlemi onaylayın.
            </p>
          </div>
        </form>
      </Modal>
    </div>
  );
}
