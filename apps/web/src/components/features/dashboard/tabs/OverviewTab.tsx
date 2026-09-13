'use client';

import {
  Building2, Clock, Package, Plus, Sparkles, Users,
} from 'lucide-react';
import Link from 'next/link';
import type { AuthUser, TenantInfo } from '@repo/types';
import type { Recommendation } from '@/services/intelligence.service';
import type { PlanName } from '@/lib/plans';
import { cn } from '@/lib/utils';
import { DashboardCard, DashboardCardHeader } from '../shared/DashboardCard';
import { RECOMMENDATION_TONE, TASK_TONE } from '../types/dashboard.constants';
import type { ActionItem, DashboardPreset } from '../types/dashboard.types';
import {
  DASHBOARD_PRESET_LABEL,
  DASHBOARD_PRESET_DESCRIPTION,
} from '../types/dashboard.types';
import { TodayWorkQueue } from '../TodayWorkQueue';
import { SetupChecklistCard } from '@/components/features/settings/SetupChecklistCard';
import { StarterHealthScoreCard } from '../StarterHealthScoreCard';
import { PlanRecommendedActionsCard } from '../PlanRecommendedActionsCard';

// ─────────────────────────────────────────────
// Props
// ─────────────────────────────────────────────

export interface OverviewTabProps {
  user: AuthUser | null;
  tenant: TenantInfo | null;
  clock: string;
  dashboardPreset: DashboardPreset;
  isOwner: boolean;
  roleName: string | null;
  recommendations: Recommendation[];
  visibleActionItems: ActionItem[];
  canReadTodayQueue: boolean;
  canReadSettings: boolean;
  isStarter: boolean;
  currentPlan: PlanName;
}

// ─────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────

function openAssistant(message: string): void {
  window.dispatchEvent(new CustomEvent<string>('axon-chat-action', { detail: message }));
}

// ─────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────

