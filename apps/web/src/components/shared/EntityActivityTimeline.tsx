'use client';

import { Activity, CheckCircle2, CircleDot, Download, Pencil, PlusCircle, Trash2, XCircle } from 'lucide-react';
import { Badge } from '@/components/ui/Badge';
import { useAuditLogs } from '@/hooks/useAuditLogs';
import { formatDateTime } from '@/lib/utils';
import type { AuditEntityType, AuditLog } from '@/services/audit-log.service';

interface EntityActivityTimelineProps {
  entityType: AuditEntityType;
  entityId: string;
  module?: string;
  title?: string;
  limit?: number;
}

const ACTION_LABELS: Record<string, string> = {
  CREATE: 'Oluşturuldu',
  UPDATE: 'Güncellendi',
  DELETE: 'Silindi',
  APPROVE: 'Onaylandı',
  REJECT: 'Reddedildi',
  EXPORT: 'Dışa aktarıldı',
  LOGIN: 'Giriş yapıldı',
  LOGOUT: 'Çıkış yapıldı',
  OTHER: 'İşlem yapıldı',
};

const ACTION_BADGES: Record<string, 'neutral' | 'success' | 'danger' | 'warning' | 'info'> = {
  CREATE: 'success',
  UPDATE: 'info',
  DELETE: 'danger',
  APPROVE: 'success',
  REJECT: 'danger',
  EXPORT: 'warning',
  LOGIN: 'neutral',
  LOGOUT: 'neutral',
  OTHER: 'neutral',
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function getValueKeys(value: unknown): string[] {
  if (!isRecord(value)) return [];
  return Object.keys(value).filter((key) => value[key] !== null && value[key] !== undefined);
}

function getChangedFields(item: AuditLog): string[] {
  const oldKeys = getValueKeys(item.oldValues);
  const newKeys = getValueKeys(item.newValues);
  return Array.from(new Set([...oldKeys, ...newKeys])).slice(0, 5);
}

function getActivityIcon(action: string) {
  if (action === 'CREATE') return <PlusCircle className="h-4 w-4 text-emerald-400" />;
  if (action === 'UPDATE') return <Pencil className="h-4 w-4 text-sky-400" />;
  if (action === 'DELETE') return <Trash2 className="h-4 w-4 text-red-400" />;
  if (action === 'APPROVE') return <CheckCircle2 className="h-4 w-4 text-emerald-400" />;
  if (action === 'REJECT') return <XCircle className="h-4 w-4 text-red-400" />;
  if (action === 'EXPORT') return <Download className="h-4 w-4 text-amber-400" />;
  return <CircleDot className="h-4 w-4 text-slate-400" />;
}

function ActivityItem({ item }: { item: AuditLog }) {
  const changedFields = getChangedFields(item);

  return (
    <li className="relative pl-8">
      <span className="absolute left-0 top-0.5 flex h-7 w-7 items-center justify-center rounded-full border border-slate-800 bg-slate-950">
        {getActivityIcon(item.action)}
      </span>
      <div className="rounded-lg border border-slate-800 bg-slate-950/50 px-3 py-2.5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-medium text-slate-200">{ACTION_LABELS[item.action] ?? item.action}</p>
              <Badge variant={ACTION_BADGES[item.action] ?? 'neutral'}>{item.module}</Badge>
            </div>
            {changedFields.length > 0 && (
              <p className="mt-1 line-clamp-2 text-xs text-slate-500">
                Alanlar: {changedFields.join(', ')}
              </p>
            )}
          </div>
          <time className="shrink-0 text-right text-[11px] text-slate-500">{formatDateTime(item.createdAt)}</time>
        </div>
      </div>
    </li>
  );
}

export function EntityActivityTimeline({
  entityType,
  entityId,
  module,
  title = 'Aktivite Geçmişi',
  limit = 8,
}: EntityActivityTimelineProps) {
  const { data, isLoading, isError } = useAuditLogs({
    page: 1,
    limit,
    entityType,
    entityId,
    ...(module && { module }),
  });
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
            <ActivityItem key={item.id} item={item} />
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
