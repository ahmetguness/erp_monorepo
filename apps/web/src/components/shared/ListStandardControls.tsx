'use client';

import { useState, useRef, useEffect } from 'react';
import { Download, Link2, SlidersHorizontal, Check } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import { SearchInput } from './SearchInput';
import type { ColumnDef } from './DataTable';
import { SavedViewControls } from './SavedViewControls';
import { buildCsv, downloadCsv } from '@/lib/list-standard';
import type { SavedViewState } from '@/services/saved-view.service';
import { cn } from '@/lib/utils';

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

interface PageSizeOption {
  value: number;
  label: string;
}

export interface ListStandardControlsProps<T> {
  module: string;
  listKey: string;
  currentState: SavedViewState;
  onApplyView: (state: SavedViewState) => void;
  columns: ReadonlyArray<ColumnDef<T>>;
  visibleColumnKeys: readonly string[];
  onVisibleColumnKeysChange: (keys: string[]) => void;
  pageSize: number;
  onPageSizeChange: (pageSize: number) => void;
  exportRows?: readonly T[];
  exportFilename?: string;
  canExport?: boolean;
  exportDisabledReason?: string;
  shareHref?: string;
  pageSizeOptions?: readonly PageSizeOption[];
  // Optional integrated search
  searchValue?: string;
  onSearchChange?: (value: string) => void;
  searchPlaceholder?: string;
}

const DEFAULT_PAGE_SIZE_OPTIONS: readonly PageSizeOption[] = [
  { value: 20, label: '20 / sayfa' },
  { value: 30, label: '30 / sayfa' },
  { value: 50, label: '50 / sayfa' },
  { value: 100, label: '100 / sayfa' },
];

function parsePageSize(value: string, options: readonly PageSizeOption[], fallback: number): number {
  return options.find((option) => String(option.value) === value)?.value ?? fallback;
}

// ─────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────

export function ListStandardControls<T>({
  module,
  listKey,
  currentState,
  onApplyView,
  columns,
  visibleColumnKeys,
  onVisibleColumnKeysChange,
  pageSize,
  onPageSizeChange,
  exportRows = [],
  exportFilename = 'liste.csv',
  canExport: hasExportPermission = true,
  exportDisabledReason,
  shareHref,
  pageSizeOptions = DEFAULT_PAGE_SIZE_OPTIONS,
  searchValue,
  onSearchChange,
  searchPlaceholder = 'Listede ara...',
}: ListStandardControlsProps<T>) {
  const [columnsOpen, setColumnsOpen] = useState(false);
  const columnsPopoverRef = useRef<HTMLDivElement>(null);

  const visibleSet = new Set(visibleColumnKeys);
  const hideableColumns = columns.filter((column) => column.hideable !== false);
  const visibleColumns = columns.filter((column) => visibleSet.has(column.key));
  const exportableColumns = visibleColumns.filter((column) => column.exportValue);
  const canExport = hasExportPermission && exportRows.length > 0 && exportableColumns.length > 0;

  // Close column popover on click outside or Escape
  useEffect(() => {
    if (!columnsOpen) return;

    function handleMouseDown(e: MouseEvent) {
      if (columnsPopoverRef.current && !columnsPopoverRef.current.contains(e.target as Node)) {
        setColumnsOpen(false);
      }
    }

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setColumnsOpen(false);
      }
    }

    document.addEventListener('mousedown', handleMouseDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleMouseDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [columnsOpen]);

  const toggleColumn = (key: string) => {
    const column = columns.find((item) => item.key === key);
    if (!column || column.hideable === false) return;
    if (visibleSet.has(key) && visibleColumnKeys.length <= 1) return;

    const next = visibleSet.has(key)
      ? visibleColumnKeys.filter((item) => item !== key)
      : [...visibleColumnKeys, key];
    onVisibleColumnKeysChange(next);
  };

  const exportCsv = () => {
    if (!canExport) return;
    downloadCsv(exportFilename, buildCsv(exportRows, exportableColumns));
  };

  const copyShareLink = () => {
    if (!shareHref || typeof navigator === 'undefined' || !navigator.clipboard) return;
    void navigator.clipboard.writeText(shareHref);
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* Optional Search */}
      {onSearchChange && (
        <div className="min-w-[200px] flex-1 max-w-xs">
          <SearchInput
            value={searchValue ?? ''}
            onChange={onSearchChange}
            placeholder={searchPlaceholder}
            className="w-full"
          />
        </div>
      )}

      {/* Saved Views */}
      <SavedViewControls
        module={module}
        listKey={listKey}
        currentState={currentState}
        onApply={onApplyView}
      />

      {/* Page Size Select */}
      <Select
        aria-label="Sayfa boyutu"
        options={pageSizeOptions.map((option) => ({ value: String(option.value), label: option.label }))}
        value={String(pageSize)}
        onChange={(event) => onPageSizeChange(parsePageSize(event.target.value, pageSizeOptions, pageSize))}
        className="w-32 h-10"
      />

      {/* Columns Popover (controlled, replaces native <details>) */}
      <div ref={columnsPopoverRef} className="relative">
        <button
          type="button"
          onClick={() => setColumnsOpen((prev) => !prev)}
          aria-expanded={columnsOpen}
          aria-haspopup="dialog"
          className={cn(
            'inline-flex h-10 items-center gap-2 rounded-xl border border-slate-800 bg-slate-900 px-3 text-sm font-medium text-slate-300 transition-colors',
            'hover:border-slate-700 hover:bg-slate-800',
            columnsOpen && 'border-sky-500/50 bg-slate-800 text-white',
          )}
        >
          <SlidersHorizontal className="h-4 w-4" />
          <span>Kolonlar</span>
        </button>

        {columnsOpen && (
          <div className="absolute right-0 z-50 mt-2 w-60 rounded-xl border border-slate-800 bg-slate-950 p-2 shadow-2xl shadow-black/60 ring-1 ring-white/[0.04] max-h-72 overflow-y-auto">
            <div className="px-2.5 py-1.5 text-xs font-semibold text-slate-400 border-b border-slate-800/80 mb-1 flex items-center justify-between">
              <span>Görünür Kolonlar</span>
              <span className="text-[10px] text-slate-500">{visibleColumns.length} seçili</span>
            </div>
            {hideableColumns.map((column) => {
              const isChecked = visibleSet.has(column.key);
              return (
                <label
                  key={column.key}
                  className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm text-slate-300 hover:bg-slate-900/80 transition-colors"
                >
                  <input
                    type="checkbox"
                    checked={isChecked}
                    onChange={() => toggleColumn(column.key)}
                    className="h-4 w-4 rounded border-slate-700 bg-slate-950 text-sky-500 focus:ring-sky-500/40"
                  />
                  <span className="truncate flex-1">
                    {column.header || column.key}
                  </span>
                  {isChecked && <Check className="w-3 h-3 text-sky-400 shrink-0" />}
                </label>
              );
            })}
          </div>
        )}
      </div>

      {/* Export CSV Button */}
      <Button
        type="button"
        variant="secondary"
        size="md"
        leftIcon={<Download className="h-4 w-4" />}
        disabled={!canExport}
        title={!hasExportPermission ? (exportDisabledReason ?? 'Dışa aktarma yetkiniz yok') : undefined}
        onClick={exportCsv}
        className="h-10"
      >
        Dışa aktar
      </Button>

      {/* Share Link Button */}
      {shareHref && (
        <Button
          type="button"
          variant="ghost"
          size="md"
          leftIcon={<Link2 className="h-4 w-4" />}
          onClick={copyShareLink}
          className="h-10"
        >
          Link
        </Button>
      )}
    </div>
  );
}
