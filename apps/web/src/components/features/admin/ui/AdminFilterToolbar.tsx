'use client';

import type { ReactNode } from 'react';
import { Search, X } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface AdminFilterToolbarProps {
  search?: string;
  onSearchChange?: (val: string) => void;
  searchPlaceholder?: string;
  filters?: ReactNode;
  actions?: ReactNode;
  hasActiveFilters?: boolean;
  onClearFilters?: () => void;
  totalCount?: number;
  countLabel?: string;
  className?: string;
}

export function AdminFilterToolbar({
  search,
  onSearchChange,
  searchPlaceholder = 'Arama yapın...',
  filters,
  actions,
  hasActiveFilters,
  onClearFilters,
  totalCount,
  countLabel = 'kayıt',
  className,
}: AdminFilterToolbarProps) {
  return (
    <div
      className={cn(
        'flex flex-col gap-2.5 rounded-xl border border-slate-800/80 bg-slate-900/60 p-3 shadow-sm sm:flex-row sm:items-center sm:justify-between',
        className,
      )}
    >
      {/* Left / Top: Search input & total badge */}
      <div className="flex flex-1 items-center gap-2">
        {onSearchChange !== undefined && (
          <div className="relative flex-1 max-w-md">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" />
            <input
              type="text"
              value={search ?? ''}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder={searchPlaceholder}
              className="w-full rounded-lg border border-slate-800 bg-slate-950/70 py-1.5 pl-8 pr-7 text-xs text-slate-200 placeholder-slate-500 outline-none ring-red-500/30 transition-all focus:border-red-500/50 focus:ring-1"
            />
            {search && (
              <button
                type="button"
                onClick={() => onSearchChange('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>
        )}

        {totalCount !== undefined && (
          <span className="hidden sm:inline-flex rounded-full bg-slate-800 px-2 py-0.5 text-[10px] font-semibold text-slate-400 shrink-0">
            {totalCount} {countLabel}
          </span>
        )}
      </div>

      {/* Right / Bottom: Filter controls & Actions */}
      <div className="flex flex-wrap items-center gap-2">
        {filters}

        {hasActiveFilters && onClearFilters && (
          <button
            type="button"
            onClick={onClearFilters}
            className="rounded-md border border-slate-800 bg-slate-900/80 px-2 py-1 text-[11px] font-medium text-slate-400 hover:border-slate-700 hover:text-white transition-colors"
          >
            Filtreleri Temizle
          </button>
        )}

        {actions}
      </div>
    </div>
  );
}