export function OverviewTab({
  user,
  tenant,
  clock,
  dashboardPreset,
  isOwner,
  roleName,
  recommendations,
  visibleActionItems,
  canReadTodayQueue,
  canReadSettings,
  isStarter,
  currentPlan,
}: OverviewTabProps) {
  return (
    <div className="space-y-5">
      {/* ── Welcome Header ── */}
      <div className="bg-gradient-to-br from-slate-800/50 to-slate-900 border border-slate-700/50 rounded-2xl p-5 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="w-11 h-11 rounded-full bg-gradient-to-br from-sky-500 to-violet-500 flex items-center justify-center text-base font-bold text-white shadow-lg shrink-0">
            {user?.name?.charAt(0) ?? 'A'}
          </div>
          <div className="min-w-0">
            <h1 className="text-lg font-semibold text-white truncate">
              Merhaba, {user?.name?.split(' ')[0]}
            </h1>
            <div className="flex items-center gap-3 text-sm text-slate-400 mt-0.5">
              <span className="flex items-center gap-1.5 whitespace-nowrap">
                <Building2 className="w-3.5 h-3.5 text-slate-500" />
                <span className="truncate">{tenant?.companyName}</span>
              </span>
              <span className="w-1 h-1 rounded-full bg-slate-600 shrink-0" />
              <span className="flex items-center gap-1.5 font-mono text-sky-400 tabular-nums shrink-0">
                <Clock className="w-3.5 h-3.5" />{clock}
              </span>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/dashboard/contacts/new"
            className="hidden sm:flex items-center gap-2 px-3.5 py-2 bg-amber-500/10 border border-amber-500/20 text-amber-400 rounded-xl hover:bg-amber-500/20 transition-colors text-sm font-medium"
          >
            <Users className="w-4 h-4" /> Yeni Cari
          </Link>
          <Link
            href="/dashboard/products/new"
            className="hidden md:flex items-center gap-2 px-3.5 py-2 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-xl hover:bg-emerald-500/20 transition-colors text-sm font-medium"
          >
            <Package className="w-4 h-4" /> Yeni Ürün
          </Link>
          <Link
            href="/dashboard/invoices/new"
            className="flex items-center gap-2 px-3.5 py-2 bg-sky-500/10 border border-sky-500/20 text-sky-400 rounded-xl hover:bg-sky-500/20 transition-colors text-sm font-medium"
          >
            <Plus className="w-4 h-4" /> Yeni Fatura
          </Link>
        </div>
      </div>

      {/* ── Preset Label ── */}
      <DashboardCard>
        <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Rol bazlı dashboard
            </p>
            <h2 className="mt-1 text-sm font-semibold text-white">
              {DASHBOARD_PRESET_LABEL[dashboardPreset]} görünümü
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">
              {DASHBOARD_PRESET_DESCRIPTION[dashboardPreset]}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {roleName && (
              <span className="rounded-lg border border-slate-700 bg-slate-950/50 px-2.5 py-1 text-xs font-medium text-slate-300">
                {roleName}
              </span>
            )}
            {isOwner && (
              <span className="rounded-lg border border-amber-500/25 bg-amber-500/10 px-2.5 py-1 text-xs font-semibold text-amber-300">
                Owner
              </span>
            )}
          </div>
        </div>
      </DashboardCard>

      {/* ── Plan Actions ── */}
      <PlanRecommendedActionsCard plan={currentPlan} />

      {/* ── Today Work Queue ── */}
      <TodayWorkQueue enabled={canReadTodayQueue} />

      {/* ── Setup Checklist ── */}
      <SetupChecklistCard enabled={canReadSettings} compact />

      {/* ── Starter Health Score ── */}
      <StarterHealthScoreCard enabled={isStarter} />

      {/* ── Action Center ── */}
      <DashboardCard>
        <DashboardCardHeader
          icon={<Sparkles className="w-4 h-4 text-sky-400" />}
          title="Öneriler ve Aksiyonlar"
        />
        <div className="p-4 space-y-4">
          {/* Smart recommendations */}
          <div>
            <div className="flex items-center justify-between gap-3 mb-3">
              <div>
                <p className="text-xs font-semibold text-slate-300">Akıllı öneriler</p>
                <p className="text-[11px] text-slate-500">Veriye göre önceliklendirilen aksiyonlar</p>
              </div>
              {recommendations.length > 0 && (
                <span className="h-6 px-2 inline-flex items-center rounded-lg bg-amber-500/10 text-[10px] font-bold text-amber-400">
                  {recommendations.length} aktif
                </span>
              )}
            </div>

            {recommendations.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
                {recommendations.slice(0, 4).map((rec) => (
                  <div
                    key={rec.id}
                    className={cn(
                      'rounded-xl border p-4',
                      RECOMMENDATION_TONE[rec.severity as keyof typeof RECOMMENDATION_TONE] ??
                        RECOMMENDATION_TONE.LOW,
                    )}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-slate-100 truncate">{rec.title}</p>
                        <p className="text-xs text-slate-400 mt-1 line-clamp-2 min-h-8">{rec.detail}</p>
                      </div>
                      <span
                        className={cn(
                          'text-[10px] font-bold shrink-0',
                          TASK_TONE[rec.severity as keyof typeof TASK_TONE] ?? 'text-slate-500',
                        )}
                      >
                        {rec.value}
                      </span>
                    </div>
                    <div className="mt-3 flex items-center gap-2">
                      <Link
                        href={rec.href}
                        className="flex-1 h-8 inline-flex items-center justify-center rounded-lg border border-slate-700 text-xs font-medium text-slate-300 hover:border-slate-600 hover:bg-slate-800/50"
                      >
                        Aç
                      </Link>
                      <button
                        type="button"
                        onClick={() => openAssistant(rec.assistantPrompt)}
                        className="flex-1 h-8 rounded-lg border border-sky-500/30 bg-sky-500/10 text-xs font-medium text-sky-300 hover:bg-sky-500/15"
                      >
                        {rec.actionLabel}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-xl border border-slate-800 bg-slate-950/30 px-4 py-5 text-center text-sm text-slate-500">
                Yetkili olduğunuz modüllerde aktif öneri yok
              </div>
            )}
          </div>

          {/* Quick actions */}
          <div className="border-t border-slate-800/70 pt-4">
            <div className="mb-3">
              <p className="text-xs font-semibold text-slate-300">Hızlı aksiyonlar</p>
              <p className="text-[11px] text-slate-500">Sık kullanılan AI iş akışları</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-3">
              {visibleActionItems.map((item) => (
                <div
                  key={item.key}
                  className="rounded-xl border border-slate-800 bg-slate-950/30 p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="p-2 rounded-lg bg-slate-800/80 shrink-0">{item.icon}</div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-slate-200 truncate">{item.title}</p>
                        <p className="text-xs text-slate-500 truncate">{item.detail}</p>
                      </div>
                    </div>
                    <span
                      className={cn(
                        'min-w-7 h-7 px-2 rounded-lg inline-flex items-center justify-center text-xs font-bold tabular-nums',
                        item.value > 0
                          ? 'bg-amber-500/10 text-amber-400'
                          : 'bg-slate-800 text-slate-500',
                      )}
                    >
                      {item.value}
                    </span>
                  </div>
                  <button
                    type="button"
                    disabled={item.disabled}
                    onClick={() => openAssistant(item.message)}
                    className="mt-3 w-full h-8 rounded-lg border border-slate-700 text-xs font-medium text-slate-300 transition-colors hover:border-sky-500/40 hover:bg-sky-500/10 hover:text-sky-300 disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:border-slate-700 disabled:hover:bg-transparent disabled:hover:text-slate-300"
                  >
                    {item.actionLabel}
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      </DashboardCard>
    </div>
  );
}
