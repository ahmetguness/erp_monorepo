'use client';

import { useState, useMemo } from 'react';
import {
  CheckCircle, AlertTriangle, ClipboardCheck, ToggleLeft, ToggleRight,
  X, Sparkles, ArrowLeft, TrendingUp, TrendingDown, Equal, Package,
  Calendar, Warehouse,
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

function fmtQty(v: number): string {
  return Number.isInteger(v) ? String(v) : v.toFixed(3);
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

  // Stats
  const stats = useMemo(() => {
    const deficit = items.filter((i) => Number(i.difference) < 0);
    const surplus = items.filter((i) => Number(i.difference) > 0);
    const match = items.filter((i) => Number(i.difference) === 0);
    return { total: items.length, deficit, surplus, match };
  }, [items]);

  // Filtered items
  const filtered = useMemo(() => {
    switch (filter) {
      case 'deficit': return stats.deficit;
      case 'surplus': return stats.surplus;
      case 'match': return stats.match;
      default: return items;
    }
  }, [filter, items, stats]);

  if (isLoading) return <FullPageSpinner />;
  if (!count) return <div className="text-slate-400 text-sm">Sayım bulunamadı.</div>;

  const FILTERS: { key: DiffFilter; label: string; count: number; color: string; activeColor: string }[] = [
    { key: 'all', label: 'Tümü', count: stats.total, color: 'text-slate-400', activeColor: 'bg-sky-500/15 text-sky-400 border-sky-500/30' },
    { key: 'deficit', label: 'Eksik', count: stats.deficit.length, color: 'text-red-400', activeColor: 'bg-red-500/15 text-red-400 border-red-500/30' },
    { key: 'surplus', label: 'Fazla', count: stats.surplus.length, color: 'text-emerald-400', activeColor: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30' },
    { key: 'match', label: 'Eşit', count: stats.match.length, color: 'text-slate-400', activeColor: 'bg-slate-700/50 text-slate-300 border-slate-600/50' },
  ];

  return (
    <div className="space-y-5">
      {/* ── Header ──────────────────────────────── */}
      <div className="relative overflow-hidden bg-gradient-to-r from-violet-600/10 via-slate-900 to-sky-600/5 border border-slate-800 rounded-2xl p-5">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_rgba(139,92,246,0.06)_0%,transparent_60%)]" />
        <div className="relative z-10 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button type="button" onClick={() => router.back()}
              className="p-2.5 rounded-xl bg-slate-800/80 border border-slate-700/50 text-slate-400 hover:text-white hover:border-slate-600 transition-all">
              <ArrowLeft className="w-4 h-4" />
            </button>
            <div>
              <div className="flex items-center gap-2.5">
                <div className="p-1.5 rounded-lg bg-violet-500/10">
                  <ClipboardCheck className="w-4 h-4 text-violet-400" />
                </div>
                <h1 className="text-lg font-semibold text-white">Sayım {count.number}</h1>
                <Badge variant={count.isFinalized ? 'success' : 'warning'}>
                  {count.isFinalized ? 'Tamamlandı' : 'Devam Ediyor'}
                </Badge>
              </div>
              <div className="flex items-center gap-3 mt-1.5 ml-[38px]">
                <span className="flex items-center gap-1 text-xs text-slate-400">
                  <Warehouse className="w-3 h-3 text-slate-500" />{count.warehouse?.name}
                </span>
                <span className="w-px h-3 bg-slate-700" />
                <span className="flex items-center gap-1 text-xs text-slate-400">
                  <Calendar className="w-3 h-3 text-slate-500" />{formatDate(count.date)}
                </span>
                {count.isFinalized && count.finalizedAt && (
                  <>
                    <span className="w-px h-3 bg-slate-700" />
                    <span className="text-xs text-slate-500">Tamamlanma: {formatDate(count.finalizedAt)}</span>
                  </>
                )}
              </div>
            </div>
          </div>
          {!count.isFinalized && (
            <Button leftIcon={<CheckCircle className="w-4 h-4" />} onClick={() => setConfirmOpen(true)}
              className="bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-400 hover:to-emerald-500 shadow-lg shadow-emerald-500/20">
              Sayımı Tamamla
            </Button>
          )}
        </div>
      </div>

      {/* ── Summary cards ───────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-sky-500/10"><Package className="w-4 h-4 text-sky-400" /></div>
            <div>
              <p className="text-[10px] text-slate-500 uppercase tracking-wider">Toplam Kalem</p>
              <p className="text-xl font-bold text-white">{stats.total}</p>
            </div>
          </div>
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-red-500/10"><TrendingDown className="w-4 h-4 text-red-400" /></div>
            <div>
              <p className="text-[10px] text-slate-500 uppercase tracking-wider">Eksik</p>
              <p className="text-xl font-bold text-red-400">{stats.deficit.length}</p>
            </div>
          </div>
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-emerald-500/10"><TrendingUp className="w-4 h-4 text-emerald-400" /></div>
            <div>
              <p className="text-[10px] text-slate-500 uppercase tracking-wider">Fazla</p>
              <p className="text-xl font-bold text-emerald-400">{stats.surplus.length}</p>
            </div>
          </div>
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-slate-700/50"><Equal className="w-4 h-4 text-slate-400" /></div>
            <div>
              <p className="text-[10px] text-slate-500 uppercase tracking-wider">Eşit</p>
              <p className="text-xl font-bold text-slate-300">{stats.match.length}</p>
            </div>
          </div>
        </div>
      </div>

      {/* ── Filter tabs + Table ─────────────────── */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
        {/* Filter tabs */}
        <div className="flex items-center gap-2 px-5 py-3 border-b border-slate-800/60">
          {FILTERS.map((f) => (
            <button key={f.key} type="button" onClick={() => setFilter(f.key)}
              className={cn(
                'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all duration-200',
                filter === f.key ? f.activeColor : 'border-transparent text-slate-500 hover:text-slate-300 hover:bg-slate-800/50',
              )}>
              {f.label}
              <span className={cn(
                'text-[10px] font-bold px-1.5 py-0.5 rounded-full',
                filter === f.key ? 'bg-white/10' : 'bg-slate-800 text-slate-600',
              )}>{f.count}</span>
            </button>
          ))}
        </div>

        {/* Table header */}
        <div className="grid grid-cols-12 gap-2 px-5 py-2.5 bg-slate-800/30 text-[10px] font-semibold text-slate-500 uppercase tracking-wider border-b border-slate-800/40">
          <div className="col-span-1 text-center">#</div>
          <div className="col-span-4">Ürün</div>
          <div className="col-span-2 text-right">Beklenen</div>
          <div className="col-span-2 text-right">Sayılan</div>
          <div className="col-span-2 text-right">Fark</div>
          <div className="col-span-1 text-center">Durum</div>
        </div>

        {/* Table rows */}
        {filtered.length === 0 ? (
          <div className="py-12 text-center">
            <ClipboardCheck className="w-8 h-8 text-slate-700 mx-auto mb-2" />
            <p className="text-sm text-slate-500">Bu filtrede kalem bulunamadı.</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-800/40">
            {filtered.map((item, idx) => {
              const diff = Number(item.difference);
              const expected = Number(item.expectedQty);
              const counted = Number(item.countedQty);

              return (
                <div key={item.id} className={cn(
                  'grid grid-cols-12 gap-2 px-5 py-3 items-center transition-colors',
                  diff < 0 ? 'bg-red-500/[0.02] hover:bg-red-500/[0.05]'
                    : diff > 0 ? 'bg-emerald-500/[0.02] hover:bg-emerald-500/[0.05]'
                    : 'hover:bg-slate-800/20',
                )}>
                  <div className="col-span-1 text-center">
                    <span className="text-[10px] font-mono text-slate-600">{idx + 1}</span>
                  </div>
                  <div className="col-span-4 min-w-0">
                    <p className="text-sm font-medium text-slate-200 truncate">{item.product?.name ?? '—'}</p>
                    <p className="text-[10px] text-slate-500 font-mono">{item.product?.code}</p>
                  </div>
                  <div className="col-span-2 text-right">
                    <span className="text-sm text-slate-400 tabular-nums">{fmtQty(expected)}</span>
                  </div>
                  <div className="col-span-2 text-right">
                    <span className="text-sm font-semibold text-white tabular-nums">{fmtQty(counted)}</span>
                  </div>
                  <div className="col-span-2 text-right">
                    <span className={cn(
                      'inline-flex items-center justify-center min-w-[40px] text-xs font-bold px-2 py-0.5 rounded-md tabular-nums',
                      diff === 0 ? 'bg-slate-800 text-slate-500'
                        : diff > 0 ? 'bg-emerald-500/15 text-emerald-400'
                        : 'bg-red-500/15 text-red-400',
                    )}>
                      {diff === 0 ? '0' : diff > 0 ? `+${fmtQty(diff)}` : fmtQty(diff)}
                    </span>
                  </div>
                  <div className="col-span-1 flex justify-center">
                    {diff < 0 ? <TrendingDown className="w-3.5 h-3.5 text-red-400" />
                      : diff > 0 ? <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
                      : <Equal className="w-3.5 h-3.5 text-slate-600" />}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Finalize modal ──────────────────────── */}
      <Modal
        isOpen={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title="Sayımı Tamamla"
        description="Bu işlem geri alınamaz."
        size="sm"
        footer={
          <>
            <Button variant="ghost" size="sm" leftIcon={<X className="w-3.5 h-3.5" />}
              onClick={() => setConfirmOpen(false)} disabled={finalize.isPending}>İptal</Button>
            <Button size="sm" loading={finalize.isPending}
              leftIcon={<CheckCircle className="w-3.5 h-3.5" />}
              onClick={() => finalize.mutate(applyAdjustments, { onSuccess: () => setConfirmOpen(false) })}
              className="bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-400 hover:to-emerald-500 shadow-lg shadow-emerald-500/20">
              Tamamla ve Uygula
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="flex items-start gap-3 p-3.5 rounded-xl bg-amber-500/5 border border-amber-500/15">
            <div className="p-2 rounded-lg bg-amber-500/10 shrink-0">
              <AlertTriangle className="w-4 h-4 text-amber-400" />
            </div>
            <div>
              <p className="text-sm font-medium text-amber-300">Dikkat</p>
              <p className="text-xs text-slate-400 mt-0.5 leading-relaxed">
                Sayımı tamamladığınızda stok düzeltmeleri otomatik olarak uygulanacak ve bu işlem geri alınamayacaktır.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-3 text-center">
              <p className="text-lg font-bold text-white">{stats.total}</p>
              <p className="text-[10px] text-slate-500 uppercase tracking-wider mt-0.5">Kalem</p>
            </div>
            <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-3 text-center">
              <p className="text-lg font-bold text-emerald-400">{stats.surplus.length}</p>
              <p className="text-[10px] text-slate-500 uppercase tracking-wider mt-0.5">Fazla</p>
            </div>
            <div className="bg-slate-800/50 border border-slate-700/50 rounded-lg p-3 text-center">
              <p className="text-lg font-bold text-red-400">{stats.deficit.length}</p>
              <p className="text-[10px] text-slate-500 uppercase tracking-wider mt-0.5">Eksik</p>
            </div>
          </div>

          <button type="button" onClick={() => setApplyAdjustments((v) => !v)}
            className={cn(
              'w-full flex items-center gap-3 p-3 rounded-xl border transition-all duration-200',
              applyAdjustments ? 'bg-emerald-500/5 border-emerald-500/20' : 'bg-slate-800/30 border-slate-800',
            )}>
            {applyAdjustments
              ? <ToggleRight className="w-6 h-6 text-emerald-400 shrink-0" />
              : <ToggleLeft className="w-6 h-6 text-slate-600 shrink-0" />}
            <div className="text-left flex-1">
              <p className={cn('text-sm font-medium', applyAdjustments ? 'text-emerald-300' : 'text-slate-400')}>
                Stok düzeltmelerini uygula
              </p>
              <p className="text-[11px] text-slate-500 mt-0.5">Farklar otomatik olarak stok hareketine dönüştürülür.</p>
            </div>
            {applyAdjustments && <Sparkles className="w-4 h-4 text-emerald-500/50 shrink-0" />}
          </button>
        </div>
      </Modal>
    </div>
  );
}
