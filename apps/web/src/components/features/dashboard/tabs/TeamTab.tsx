'use client';

import Link from 'next/link';
import { Bell, CheckCircle2, ListChecks } from 'lucide-react';
import { formatDate, cn } from '@/lib/utils';
import type {
  DashboardApprovalRequest,
  DashboardNotification,
  DashboardTask,
} from '@/services/dashboard.service';
import type { SmartNotification, SmartNotificationSummary } from '@/services/notification.service';
import { DashboardCard, DashboardCardHeader } from '../shared/DashboardCard';
import {
  SMART_NOTIFICATION_TONE,
  SMART_NOTIFICATION_TEXT,
  TASK_TONE,
} from '../types/dashboard.constants';
import type { TaskPriority } from '../types/dashboard.types';

// ─────────────────────────────────────────────
// Props
// ─────────────────────────────────────────────

export interface TeamTabProps {
  smartNotifications: SmartNotificationSummary | undefined;
  tasks: DashboardTask[] | undefined;
  notifs: DashboardNotification[] | undefined;
  appr: DashboardApprovalRequest[] | undefined;
}

// ─────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────

export function TeamTab({ smartNotifications, tasks, notifs, appr }: TeamTabProps) {
  return (
    <div className="grid grid-cols-1 xl:grid-cols-4 gap-4">
      {/* ── Smart Notifications Summary ── */}
      <DashboardCard className="flex flex-col max-h-[420px]">
        <DashboardCardHeader
          icon={<Bell className="w-4 h-4 text-amber-400" />}
          title="Kritik Uyarılar & Aksiyonlar"
          action={
            smartNotifications && smartNotifications.items.length > 0 ? (
              <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold text-amber-300 border border-amber-500/20">
                {smartNotifications.items.length} aktif
              </span>
            ) : undefined
          }
        />
        <div className="flex-1 overflow-auto divide-y divide-slate-800/50">
          {smartNotifications && smartNotifications.items.length > 0 ? (
            smartNotifications.items.slice(0, 5).map((item: SmartNotification) => (
              <Link
                key={item.id}
                href={item.actionHref}
                className="block px-5 py-3 hover:bg-slate-800/30 transition-colors"
              >
                <div className={cn('rounded-xl border px-3 py-2', SMART_NOTIFICATION_TONE[item.severity])}>
                  <div className="flex items-start justify-between gap-3">
                    <p className={cn('text-xs font-semibold leading-snug', SMART_NOTIFICATION_TEXT[item.severity])}>
                      {item.title}
                    </p>
                    <span className="rounded-md bg-slate-950/70 px-1.5 py-0.5 text-[10px] font-bold text-slate-200">
                      {item.count}
                    </span>
                  </div>
                  <p className="mt-1 text-[11px] text-slate-400 line-clamp-2">{item.message}</p>
                  <div className="mt-1.5 flex items-center justify-between gap-2">
                    <span className="rounded-md bg-slate-950/70 px-1.5 py-0.5 text-[10px] font-medium text-slate-300">
                      {item.suggestedAction.label}
                    </span>
                    {item.lifecycleStatus === 'acknowledged' && (
                      <span className="text-[10px] font-medium text-emerald-300">Ele alındı</span>
                    )}
                  </div>
                </div>
              </Link>
            ))
          ) : (
            <div className="p-8 text-center text-sm text-slate-500">Kritik akıllı uyarı yok</div>
          )}
        </div>
        <div className="border-t border-slate-800/60 bg-slate-950/30 px-4 py-2.5 text-center text-[11px] text-slate-400">
          Tüm bildirimler ve geçmiş için üst menüdeki bildirim merkezini kullanabilirsiniz.
        </div>
      </DashboardCard>

      {/* ── Tasks ── */}
      <DashboardCard className="flex flex-col max-h-[420px]">
        <DashboardCardHeader
          icon={<ListChecks className="w-4 h-4 text-violet-400" />}
          title="Görevlerim"
        />
        <div className="flex-1 overflow-auto divide-y divide-slate-800/50">
          {tasks && tasks.length > 0 ? (
            tasks.slice(0, 8).map((task: DashboardTask) => (
              <Link
                key={task.id}
                href={task.href}
                className="block px-5 py-3.5 hover:bg-slate-800/30 transition-colors"
              >
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm text-slate-200 leading-snug truncate">{task.title}</p>
                  <span
                    className={cn(
                      'text-[10px] font-semibold shrink-0',
                      TASK_TONE[task.priority as TaskPriority] ?? 'text-slate-500',
                    )}
                  >
                    {task.priority}
                  </span>
                </div>
                {task.detail && (
                  <p className="text-xs text-slate-500 mt-1 line-clamp-1">{task.detail}</p>
                )}
                {task.dueAt && (
                  <p className="text-[10px] text-slate-600 mt-1.5">{formatDate(task.dueAt)}</p>
                )}
              </Link>
            ))
          ) : (
            <div className="p-8 text-center text-sm text-slate-500">Görev yok</div>
          )}
        </div>
      </DashboardCard>

      {/* ── Notifications ── */}
      <DashboardCard className="flex flex-col max-h-[420px]">
        <DashboardCardHeader
          icon={<Bell className="w-4 h-4 text-sky-400" />}
          title="Bildirimler"
        />
        <div className="flex-1 overflow-auto divide-y divide-slate-800/50">
          {notifs && notifs.length > 0 ? (
            notifs.map((n: DashboardNotification) => (
              <div key={n.id} className="px-5 py-3.5 hover:bg-slate-800/30 transition-colors">
                <p className="text-sm text-slate-200 leading-snug">{n.title}</p>
                {n.message && (
                  <p className="text-xs text-slate-500 mt-1 line-clamp-1">{n.message}</p>
                )}
                <p className="text-[10px] text-slate-600 mt-1.5">{formatDate(n.createdAt)}</p>
              </div>
            ))
          ) : (
            <div className="p-8 text-center text-sm text-slate-500">Bildirim yok</div>
          )}
        </div>
      </DashboardCard>

      {/* ── Approvals ── */}
      <DashboardCard className="flex flex-col max-h-[420px]">
        <DashboardCardHeader
          icon={<CheckCircle2 className="w-4 h-4 text-emerald-400" />}
          title="Bekleyen Onaylar"
        />
        <div className="flex-1 overflow-auto divide-y divide-slate-800/50">
          {appr && appr.length > 0 ? (
            appr.map((a: DashboardApprovalRequest) => (
              <div
                key={a.id}
                className="px-5 py-3.5 hover:bg-slate-800/30 transition-colors flex items-center justify-between gap-3"
              >
                <div className="min-w-0">
                  <p className="text-sm text-slate-200">{a.module} Onayı</p>
                  <p className="text-xs text-slate-500 mt-0.5">{a.requestedBy?.name ?? '—'}</p>
                </div>
                <span className="text-[10px] text-slate-600 shrink-0">{formatDate(a.createdAt)}</span>
              </div>
            ))
          ) : (
            <div className="p-8 text-center text-sm text-slate-500">Bekleyen onay yok</div>
          )}
        </div>
      </DashboardCard>
    </div>
  );
}
