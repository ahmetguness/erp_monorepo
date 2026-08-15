'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import {
  AlertTriangle, ArrowLeft, CheckCircle, ClipboardCheck, Equal,
  Package, ToggleLeft, ToggleRight, TrendingDown, TrendingUp, Warehouse, X,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import { Badge } from '@/components/ui/Badge';
import { FullPageSpinner } from '@/components/ui/Spinner';
import { useStockCount, useFinalizeStockCount } from '@/hooks/useStock';
import { cn, formatDate } from '@/lib/utils';
import type { StockCountItem } from '@/services/stock.service';

type DiffFilter = 'all' | 'deficit' | 'surplus' | 'match';

function fmtQty(value: number): string {
  return new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 3 }).format(value);
}

function diffClass(diff: number): string {
  if (diff < 0) return 'text-amber-300';
  if (diff > 0) return 'text-emerald-300';
  return 'text-slate-500';
}

function Difference({ diff }: { diff: number }) {
  return (
    <span className={cn('inline-flex min-w-[44px] justify-center rounded-md px-2 py-0.5 text-xs font-semibold tabular-nums', diff === 0 ? 'bg-slate-800 text-slate-500' : diff > 0 ? 'bg-emerald-500/15 text-emerald-300' : 'bg-amber-500/15 text-amber-300')}>
      {diff === 0 ? '0' : diff > 0 ? `+${fmtQty(diff)}` : fmtQty(diff)}
    </span>
  );
}

interface Props { id: string }

