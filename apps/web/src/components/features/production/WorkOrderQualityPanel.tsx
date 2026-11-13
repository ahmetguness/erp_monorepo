'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Textarea } from '@/components/ui/Textarea';
import { useProductionQuality } from '@/hooks/useProductionQuality';
import type { WorkOrder } from '@/services/production.service';

const labels = { NOT_REQUIRED: 'Kontrol istenmedi', PENDING: 'Onay bekliyor', APPROVED: 'Onaylandı', REJECTED: 'Reddedildi' };

export function WorkOrderQualityPanel({ order }: { order: WorkOrder }) {
  const [reason, setReason] = useState('');
  const mutation = useProductionQuality(order.id);
  const active = order.status === 'IN_PROGRESS' || order.status === 'PAUSED';
  return <section aria-label="Kalite kararı" className="mb-6 rounded-xl border border-slate-700 p-4 space-y-3">
    <p className="text-sm text-slate-200">Kalite: {labels[order.qualityStatus ?? 'NOT_REQUIRED']}</p>
    {active && <>
      <Textarea label="Kalite kararı gerekçesi" value={reason} onChange={(event) => setReason(event.target.value)} maxLength={1000} />
      <div className="flex gap-2">
        {(['APPROVED', 'REJECTED'] as const).map((decision) => <Button key={decision} size="sm"
          disabled={mutation.isPending || reason.trim().length < 3 || (decision === 'APPROVED' && order.producedQty <= 0)}
          onClick={() => mutation.mutate({ decision, reason, idempotencyKey: crypto.randomUUID() })}>
          {decision === 'APPROVED' ? 'Kaliteyi onayla' : 'Kaliteyi reddet'}
        </Button>)}
      </div>
    </>}
  </section>;
}
