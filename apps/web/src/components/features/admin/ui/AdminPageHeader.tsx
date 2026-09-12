'use client';

import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

export type AdminTone = 'red' | 'sky' | 'amber' | 'emerald' | 'purple' | 'indigo' | 'slate';

const TONE_CLASSES: Record<AdminTone, { iconWrap: string; icon: string }> = {
  red: {
    iconWrap: 'bg-red-500/15 ring-red-500/30 text-red-400',
    icon: 'text-red-400',
  },
  sky: {
    iconWrap: 'bg-sky-500/15 ring-sky-500/30 text-sky-400',
    icon: 'text-sky-400',
  },
  amber: {
    iconWrap: 'bg-amber-500/15 ring-amber-500/30 text-amber-400',
    icon: 'text-amber-400',
  },
  emerald: {
    iconWrap: 'bg-emerald-500/15 ring-emerald-500/30 text-emerald-400',
    icon: 'text-emerald-400',
  },
  purple: {
    iconWrap: 'bg-purple-500/15 ring-purple-500/30 text-purple-400',
    icon: 'text-purple-400',
  },
  indigo: {
    iconWrap: 'bg-indigo-500/15 ring-indigo-500/30 text-indigo-400',
    icon: 'text-indigo-400',
  },
  slate: {
    iconWrap: 'bg-slate-800/80 ring-slate-700 text-slate-300',
    icon: 'text-slate-300',
  },
};

export interface AdminPageHeaderProps {
  title: string;
  description?: string;
  icon?: LucideIcon;
  iconTone?: AdminTone;
  badge?: ReactNode;
  liveIndicator?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
  className?: string;
}

export function AdminPageHeader({
  title,
  description,
  icon: Icon,
  iconTone = 'red',
  badge,
  liveIndicator,
  actions,
  children,
  className,
}: AdminPageHeaderProps) {
  const tone = TONE_CLASSES[iconTone] ?? TONE_CLASSES.red;

  return (
    <header
      className={cn(
        'rounded-xl border border-slate-800/90 bg-slate-900/80 px-4 py-3 shadow-md backdrop-blur-md',
        className,
      )}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        {/* Left: Icon & Title info */}
        <div className="flex items-center gap-3">
          {Icon && (
            <div
              className={cn(
                'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ring-1 transition-all',
                tone.iconWrap,
              )}
            >
              <Icon className="h-4 w-4" />
            </div>
          )}

          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="truncate text-base font-bold tracking-tight text-white">{title}</h1>
              {badge}
            </div>

            {(description || liveIndicator) && (
              <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[11px] text-slate-400">
                {liveIndicator}
                {liveIndicator && description && <span className="text-slate-600">•</span>}
                {description && <p className="truncate max-w-xl text-slate-400">{description}</p>}
              </div>
            )}
          </div>
        </div>

        {/* Right: Actions toolbar */}
        {actions && (
          <div className="flex flex-wrap items-center gap-2 self-start sm:self-center">
            {actions}
          </div>
        )}
      </div>

      {children && <div className="mt-3 border-t border-slate-800/70 pt-3">{children}</div>}
    </header>
  );
}
