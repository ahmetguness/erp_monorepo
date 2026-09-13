'use client';

import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

// ─────────────────────────────────────────────
// DashboardCard
// ─────────────────────────────────────────────

interface DashboardCardProps {
  children: ReactNode;
  className?: string;
}

export function DashboardCard({ children, className }: DashboardCardProps) {
  return (
    <div
      className={cn(
        'bg-slate-900 border border-slate-800 rounded-2xl shadow-lg ring-1 ring-white/[0.03] overflow-hidden',
        className,
      )}
    >
      {children}
    </div>
  );
}

// ─────────────────────────────────────────────
// DashboardCardHeader
// ─────────────────────────────────────────────

interface DashboardCardHeaderProps {
  icon: ReactNode;
  title: string;
  action?: ReactNode;
}

export function DashboardCardHeader({ icon, title, action }: DashboardCardHeaderProps) {
  return (
    <div className="flex items-center justify-between gap-3 px-5 py-3.5 border-b border-slate-800/80">
      <div className="flex items-center gap-2.5">
        {icon}
        <h2 className="text-sm font-semibold text-slate-200">{title}</h2>
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
