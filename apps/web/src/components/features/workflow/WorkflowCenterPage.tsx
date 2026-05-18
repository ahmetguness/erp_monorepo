'use client';

import { AlertTriangle, Bell, CheckCircle2, Clock, ExternalLink } from 'lucide-react';
import Link from 'next/link';
import { Badge, type BadgeVariant } from '@/components/ui/Badge';
import { PageHeader } from '@/components/shared/PageHeader';
import { useWorkflowTasks } from '@/hooks/useWorkflow';
import type { WorkflowTask } from '@/services/task.service';

const TYPE_LABEL: Record<WorkflowTask['type'], string> = {
  APPROVAL: 'Onay',
  COLLECTION: 'Tahsilat',
  SERVICE: 'Servis',
  NOTIFICATION: 'Bildirim',
  CHECK: 'Cek/Senet',
  AUTOMATION: 'Otomasyon',
  STOCK: 'Stok',
  FISCAL: 'Donem',
  GENERAL: 'Gorev',
};

const PRIORITY_BADGE: Record<WorkflowTask['priority'], BadgeVariant> = {
  LOW: 'neutral',
  MEDIUM: 'info',
  HIGH: 'warning',
  CRITICAL: 'danger',
};

function formatDate(value: string | null): string {
  if (!value) return '-';
  return new Intl.DateTimeFormat('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(value));
}

export function WorkflowCenterPage() {
  const { data, isLoading, isError } = useWorkflowTasks();
  const tasks = data?.data ?? [];
  const counts = data?.meta.counts;
  const criticalCount = tasks.filter((task) => task.priority === 'CRITICAL').length;

  return (
    <div>
      <PageHeader
        title="Is Akisi Merkezi"
        subtitle="Onaylar, gorevler, bildirimler, tahsilat, stok ve donem uyarilari tek ekranda."
      />

      <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-lg border border-slate-800 bg-slate-900/50 p-4">
          <Bell className="mb-3 h-5 w-5 text-sky-400" />
          <p className="text-2xl font-semibold text-slate-100">{data?.meta.total ?? 0}</p>
          <p className="text-xs text-slate-500">Toplam bekleyen is</p>
        </div>
        <div className="rounded-lg border border-slate-800 bg-slate-900/50 p-4">
          <CheckCircle2 className="mb-3 h-5 w-5 text-emerald-400" />
          <p className="text-2xl font-semibold text-slate-100">{counts?.APPROVAL ?? 0}</p>
          <p className="text-xs text-slate-500">Bekleyen onay</p>
        </div>
        <div className="rounded-lg border border-slate-800 bg-slate-900/50 p-4">
          <AlertTriangle className="mb-3 h-5 w-5 text-amber-400" />
          <p className="text-2xl font-semibold text-slate-100">{(counts?.STOCK ?? 0) + (counts?.COLLECTION ?? 0)}</p>
          <p className="text-xs text-slate-500">Stok ve tahsilat uyarisi</p>
        </div>
        <div className="rounded-lg border border-slate-800 bg-slate-900/50 p-4">
          <Clock className="mb-3 h-5 w-5 text-red-400" />
          <p className="text-2xl font-semibold text-slate-100">{criticalCount}</p>
          <p className="text-xs text-slate-500">Kritik oncelik</p>
        </div>
      </div>

      <section className="rounded-lg border border-slate-800 bg-slate-900/40">
        {isLoading ? (
          <div className="p-6 text-sm text-slate-500">Yukleniyor...</div>
        ) : isError ? (
          <div className="p-6 text-sm text-red-400">Is akisi verisi alinamadi.</div>
        ) : tasks.length === 0 ? (
          <div className="p-6 text-sm text-slate-500">Bekleyen is bulunmuyor.</div>
        ) : (
          <div className="divide-y divide-slate-800">
            {tasks.map((task) => (
              <Link
                key={task.id}
                href={task.href}
                className="flex flex-col gap-3 px-4 py-3 transition-colors hover:bg-slate-900 sm:flex-row sm:items-center"
              >
                <div className="min-w-0 flex-1">
                  <div className="mb-1 flex flex-wrap items-center gap-2">
                    <Badge variant={PRIORITY_BADGE[task.priority]}>{task.priority}</Badge>
                    <Badge variant="neutral">{TYPE_LABEL[task.type]}</Badge>
                    {task.dueAt && <span className="text-xs text-slate-500">{formatDate(task.dueAt)}</span>}
                  </div>
                  <p className="truncate text-sm font-medium text-slate-200">{task.title}</p>
                  {task.detail && <p className="mt-1 truncate text-xs text-slate-500">{task.detail}</p>}
                </div>
                <ExternalLink className="h-4 w-4 shrink-0 text-slate-500" />
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
