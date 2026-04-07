'use client';

import { useState, useRef, useEffect } from 'react';
import { MoreHorizontal } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface RowAction {
  label: string;
  icon?: React.ReactNode;
  onClick: () => void;
  variant?: 'default' | 'danger';
  separator?: boolean;
}

interface RowActionsProps {
  actions: RowAction[];
}

export function RowActions({ actions }: RowActionsProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); }}
        className="p-1 rounded-md hover:bg-slate-800 text-slate-500 hover:text-slate-300 transition-colors"
      >
        <MoreHorizontal className="w-4 h-4" />
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 z-50 w-48 bg-slate-900 border border-slate-800 rounded-lg shadow-xl shadow-black/20 py-1">
          {actions.map((action, i) => (
            <div key={i}>
              {action.separator && i > 0 && <div className="border-t border-slate-800 my-1" />}
              <button
                onClick={(e) => { e.stopPropagation(); action.onClick(); setOpen(false); }}
                className={cn(
                  'w-full flex items-center gap-2 px-3 py-1.5 text-sm transition-colors',
                  action.variant === 'danger'
                    ? 'text-red-400 hover:bg-red-500/10'
                    : 'text-slate-300 hover:bg-slate-800',
                )}
              >
                {action.icon && <span className="w-4 h-4 shrink-0">{action.icon}</span>}
                {action.label}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
