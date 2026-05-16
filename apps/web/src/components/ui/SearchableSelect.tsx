'use client';

import { useMemo, useState } from 'react';
import { Check, Search } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface SearchableSelectOption {
  value: string;
  label: string;
  helperText?: string;
}

interface SearchableSelectProps {
  label?: string;
  required?: boolean;
  value: string;
  query: string;
  placeholder?: string;
  error?: string;
  helperText?: string;
  isLoading?: boolean;
  options: SearchableSelectOption[];
  onQueryChange: (query: string) => void;
  onChange: (value: string, option: SearchableSelectOption) => void;
}

export function SearchableSelect({
  label,
  required,
  value,
  query,
  placeholder,
  error,
  helperText,
  isLoading,
  options,
  onQueryChange,
  onChange,
}: SearchableSelectProps) {
  const [open, setOpen] = useState(false);
  const selected = useMemo(() => options.find((option) => option.value === value), [options, value]);

  return (
    <div className="relative flex flex-col gap-1.5">
      {label && (
        <label className="text-[13px] font-medium text-slate-300">
          {label}{required && <span className="ml-0.5 text-red-400">*</span>}
        </label>
      )}
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
        <input
          value={open ? query : selected?.label ?? query}
          placeholder={placeholder}
          onFocus={() => setOpen(true)}
          onChange={(event) => {
            setOpen(true);
            onQueryChange(event.target.value);
          }}
          className={cn(
            'w-full rounded-xl border bg-slate-950/35 py-2.5 pl-9 pr-3.5 text-sm text-white shadow-sm transition-all',
            'placeholder-slate-500 hover:border-slate-600/80 hover:bg-slate-900/60 focus:border-sky-500/60 focus:bg-slate-950/50 focus:outline-none focus:ring-2 focus:ring-sky-500/35',
            error ? 'border-red-500/80 focus:border-red-500 focus:ring-red-500/30' : 'border-slate-700/75',
          )}
        />
      </div>
      {open && (
        <div className="absolute left-0 right-0 top-full z-40 mt-1 max-h-64 overflow-auto rounded-xl border border-slate-800 bg-slate-950 p-1 shadow-xl">
          {isLoading ? (
            <div className="px-3 py-2 text-xs text-slate-500">Yükleniyor...</div>
          ) : options.length === 0 ? (
            <div className="px-3 py-2 text-xs text-slate-500">Sonuç bulunamadı</div>
          ) : (
            options.map((option) => {
              const isSelected = option.value === value;
              return (
                <button
                  key={option.value}
                  type="button"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => {
                    onChange(option.value, option);
                    onQueryChange(option.label);
                    setOpen(false);
                  }}
                  className="flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left text-sm text-slate-200 hover:bg-slate-800/70"
                >
                  <span className="min-w-0">
                    <span className="block truncate">{option.label}</span>
                    {option.helperText && <span className="block truncate text-xs text-slate-500">{option.helperText}</span>}
                  </span>
                  {isSelected && <Check className="h-4 w-4 shrink-0 text-emerald-400" />}
                </button>
              );
            })
          )}
        </div>
      )}
      {error && <p className="text-xs text-red-400">{error}</p>}
      {!error && helperText && <p className="text-xs text-slate-500">{helperText}</p>}
    </div>
  );
}
