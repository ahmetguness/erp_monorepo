'use client';

import {
  Activity,
  Bell,
  CheckCircle2,
  CircleDot,
  ClipboardCheck,
  CreditCard,
  FileText,
  Mail,
  Paperclip,
  Wrench,
} from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { useActivity } from '@/hooks/useActivity';
import { formatDateTime } from '@/lib/utils';
import type { AuditEntityType } from '@/services/audit-log.service';
import type { ActivityItem, ActivitySource, ActivityTone } from '@/services/activity.service';

interface EntityActivityTimelineProps {
  entityType: AuditEntityType;
  entityId: string;
  module?: string;
  title?: string;
  limit?: number;
}

const SOURCE_LABELS: Record<ActivitySource, string> = {
  AUDIT: 'İşlem',
  ATTACHMENT: 'Dosya',
  MAIL: 'Mail',
  TASK: 'Görev',
  NOTIFICATION: 'Bildirim',
  APPROVAL: 'Onay',
  PAYMENT: 'Ödeme',
  SERVICE: 'Servis',
};

const TONE_BADGES: Record<ActivityTone, 'neutral' | 'success' | 'danger' | 'warning' | 'info'> = {
  neutral: 'neutral',
  success: 'success',
  danger: 'danger',
  warning: 'warning',
  info: 'info',
};

function getActivityIcon(item: ActivityItem) {
  if (item.sourceType === 'ATTACHMENT') return <Paperclip className="h-4 w-4 text-cyan-400" />;
  if (item.sourceType === 'MAIL') return <Mail className="h-4 w-4 text-sky-400" />;
  if (item.sourceType === 'TASK') return <ClipboardCheck className="h-4 w-4 text-amber-400" />;
  if (item.sourceType === 'NOTIFICATION') return <Bell className="h-4 w-4 text-indigo-400" />;
  if (item.sourceType === 'APPROVAL') return <CheckCircle2 className="h-4 w-4 text-emerald-400" />;
  if (item.sourceType === 'PAYMENT') return <CreditCard className="h-4 w-4 text-emerald-400" />;
  if (item.sourceType === 'SERVICE') return <Wrench className="h-4 w-4 text-orange-400" />;
  if (item.tone === 'success') return <CheckCircle2 className="h-4 w-4 text-emerald-400" />;
  if (item.tone === 'danger') return <CircleDot className="h-4 w-4 text-red-400" />;
  return <FileText className="h-4 w-4 text-slate-400" />;
}

function ActivityItemRow({ item }: { item: ActivityItem }) {
  const details = item.technicalDetails ?? item.description;
  const content = (
    <>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-medium text-slate-200">{item.businessSummary}</p>
            <Badge variant={TONE_BADGES[item.tone]}>{SOURCE_LABELS[item.sourceType]}</Badge>
            {item.module && <span className="text-[11px] text-slate-500">{item.module}</span>}
          </div>
          {details && (
            <p className="mt-1 line-clamp-2 text-xs text-slate-500">{details}</p>
          )}
        </div>
        <time className="shrink-0 text-right text-[11px] text-slate-500">{formatDateTime(item.occurredAt)}</time>
      </div>
    </>
  );

  return (
    <li className="relative pl-8">
      <span className="absolute left-0 top-0.5 flex h-7 w-7 items-center justify-center rounded-full border border-slate-800 bg-slate-950">
        {getActivityIcon(item)}
      </span>
      {item.href ? (
        <a href={item.href} className="block rounded-lg border border-slate-800 bg-slate-950/50 px-3 py-2.5 transition-colors hover:border-sky-500/40 hover:bg-slate-950">
          {content}
        </a>
      ) : (
        <div className="rounded-lg border border-slate-800 bg-slate-950/50 px-3 py-2.5">
          {content}
        </div>
      )}
    </li>
  );
}

export function EntityActivityTimeline({
  entityType,
  entityId,
  title = 'Aktivite Geçmişi',
  limit = 12,
}: EntityActivityTimelineProps) {
  const { data, isLoading, isError } = useActivity({ entityType, entityId, limit });
  const items = data?.data ?? [];

  if (isError) return null;

  return (
    <section className="rounded-xl border border-slate-800 bg-slate-900 p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Activity className="h-4 w-4 text-sky-400" />
          <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">{title}</h3>
        </div>
        {data?.meta.total !== undefined && <span className="text-[10px] text-slate-500">{data.meta.total} kayıt</span>}
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, index) => (
            <div key={index} className="h-14 animate-pulse rounded-lg bg-slate-800/50" />
          ))}
        </div>
      ) : items.length > 0 ? (
        <ol className="space-y-3">
          {items.map((item) => (
            <ActivityItemRow key={item.id} item={item} />
          ))}
        </ol>
      ) : (
        <div className="rounded-lg border border-dashed border-slate-800 bg-slate-950/40 px-3 py-5 text-center">
          <p className="text-sm text-slate-400">Henüz aktivite yok.</p>
          <p className="mt-1 text-xs text-slate-600">Bu kayıt için işlemler oluştukça burada görünecek.</p>
        </div>
      )}
    </section>
  );
}
