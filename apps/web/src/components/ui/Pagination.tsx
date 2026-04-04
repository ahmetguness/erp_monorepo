'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface PaginationProps {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  onChange: (page: number) => void;
}

export function Pagination({ page, total, totalPages, onChange }: PaginationProps) {
  if (totalPages <= 1) return null;

  const pages: (number | '...')[] = [];
  if (totalPages <= 7) {
    for (let i = 1; i <= totalPages; i++) pages.push(i);
  } else {
    pages.push(1);
    if (page > 3) pages.push('...');
    for (let i = Math.max(2, page - 1); i <= Math.min(totalPages - 1, page + 1); i++) pages.push(i);
    if (page < totalPages - 2) pages.push('...');
    pages.push(totalPages);
  }

  return (
    <div className="flex items-center justify-between gap-4">
      <p className="text-xs text-slate-600">
        <span className="text-slate-400 font-medium">{total}</span> kayıt
      </p>
      <div className="flex items-center gap-0.5">
        <button onClick={() => onChange(page - 1)} disabled={page === 1}
          className="p-1.5 rounded-lg text-slate-500 hover:text-slate-200 hover:bg-slate-800 disabled:opacity-20 disabled:cursor-not-allowed transition-colors" aria-label="Önceki">
          <ChevronLeft className="w-4 h-4" />
        </button>
        {pages.map((p, i) =>
          p === '...' ? (
            <span key={`e-${i}`} className="px-1.5 text-slate-600 text-xs">…</span>
          ) : (
            <button key={p} onClick={() => onChange(p)}
              className={cn('w-7 h-7 rounded-lg text-xs font-medium transition-all',
                p === page ? 'bg-sky-500/15 text-sky-400 border border-sky-500/20' : 'text-slate-500 hover:text-slate-200 hover:bg-slate-800',
              )}>
              {p}
            </button>
          ),
        )}
        <button onClick={() => onChange(page + 1)} disabled={page === totalPages}
          className="p-1.5 rounded-lg text-slate-500 hover:text-slate-200 hover:bg-slate-800 disabled:opacity-20 disabled:cursor-not-allowed transition-colors" aria-label="Sonraki">
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
