'use client';

import { Loader2, Search } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { useGlobalSearch } from '@/hooks/useGlobalSearch';
import { cn } from '@/lib/utils';

const TYPE_LABEL: Record<string, string> = {
  product: 'Urun',
  contact: 'Cari',
  invoice: 'Fatura',
  sales_order: 'Satis siparisi',
  purchase_order: 'Satinalma',
  payment: 'Odeme',
  stock_movement: 'Stok hareketi',
};

export function GlobalSearch() {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const { data: results = [], isFetching } = useGlobalSearch(query);
  const normalized = query.trim();

  useEffect(() => {
    function handler(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  function goTo(href: string) {
    setOpen(false);
    setQuery('');
    router.push(href);
  }

  return (
    <div ref={ref} className="relative hidden w-full max-w-md md:block">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
      <input
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        placeholder="Urun, cari, fatura, odeme ara"
        className="h-9 w-full rounded-lg border border-slate-800 bg-slate-950/40 pl-9 pr-9 text-sm text-slate-200 outline-none transition-colors placeholder:text-slate-600 focus:border-sky-500/60"
      />
      {isFetching && <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-slate-500" />}

      {open && normalized.length >= 2 && (
        <div className="absolute left-0 right-0 top-full z-50 mt-2 max-h-96 overflow-auto rounded-lg border border-slate-800 bg-slate-950 shadow-xl">
          {results.length === 0 && !isFetching ? (
            <div className="px-3 py-3 text-sm text-slate-500">Sonuc bulunamadi.</div>
          ) : (
            <div className="py-1">
              {results.map((result) => (
                <button
                  key={`${result.type}:${result.id}`}
                  type="button"
                  onClick={() => goTo(result.href)}
                  className={cn(
                    'flex w-full items-center gap-3 px-3 py-2 text-left transition-colors',
                    'hover:bg-slate-900 focus:bg-slate-900 focus:outline-none',
                  )}
                >
                  <span className="w-24 shrink-0 truncate rounded border border-slate-800 bg-slate-900 px-2 py-0.5 text-[11px] text-slate-400">
                    {TYPE_LABEL[result.type] ?? result.type}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-slate-200">{result.title}</span>
                    {result.subtitle && <span className="block truncate text-xs text-slate-500">{result.subtitle}</span>}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
