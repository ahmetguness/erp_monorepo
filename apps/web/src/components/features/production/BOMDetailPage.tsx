'use client';

import { useRouter } from 'next/navigation';
import { ArrowLeft, Package, Cog, Trash2 } from 'lucide-react';
import { PageHeader } from '@/components/shared/PageHeader';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { useBOM, useRemoveBOMItem, useRemoveBOMRouting } from '@/hooks/useProduction';

export function BOMDetailPage({ id }: { id: string }) {
  const router = useRouter();
  const { data: bom, isLoading } = useBOM(id);
  const removeItem = useRemoveBOMItem();
  const removeRouting = useRemoveBOMRouting();

  if (isLoading) return <div className="flex items-center justify-center py-20"><div className="w-5 h-5 border-2 border-sky-500 border-t-transparent rounded-full animate-spin" /></div>;
  if (!bom) return <div className="text-center py-20 text-slate-400">BOM bulunamadı.</div>;

  return (
    <div>
      <PageHeader title={bom.name} subtitle={`${bom.product?.name ?? ''} — v${bom.version}`}
        action={<Button variant="ghost" size="sm" onClick={() => router.back()}><ArrowLeft className="w-4 h-4" />Geri</Button>} />

      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-slate-900 border border-slate-800 rounded-xl px-4 py-3">
          <div className="text-[10px] text-slate-500 mb-1">Ürün</div>
          <div className="text-sm text-white">{bom.product?.name} <span className="text-slate-500 font-mono">({bom.product?.code})</span></div>
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-xl px-4 py-3">
          <div className="text-[10px] text-slate-500 mb-1">Versiyon</div>
          <div className="text-sm text-white">{bom.version}</div>
        </div>
        <div className="bg-slate-900 border border-slate-800 rounded-xl px-4 py-3">
          <div className="text-[10px] text-slate-500 mb-1">Durum</div>
          <div>{bom.isActive ? <Badge variant="success">Aktif</Badge> : <Badge variant="neutral">Pasif</Badge>}</div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Items */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-white mb-4">Malzemeler ({bom.items?.length ?? 0})</h3>
          {bom.items && bom.items.length > 0 ? (
            <div className="space-y-3">
              {bom.items.map((item) => (
                <div key={item.id} className="flex items-center justify-between group">
                  <div className="flex items-center gap-3">
                    <div className="w-7 h-7 rounded-lg bg-slate-800 flex items-center justify-center"><Package className="w-3.5 h-3.5 text-slate-400" /></div>
                    <div>
                      <span className="text-sm text-white">{item.product?.name ?? '—'}</span>
                      <span className="block text-xs text-slate-500">{item.quantity} {item.unit ?? 'AD'}</span>
                    </div>
                  </div>
                  <button onClick={() => removeItem.mutate({ bomId: id, itemId: item.id })}
                    className="p-1.5 rounded-lg text-slate-700 hover:text-red-400 hover:bg-red-500/10 opacity-0 group-hover:opacity-100 transition-all"><Trash2 className="w-3 h-3" /></button>
                </div>
              ))}
            </div>
          ) : <p className="text-sm text-slate-500">Malzeme eklenmemiş.</p>}
        </div>

        {/* Routings */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-white mb-4">Operasyonlar ({bom.routings?.length ?? 0})</h3>
          {bom.routings && bom.routings.length > 0 ? (
            <div className="space-y-3">
              {bom.routings.map((r, i) => (
                <div key={r.id} className="flex items-center gap-3 group">
                  <span className="w-6 h-6 rounded-lg bg-sky-500/15 text-sky-400 flex items-center justify-center text-xs font-bold flex-shrink-0">{i + 1}</span>
                  <div className="flex-1">
                    <span className="text-sm text-white">{r.name}</span>
                    <span className="block text-xs text-slate-500">{r.workCenter?.name} — {r.setupTime ?? 0}dk kurulum, {r.runTime ?? 0}dk/birim</span>
                  </div>
                  <button onClick={() => removeRouting.mutate({ bomId: id, routingId: r.id })}
                    className="p-1.5 rounded-lg text-slate-700 hover:text-red-400 hover:bg-red-500/10 opacity-0 group-hover:opacity-100 transition-all"><Trash2 className="w-3 h-3" /></button>
                </div>
              ))}
            </div>
          ) : <p className="text-sm text-slate-500">Operasyon eklenmemiş.</p>}
        </div>
      </div>
    </div>
  );
}
