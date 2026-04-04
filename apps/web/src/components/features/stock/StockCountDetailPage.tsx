'use client';

import { useState } from 'react';
import { CheckCircle } from 'lucide-react';
import { PageHeader } from '@/components/shared/PageHeader';
import { DataTable, type ColumnDef } from '@/components/shared/DataTable';
import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Badge } from '@/components/ui/Badge';
import { FullPageSpinner } from '@/components/ui/Spinner';
import { useStockCount, useFinalizeStockCount } from '@/hooks/useStock';
import { formatDate } from '@/lib/utils';
import type { StockCountItem } from '@/services/stock.service';

interface Props { id: string }

export function StockCountDetailPage({ id }: Props) {
  const { data: count, isLoading } = useStockCount(id);
  const finalize = useFinalizeStockCount(id);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [applyAdjustments, setApplyAdjustments] = useState(true);

  const columns: ColumnDef<StockCountItem>[] = [
    {
      key: 'product', header: 'Ürün',
      render: (r) => (
        <div>
          <p className="text-slate-200">{r.product?.name ?? '—'}</p>
          <p className="text-xs text-slate-500 font-mono">{r.product?.code}</p>
        </div>
      ),
    },
    { key: 'expectedQty', header: 'Beklenen', width: '100px', align: 'right', render: (r) => <span className="text-slate-400">{Number(r.expectedQty).toFixed(3)}</span> },
    { key: 'countedQty', header: 'Sayılan', width: '100px', align: 'right', render: (r) => <span className="text-slate-200 font-medium">{Number(r.countedQty).toFixed(3)}</span> },
    {
      key: 'difference', header: 'Fark', width: '100px', align: 'right',
      render: (r) => {
        const diff = Number(r.difference);
        return <span className={diff > 0 ? 'text-emerald-400' : diff < 0 ? 'text-red-400' : 'text-slate-500'}>{diff > 0 ? '+' : ''}{diff.toFixed(3)}</span>;
      },
    },
  ];

  if (isLoading) return <FullPageSpinner />;
  if (!count) return <div className="text-slate-400 text-sm">Sayım bulunamadı.</div>;

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Sayım ${count.number}`}
        subtitle={`${count.warehouse?.name ?? ''} — ${formatDate(count.date)}`}
        action={
          !count.isFinalized && (
            <Button leftIcon={<CheckCircle className="w-4 h-4" />} onClick={() => setConfirmOpen(true)}>
              Sayımı Tamamla
            </Button>
          )
        }
      />

      <div className="flex items-center gap-3">
        <Badge variant={count.isFinalized ? 'success' : 'warning'}>
          {count.isFinalized ? 'Tamamlandı' : 'Devam Ediyor'}
        </Badge>
        {count.isFinalized && count.finalizedAt && (
          <span className="text-xs text-slate-500">{formatDate(count.finalizedAt)}</span>
        )}
      </div>

      <DataTable
        columns={columns}
        data={count.items ?? []}
        keyExtractor={(r) => r.id}
        emptyTitle="Sayım kalemi bulunamadı"
      />

      <ConfirmDialog
        isOpen={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={() => finalize.mutate(applyAdjustments, { onSuccess: () => setConfirmOpen(false) })}
        title="Sayımı Tamamla"
        message="Sayımı tamamlamak istediğinize emin misiniz? Stok düzeltmeleri otomatik uygulanacaktır."
        confirmLabel="Tamamla ve Uygula"
        isLoading={finalize.isPending}
        variant="warning"
      />
    </div>
  );
}
