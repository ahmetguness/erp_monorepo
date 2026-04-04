'use client';

import { useState, useRef, useEffect } from 'react';
import { ChevronDown, Plus, X } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface ComboboxOption {
  value: string;
  label: string;
}

export interface ComboboxProps {
  label?: string;
  placeholder?: string;
  options: ComboboxOption[];
  value: string;
  onChange: (value: string) => void;
  onCreateNew?: (label: string) => void;
  createLabel?: string;
  error?: string;
  required?: boolean;
  className?: string;
}

export function Combobox({
  label,
  placeholder = 'Seçin veya yazın…',
  options,
  value,
  onChange,
  onCreateNew,
  createLabel = 'Yeni ekle',
  error,
  required,
  className,
}: ComboboxProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selectedOption = options.find((o) => o.value === value);

  // Filter options
  const filtered = search
    ? options.filter((o) => o.label.toLowerCase().includes(search.toLowerCase()))
    : options;

  const showCreateOption = onCreateNew && search.trim() && !filtered.some(
    (o) => o.label.toLowerCase() === search.trim().toLowerCase(),
  );

  // Close on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        setSearch('');
      }
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleSelect = (optValue: string) => {
    onChange(optValue);
    setOpen(false);
    setSearch('');
  };

  const handleCreate = () => {
    if (onCreateNew && search.trim()) {
      onCreateNew(search.trim());
      setSearch('');
    }
  };

  const handleClear = () => {
    onChange('');
    setSearch('');
    inputRef.current?.focus();
  };

  return (
    <div ref={ref} className={cn('flex flex-col gap-1.5', className)}>
      {label && (
        <label className="text-sm font-medium text-slate-300">
          {label}
          {required && <span className="text-red-400 ml-0.5">*</span>}
        </label>
      )}

      <div className="relative">
        <div
          className={cn(
            'flex items-center bg-slate-800 border rounded-lg transition-colors cursor-text',
            open ? 'ring-2 ring-sky-500 border-transparent' : error ? 'border-red-500' : 'border-slate-700',
          )}
          onClick={() => { setOpen(true); inputRef.current?.focus(); }}
        >
          <input
            ref={inputRef}
            type="text"
            value={open ? search : selectedOption?.label ?? ''}
            onChange={(e) => { setSearch(e.target.value); if (!open) setOpen(true); }}
            onFocus={() => setOpen(true)}
            placeholder={selectedOption ? selectedOption.label : placeholder}
            className="flex-1 bg-transparent text-sm text-white placeholder-slate-500 px-3.5 py-2.5 outline-none"
          />
          {value && !open && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); handleClear(); }}
              className="p-1.5 mr-1 text-slate-500 hover:text-slate-300 transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
          <ChevronDown className={cn('w-4 h-4 text-slate-500 mr-3 shrink-0 transition-transform', open && 'rotate-180')} />
        </div>

        {/* Dropdown */}
        {open && (
          <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-slate-800 border border-slate-700 rounded-lg shadow-xl max-h-56 overflow-y-auto">
            {/* Empty option */}
            <button
              type="button"
              onClick={() => handleSelect('')}
              className="w-full text-left px-3.5 py-2 text-sm text-slate-500 hover:bg-slate-700/50 transition-colors"
            >
              — Seçim yok —
            </button>

            {filtered.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => handleSelect(opt.value)}
                className={cn(
                  'w-full text-left px-3.5 py-2 text-sm transition-colors',
                  opt.value === value
                    ? 'bg-sky-500/10 text-sky-400'
                    : 'text-slate-300 hover:bg-slate-700/50',
                )}
              >
                {opt.label}
              </button>
            ))}

            {filtered.length === 0 && !showCreateOption && (
              <div className="px-3.5 py-3 text-sm text-slate-500 text-center">Sonuç bulunamadı</div>
            )}

            {/* Create new option */}
            {showCreateOption && (
              <button
                type="button"
                onClick={handleCreate}
                className="w-full flex items-center gap-2 px-3.5 py-2.5 text-sm text-sky-400 hover:bg-sky-500/10 transition-colors border-t border-slate-700"
              >
                <Plus className="w-3.5 h-3.5" />
                {createLabel}: <span className="font-medium">{search.trim()}</span>
              </button>
            )}
          </div>
        )}
      </div>

      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  );
}
