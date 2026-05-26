'use client';

import { Download, SlidersHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import type { ColumnDef } from './DataTable';
import { SavedViewControls } from './SavedViewControls';
import { buildCsv, downloadCsv } from '@/lib/list-standard';
import type { SavedViewState } from '@/services/saved-view.service';

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
  pageSizeOptions?: readonly PageSizeOption[];
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
  pageSizeOptions = DEFAULT_PAGE_SIZE_OPTIONS,
}: ListStandardControlsProps<T>) {
  const visibleSet = new Set(visibleColumnKeys);
  const hideableColumns = columns.filter((column) => column.hideable !== false);
  const visibleColumns = columns.filter((column) => visibleSet.has(column.key));
  const exportableColumns = visibleColumns.filter((column) => column.exportValue);
  const canExport = exportRows.length > 0 && exportableColumns.length > 0;

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

  return (
    <div className="flex flex-wrap items-end gap-2">
      <SavedViewControls module={module} listKey={listKey} currentState={currentState} onApply={onApplyView} />
      <Select
        aria-label="Sayfa boyutu"
        options={pageSizeOptions.map((option) => ({ value: String(option.value), label: option.label }))}
        value={String(pageSize)}
        onChange={(event) => onPageSizeChange(parsePageSize(event.target.value, pageSizeOptions, pageSize))}
        className="w-32"
      />
      <details className="group relative">
        <summary className="inline-flex h-10 cursor-pointer list-none items-center gap-2 rounded-xl border border-slate-800 bg-slate-900 px-3 text-sm font-medium text-slate-300 hover:border-slate-700 hover:bg-slate-800">
          <SlidersHorizontal className="h-4 w-4" />
          Kolonlar
        </summary>
        <div className="absolute right-0 z-30 mt-2 w-56 rounded-xl border border-slate-800 bg-slate-950 p-2 shadow-xl shadow-black/30">
          {hideableColumns.map((column) => (
            <label key={column.key} className="flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2 text-sm text-slate-300 hover:bg-slate-900">
              <input
                type="checkbox"
                checked={visibleSet.has(column.key)}
                onChange={() => toggleColumn(column.key)}
                className="h-4 w-4 rounded border-slate-700 bg-slate-950 text-sky-500"
              />
              {column.header || column.key}
            </label>
          ))}
        </div>
      </details>
      <Button
        type="button"
        variant="secondary"
        size="md"
        leftIcon={<Download className="h-4 w-4" />}
        disabled={!canExport}
        onClick={exportCsv}
      >
        Dışa aktar
      </Button>
    </div>
  );
}
