'use client';

import { useState, useRef, useEffect, useId } from 'react';
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
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (open) ref.current?.querySelector<HTMLElement>('[data-row-action]')?.focus();
  }, [open]);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  return (
    <div ref={ref} className="relative" onKeyDown={event => {
      if (!open) return;
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); setOpen(false); triggerRef.current?.focus(); }
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        const items = Array.from(ref.current?.querySelectorAll<HTMLElement>('[data-row-action]') ?? []);
        if (!items.length) return;
        const index = items.findIndex(item => item === document.activeElement);
        items[(index + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length]?.focus();
      }
    }}>
      <button
        ref={triggerRef}
        type="button"
        aria-label="Satır işlemleri"
        aria-expanded={open}
        aria-haspopup="true"
        aria-controls={open ? menuId : undefined}
        onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); }}
        className="rounded-lg p-1.5 text-slate-500 transition-colors hover:bg-slate-800/90 hover:text-slate-200"
      >
        <MoreHorizontal className="w-4 h-4" />
      </button>
      {open && (
        <div id={menuId} className="absolute right-0 top-full z-50 mt-1 w-52 overflow-hidden rounded-xl border border-slate-800/90 bg-slate-950/95 py-1.5 shadow-2xl shadow-black/25 ring-1 ring-white/[0.03]">
          {actions.map((action, i) => (
            <div key={i}>
              {action.separator && i > 0 && <div className="border-t border-slate-800 my-1" />}
              <button
                type="button"
                data-row-action
                onClick={(e) => { e.stopPropagation(); action.onClick(); setOpen(false); }}
                className={cn(
                  'w-full flex items-center gap-2 px-3 py-2 text-sm transition-colors',
                  action.variant === 'danger'
                    ? 'text-red-400 hover:bg-red-500/10'
                    : 'text-slate-300 hover:bg-slate-800/90',
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
