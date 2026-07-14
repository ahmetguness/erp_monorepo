'use client';

import Link from 'next/link';
import { ArrowRight, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { PlanName } from '@/lib/plans';
import { getPlanRecommendedActions } from './plan-recommended-actions';

const PLAN_LABEL: Record<PlanName, string> = {
  STARTER: 'Starter',
  PROFESSIONAL: 'Professional',
  ENTERPRISE: 'Enterprise',
};

const PLAN_TONE: Record<PlanName, string> = {
  STARTER: 'border-sky-500/20 bg-sky-500/5 text-sky-300',
  PROFESSIONAL: 'border-violet-500/20 bg-violet-500/5 text-violet-300',
  ENTERPRISE: 'border-amber-500/20 bg-amber-500/5 text-amber-300',
};

export function PlanRecommendedActionsCard({ plan }: { plan: PlanName }) {
  const actions = getPlanRecommendedActions(plan);

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900 shadow-lg ring-1 ring-white/[0.03]">
      <div className="flex flex-col gap-3 border-b border-slate-800/80 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2.5">
          <Sparkles className="h-4 w-4 text-sky-400" />
          <div>
            <h2 className="text-sm font-semibold text-slate-200">Plana gore onerilen aksiyonlar</h2>
            <p className="mt-0.5 text-xs text-slate-500">Paketinizden daha hizli deger almak icin siradaki adimlar.</p>
          </div>
        </div>
        <span className={cn('w-fit rounded-lg border px-2.5 py-1 text-xs font-semibold', PLAN_TONE[plan])}>
          {PLAN_LABEL[plan]}
        </span>
      </div>
      <div className="grid grid-cols-1 gap-3 p-4 lg:grid-cols-3">
        {actions.map((action) => {
          const Icon = action.icon;
          return (
            <Link
              key={action.key}
              href={action.href}
              className="group rounded-xl border border-slate-800 bg-slate-950/35 p-4 transition-colors hover:border-slate-700 hover:bg-slate-900/80"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-start gap-3">
                  <div className="rounded-lg bg-slate-800 p-2 text-sky-300">
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-100">{action.title}</p>
                    <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-500">{action.detail}</p>
                  </div>
                </div>
                <ArrowRight className="mt-1 h-4 w-4 shrink-0 text-slate-600 transition-colors group-hover:text-sky-300" />
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