export function StockCountDetailPage({ id }: Props) {
  const router = useRouter();
  const { data: count, isLoading } = useStockCount(id);
  const finalize = useFinalizeStockCount(id);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [applyAdjustments, setApplyAdjustments] = useState(true);
  const [filter, setFilter] = useState<DiffFilter>('all');

  const items = useMemo(() => count?.items ?? [], [count?.items]);
  const stats = useMemo(() => {
    const deficit = items.filter((item) => Number(item.difference) < 0);
    const surplus = items.filter((item) => Number(item.difference) > 0);
    const match = items.filter((item) => Number(item.difference) === 0);
    return { total: items.length, deficit, surplus, match, differences: deficit.length + surplus.length };
  }, [items]);

  const filtered = useMemo(() => {
    if (filter === 'deficit') return stats.deficit;
    if (filter === 'surplus') return stats.surplus;
    if (filter === 'match') return stats.match;
    return items;
  }, [filter, items, stats]);

  if (isLoading) return <FullPageSpinner />;
  if (!count) return <div className="text-sm text-slate-400">Sayım bulunamadı.</div>;

  const filters: { key: DiffFilter; label: string; count: number; className: string }[] = [
    { key: 'all', label: 'Tümü', count: stats.total, className: 'text-sky-300' },
    { key: 'deficit', label: 'Eksik', count: stats.deficit.length, className: 'text-amber-300' },
    { key: 'surplus', label: 'Fazla', count: stats.surplus.length, className: 'text-emerald-300' },
    { key: 'match', label: 'Eşit', count: stats.match.length, className: 'text-slate-400' },
  ];

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2 text-xs text-slate-500">
        <Link href="/dashboard/stock/counts" className="transition-colors duration-150 hover:text-sky-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/40">Stok Sayımları</Link>
        <span>/</span>
        <span className="font-mono text-slate-300">{count.number}</span>
      </div>

      <div className="flex flex-col gap-4 border-b border-slate-800/80 pb-5 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => router.push('/dashboard/stock/counts')} className="rounded-lg border border-slate-800 bg-slate-950/40 p-2 text-slate-400 transition-colors hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/40">
              <ArrowLeft className="h-4 w-4" />
            </button>
            <h1 className="text-xl font-semibold tracking-tight text-white">Sayım {count.number}</h1>
            <Badge variant={count.isFinalized ? 'success' : 'warning'}>{count.isFinalized ? 'Tamamlandı' : 'Devam Ediyor'}</Badge>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-500">
            <span className="flex items-center gap-1.5"><Warehouse className="h-3.5 w-3.5" />{count.warehouse?.name ?? 'Depo bilgisi yok'}</span>
            <span>{formatDate(count.date)}</span>
            {count.isFinalized && count.finalizedAt && <span>Tamamlanma: {formatDate(count.finalizedAt)}</span>}
          </div>
        </div>
        {!count.isFinalized && <Button leftIcon={<CheckCircle className="h-4 w-4" />} onClick={() => setConfirmOpen(true)}>Sayımı Tamamla</Button>}
      </div>

      <div className="grid rounded-xl border border-slate-800/80 bg-slate-950/35 sm:grid-cols-4">
        {[
          { label: 'Toplam Kalem', value: stats.total, className: 'text-slate-100' },
          { label: 'Eksik', value: stats.deficit.length, className: stats.deficit.length > 0 ? 'text-amber-300' : 'text-slate-100' },
          { label: 'Fazla', value: stats.surplus.length, className: stats.surplus.length > 0 ? 'text-emerald-300' : 'text-slate-100' },
          { label: 'Fark Bulunan', value: stats.differences, className: stats.differences > 0 ? 'text-amber-300' : 'text-emerald-300' },
        ].map((metric) => (
          <div key={metric.label} className="border-b border-slate-800/70 px-4 py-3 last:border-b-0 sm:border-b-0 sm:border-r sm:last:border-r-0">
            <p className={cn('text-base font-semibold tabular-nums', metric.className)}>{metric.value}</p>
            <p className="mt-0.5 text-[11px] font-medium uppercase text-slate-500">{metric.label}</p>
          </div>
        ))}
      </div>

      <section className="overflow-hidden rounded-xl border border-slate-800/80 bg-slate-950/40">
        <div className="flex flex-col gap-3 border-b border-slate-800/70 px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-sm font-semibold text-white">Sayım Kalemleri</h2>
            <p className="mt-0.5 text-xs text-slate-500">Sistem stoku ile sayılan miktar karşılaştırması.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {filters.map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={() => setFilter(item.key)}
                className={cn('inline-flex h-8 items-center gap-1.5 rounded-lg border px-3 text-xs font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/40', filter === item.key ? 'border-sky-500/40 bg-sky-500/10 text-sky-200' : 'border-slate-800 bg-slate-950/35 text-slate-400 hover:border-slate-700 hover:text-slate-200')}
              >
                {item.label}
                <span className={cn('tabular-nums', filter === item.key ? 'text-sky-200' : item.className)}>{item.count}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] text-sm">
            <thead className="bg-slate-900/95">
              <tr className="border-b border-slate-800/80">
                {['Ürün', 'Sistem Stoku', 'Sayılan', 'Fark', 'Durum'].map((header, index) => (
                  <th key={header} className={cn('px-4 py-3 text-left text-[11px] font-semibold uppercase text-slate-500', [1, 2, 3].includes(index) && 'text-right', index === 4 && 'text-center')}>{header}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-12 text-center">
                    <ClipboardCheck className="mx-auto mb-2 h-8 w-8 text-slate-700" />
                    <p className="text-sm text-slate-500">Bu filtrede kalem bulunamadı.</p>
                  </td>
                </tr>
              ) : filtered.map((item: StockCountItem) => {
                const diff = Number(item.difference);
                const expected = Number(item.expectedQty);
                const counted = Number(item.countedQty);
                return (
                  <tr key={item.id} className="border-b border-slate-800/45 transition-colors duration-150 last:border-b-0 hover:bg-sky-500/[0.035]">
                    <td className="px-4 py-3.5">
                      <p className="font-medium text-slate-100">{item.product?.name ?? '-'}</p>
                      <p className="font-mono text-xs text-slate-500">{item.product?.code ?? ''}</p>
                    </td>
                    <td className="px-4 py-3.5 text-right tabular-nums text-slate-400">{fmtQty(expected)}</td>
                    <td className="px-4 py-3.5 text-right font-semibold tabular-nums text-slate-100">{fmtQty(counted)}</td>
                    <td className={cn('px-4 py-3.5 text-right', diffClass(diff))}><Difference diff={diff} /></td>
                    <td className="px-4 py-3.5 text-center">
                      {diff < 0 ? <Badge variant="warning">Eksik</Badge> : diff > 0 ? <Badge variant="success">Fazla</Badge> : <Badge variant="neutral">Eşit</Badge>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <Modal
        isOpen={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title="Sayımı Tamamla"
        description="Bu işlem geri alınamaz."
        size="sm"
        footer={<><Button variant="ghost" size="sm" leftIcon={<X className="h-3.5 w-3.5" />} onClick={() => setConfirmOpen(false)} disabled={finalize.isPending}>İptal</Button><Button size="sm" loading={finalize.isPending} leftIcon={<CheckCircle className="h-3.5 w-3.5" />} onClick={() => finalize.mutate(applyAdjustments, { onSuccess: () => setConfirmOpen(false) })}>Tamamla ve Uygula</Button></>}
      >
        <div className="space-y-4">
          <div className="flex items-start gap-3 rounded-xl border border-amber-500/15 bg-amber-500/5 p-3.5">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" />
            <p className="text-xs leading-relaxed text-slate-400">Sayımı tamamladığınızda stok düzeltmeleri uygulanabilir ve işlem geçmişe alınır.</p>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <MiniStat icon={<Package className="h-3.5 w-3.5" />} label="Kalem" value={stats.total} />
            <MiniStat icon={<TrendingUp className="h-3.5 w-3.5" />} label="Fazla" value={stats.surplus.length} tone="text-emerald-300" />
            <MiniStat icon={<TrendingDown className="h-3.5 w-3.5" />} label="Eksik" value={stats.deficit.length} tone="text-amber-300" />
          </div>
          <button type="button" onClick={() => setApplyAdjustments((value) => !value)} className={cn('flex w-full items-center gap-3 rounded-xl border p-3 transition-colors duration-150', applyAdjustments ? 'border-emerald-500/20 bg-emerald-500/5' : 'border-slate-800 bg-slate-950/35')}>
            {applyAdjustments ? <ToggleRight className="h-6 w-6 shrink-0 text-emerald-300" /> : <ToggleLeft className="h-6 w-6 shrink-0 text-slate-600" />}
            <div className="text-left">
              <p className={cn('text-sm font-medium', applyAdjustments ? 'text-emerald-300' : 'text-slate-400')}>Stok düzeltmelerini uygula</p>
              <p className="mt-0.5 text-xs text-slate-500">Farklar otomatik olarak stok hareketine dönüştürülür.</p>
            </div>
          </button>
        </div>
      </Modal>
    </div>
  );
}

function MiniStat({ icon, label, value, tone = 'text-slate-100' }: { icon: React.ReactNode; label: string; value: number; tone?: string }) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-950/35 p-3 text-center">
      <div className="mx-auto mb-1 flex justify-center text-slate-500">{icon}</div>
      <p className={cn('text-lg font-semibold tabular-nums', tone)}>{value}</p>
      <p className="text-[10px] uppercase text-slate-500">{label}</p>
    </div>
  );
}
