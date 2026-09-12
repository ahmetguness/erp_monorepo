'use client';

import type { ReactNode } from 'react';
import Link from 'next/link';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { AdminTone } from './AdminPageHeader';

const KPI_TONE_CLASSES: Record<AdminTone, { iconWrap: string; icon: string }> = {
  sky: {
    iconWrap: 'bg-sky-500/10 text-sky-400 ring-sky-500/20',
    icon: 'text-sky-400',
  },
  emerald: {
    iconWrap: 'bg-emerald-500/10 text-emerald-400 ring-emerald-500/20',
    icon: 'text-emerald-400',
  },
  indigo: {
    iconWrap: 'bg-indigo-500/10 text-indigo-400 ring-indigo-500/20',
    icon: 'text-indigo-400',
  },
  purple: {
    iconWrap: 'bg-purple-500/10 text-purple-400 ring-purple-500/20',
    icon: 'text-purple-400',
  },
  amber: {
    iconWrap: 'bg-amber-500/10 text-amber-400 ring-amber-500/20',
    icon: 'text-amber-400',
  },
  red: {
    iconWrap: 'bg-rose-500/10 text-rose-400 ring-rose-500/20',
    icon: 'text-rose-400',
  },
  slate: {
    iconWrap: 'bg-slate-800/80 text-slate-400 ring-slate-700/50',
    icon: 'text-slate-400',
  },
};

export interface AdminKpiCardProps {
  label: string;
  value: string | number;
  icon?: LucideIcon;
  iconTone?: AdminTone;
  subtext?: ReactNode;
  badge?: ReactNode;
  href?: string;
  onClick?: () => void;
  className?: string;
}

export function AdminKpiCard({
  label,
  value,
  icon: Icon,
  iconTone = 'sky',
  subtext,
  badge,
  href,
  onClick,
  className,
}: AdminKpiCardProps) {
  const tone = KPI_TONE_CLASSES[iconTone] ?? KPI_TONE_CLASSES.sky;

  const content = (
    <div
      className={cn(
        'group rounded-xl border border-slate-800/80 bg-slate-900/60 p-3.5 transition-all hover:border-slate-700',
        (href || onClick) && 'cursor-pointer hover:-translate-y-0.5 hover:shadow-md',
        className,
      )}
      onClick={onClick}
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-slate-400 truncate">{label}</span>
        <div className="flex items-center gap-1.5">
          {badge}
          {Icon && (
            <span className={cn('rounded-md p-1.5 ring-1 transition-all', tone.iconWrap)}>
              <Icon className="h-3.5 w-3.5" />
            </span>
          )}
        </div>
      </div>

      <div className="mt-1 flex items-baseline gap-2">
        <span className="text-2xl font-bold tracking-tight text-white">{value}</span>
      </div>

      {subtext && <div className="mt-2 text-[11px] text-slate-400">{subtext}</div>}
    </div>
  );

  if (href) {
    return <Link href={href}>{content}</Link>;
  }

  return content;
}

export function AdminKpiGrid({
  children,
  className,
  columns = 4,
}: {
  children: ReactNode;
  className?: string;
  columns?: 2 | 3 | 4;
}) {
  const colClass =
    columns === 2
      ? 'grid-cols-1 sm:grid-cols-2'
      : columns === 3
        ? 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3'
        : 'grid-cols-2 lg:grid-cols-4';

  return (
    <section aria-label="Özet Metrikler" className={cn('grid gap-2.5', colClass, className)}>
      {children}
    </section>
  );
}
