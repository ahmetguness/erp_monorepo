'use client';

import { useRouter } from 'next/navigation';
import { ArrowLeft, Play, CheckCircle, Clock, User, MessageSquare } from 'lucide-react';
import { PageHeader } from '@/components/shared/PageHeader';
import { AttachmentPanel } from '@/components/shared/AttachmentPanel';
import { EntityActivityTimeline } from '@/components/shared/EntityActivityTimeline';
import { EntityTaskActions } from '@/components/shared/EntityTaskActions';
import { EntityImageManager } from '@/components/shared/EntityImageManager';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { useServiceRequest, useChangeServiceRequestStatus } from '@/hooks/useService';
import { formatDate, formatCurrency } from '@/lib/utils';

const STATUS_MAP: Record<string, { label: string; variant: 'neutral' | 'success' | 'warning' | 'danger' | 'info' }> = {
  OPEN: { label: 'Açık', variant: 'info' },
  IN_PROGRESS: { label: 'Devam Ediyor', variant: 'warning' },
  WAITING_PARTS: { label: 'Parça Bekliyor', variant: 'neutral' },
  WAITING_CUSTOMER: { label: 'Müşteri Bekliyor', variant: 'neutral' },
  COMPLETED: { label: 'Tamamlandı', variant: 'success' },
  CANCELLED: { label: 'İptal', variant: 'danger' },
};

const PRIORITY_MAP: Record<string, { label: string; variant: 'neutral' | 'success' | 'warning' | 'danger' | 'info' }> = {
  LOW: { label: 'Düşük', variant: 'neutral' },
  MEDIUM: { label: 'Orta', variant: 'info' },
  HIGH: { label: 'Yüksek', variant: 'warning' },
  CRITICAL: { label: 'Kritik', variant: 'danger' },
};

const ACTIVITY_ICONS: Record<string, string> = {
  NOTE: '📝', STATUS_CHANGE: '🔄', ASSIGNMENT: '👤', CALL: '📞', VISIT: '🏠', OTHER: '📌',
};

export function ServiceRequestDetailPage({ id }: { id: string }) {
  const router = useRouter();
  const { data: sr, isLoading } = useServiceRequest(id);
  const changeStatus = useChangeServiceRequestStatus();

  if (isLoading) return <div className="flex items-center justify-center py-20"><div className="w-5 h-5 border-2 border-sky-500 border-t-transparent rounded-full animate-spin" /></div>;
  if (!sr) return <div className="text-center py-20 text-slate-400">Servis talebi bulunamadı.</div>;

  const s = STATUS_MAP[sr.status];
  const p = PRIORITY_MAP[sr.priority];

  return (
    <div>
      <PageHeader title={`${sr.number} — ${sr.subject}`} subtitle={sr.contact?.name ?? ''}
        action={
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => router.back()}><ArrowLeft className="w-4 h-4" />Geri</Button>
            {sr.status === 'OPEN' && <Button size="sm" onClick={() => changeStatus.mutate({ id, data: { status: 'IN_PROGRESS' } })}><Play className="w-4 h-4" />Başlat</Button>}
            {sr.status === 'IN_PROGRESS' && <Button size="sm" onClick={() => changeStatus.mutate({ id, data: { status: 'COMPLETED' } })}><CheckCircle className="w-4 h-4" />Tamamla</Button>}
          </div>
        }
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {[
          { label: 'Durum', value: s ? <Badge variant={s.variant}>{s.label}</Badge> : sr.status },
          { label: 'Öncelik', value: p ? <Badge variant={p.variant}>{p.label}</Badge> : sr.priority },
          { label: 'Varlık', value: sr.customerAsset ? `${sr.customerAsset.name} (${sr.customerAsset.serialNo ?? '—'})` : '—' },
          { label: 'Garanti', value: sr.warrantyEnd ? (new Date(sr.warrantyEnd) > new Date() ? `Aktif — ${formatDate(sr.warrantyEnd)}` : 'Süresi Dolmuş') : '—' },
        ].map((item) => (
          <div key={item.label} className="bg-slate-900 border border-slate-800 rounded-xl px-4 py-3">
            <div className="text-[10px] text-slate-500 mb-1">{item.label}</div>
            <div className="text-sm text-white">{item.value}</div>
          </div>
        ))}
      </div>

      {sr.description && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 mb-6">
          <h3 className="text-sm font-semibold text-white mb-2">Açıklama</h3>
          <p className="text-sm text-slate-300">{sr.description}</p>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Items */}
        {sr.items && sr.items.length > 0 && (
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
            <h3 className="text-sm font-semibold text-white mb-4">Parça / Hizmet</h3>
            <div className="space-y-3">
              {sr.items.map((item) => (
                <div key={item.id} className="flex items-center justify-between">
                  <div>
                    <span className="text-sm text-white">{item.description}</span>
                    {item.product && <span className="block text-xs text-slate-500 font-mono">{item.product.code}</span>}
                  </div>
                  <div className="text-right">
                    <span className="text-sm text-white">{item.quantity} × {formatCurrency(item.unitPrice)}</span>
                    <span className="block text-xs text-slate-400">{formatCurrency(item.lineTotal)}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Activities */}
        {sr.activities && sr.activities.length > 0 && (
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
            <h3 className="text-sm font-semibold text-white mb-4">Aktiviteler</h3>
            <div className="space-y-3">
              {sr.activities.map((act) => (
                <div key={act.id} className="flex items-start gap-3">
                  <span className="text-base flex-shrink-0 mt-0.5">{ACTIVITY_ICONS[act.activityType] ?? '📌'}</span>
                  <div className="flex-1">
                    <span className="text-sm text-slate-300">{act.notes ?? act.activityType}</span>
                    <span className="block text-xs text-slate-600 mt-0.5">{formatDate(act.createdAt)}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="mt-6">
        <EntityImageManager
          entityType="SERVICE_REQUEST"
          entityId={id}
          label="Servis fotoğrafı"
          description="Arıza, bakım öncesi veya bakım sonrası görseli yükleyin."
        />
      </div>

      <div className="mt-6">
        <AttachmentPanel entityType="SERVICE_REQUEST" entityId={id} />
      </div>
      <div className="mt-6">
        <EntityTaskActions entityType="SERVICE_REQUEST" entityId={id} entityLabel={`${sr.number} - ${sr.subject}`} module="service" />
      </div>
      <div className="mt-6">
        <EntityActivityTimeline entityType="SERVICE_REQUEST" entityId={id} />
      </div>
    </div>
  );
}
