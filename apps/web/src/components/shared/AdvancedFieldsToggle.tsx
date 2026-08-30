'use client';

import { ChevronDown, SlidersHorizontal } from 'lucide-react';
import { cn } from '@/lib/utils';

interface AdvancedFieldsToggleProps {
  expanded: boolean;
  onToggle: () => void;
  hiddenFieldCount: number;
}

export function AdvancedFieldsToggle({ expanded, onToggle, hiddenFieldCount }: AdvancedFieldsToggleProps) {
  return (
    <button type="button" onClick={onToggle} className="flex w-full items-center justify-between rounded-xl border border-dashed border-slate-700/70 bg-slate-900/50 px-4 py-3 text-left hover:border-sky-500/40">
      <span className="flex items-center gap-2 text-xs font-medium text-slate-300"><SlidersHorizontal className="h-4 w-4 text-sky-400" />İleri seviye alanlar <span className="text-slate-600">({hiddenFieldCount})</span></span>
      <ChevronDown className={cn('h-4 w-4 text-slate-500 transition-transform', expanded && 'rotate-180')} />
    </button>
  );
}
