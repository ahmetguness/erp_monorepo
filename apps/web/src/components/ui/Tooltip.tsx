'use client';

import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

export type TooltipPlacement = 'right' | 'top' | 'bottom' | 'left';

export interface TooltipProps {
  content: string;
  placement?: TooltipPlacement;
  children: ReactNode;
  className?: string;
  disabled?: boolean;
}

// ─────────────────────────────────────────────
// Placement styles
// ─────────────────────────────────────────────

const PLACEMENT_WRAPPER: Record<TooltipPlacement, string> = {
  right: 'left-full top-1/2 -translate-y-1/2 ml-2',
  left:  'right-full top-1/2 -translate-y-1/2 mr-2',
  top:   'bottom-full left-1/2 -translate-x-1/2 mb-2',
  bottom:'top-full left-1/2 -translate-x-1/2 mt-2',
};

const PLACEMENT_ARROW: Record<TooltipPlacement, string> = {
  right:  'right-full top-1/2 -translate-y-1/2 border-r-slate-800 border-r-8 border-y-4 border-y-transparent border-l-0',
  left:   'left-full top-1/2 -translate-y-1/2 border-l-slate-800 border-l-8 border-y-4 border-y-transparent border-r-0',
  top:    'top-full left-1/2 -translate-x-1/2 border-t-slate-800 border-t-8 border-x-4 border-x-transparent border-b-0',
  bottom: 'bottom-full left-1/2 -translate-x-1/2 border-b-slate-800 border-b-8 border-x-4 border-x-transparent border-t-0',
};

// ─────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────

/**
 * CSS-only tooltip — no JS position calculation.
 * Wraps `children` in a `relative` container and shows
 * the tooltip on `group-hover` via Tailwind.
 *
 * @example
 * <Tooltip content="Menüyü genişlet" placement="right">
 *   <button>…</button>
 * </Tooltip>
 */
export function Tooltip({
  content,
  placement = 'right',
  children,
  className,
  disabled = false,
}: TooltipProps) {
  if (disabled || !content) return <>{children}</>;

  return (
    <div className={cn('group relative inline-flex', className)}>
      {children}
      <div
        role="tooltip"
        className={cn(
          'pointer-events-none absolute z-50 whitespace-nowrap',
          'rounded-lg border border-slate-700 bg-slate-900 px-2.5 py-1.5',
          'text-xs font-medium text-slate-200 shadow-xl shadow-black/25',
          'opacity-0 scale-95 transition-all duration-150',
          'group-hover:opacity-100 group-hover:scale-100',
          PLACEMENT_WRAPPER[placement],
        )}
      >
        {/* Arrow */}
        <span
          aria-hidden="true"
          className={cn('absolute h-0 w-0', PLACEMENT_ARROW[placement])}
        />
        {content}
      </div>
    </div>
  );
}
