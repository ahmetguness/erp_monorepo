'use client';

import { useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';
import { EmptyState } from './EmptyState';
import { Pagination, type PaginationProps } from '@/components/ui/Pagination';

// ─────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────

export interface ColumnDef<T> {
  key: string;
  header: string;
  width?: string;
  align?: 'left' | 'center' | 'right';
  hideable?: boolean;
  exportValue?: (row: T) => string | number | boolean | null | undefined;
  render: (row: T) => React.ReactNode;
}

export interface DataTableProps<T> {
  columns: ColumnDef<T>[];
  data: T[];
  keyExtractor: (row: T) => string;
  selection?: {
    selectedIds: ReadonlySet<string>;
    isPageSelected: boolean;
    isPagePartiallySelected: boolean;
    onToggleRow: (id: string) => void;
    onTogglePage: () => void;
  };
  isLoading?: boolean;
  pagination?: PaginationProps;
  onRowClick?: (row: T) => void;
  emptyTitle?: string;
  emptyDescription?: string;
  className?: string;
}

// ─────────────────────────────────────────────
// Skeleton
// ─────────────────────────────────────────────

function SkeletonRow({ cols }: { cols: number }) {
  return (
    <tr className="border-b border-slate-800/35">
      {Array.from({ length: cols }).map((_, i) => (
        <td key={i} className="px-5 py-4">
          <div
            className="h-4 rounded-md bg-slate-800/80 animate-pulse shadow-sm"
            style={{ width: `${50 + (i % 3) * 20}%` }}
          />
        </td>
      ))}
    </tr>
  );
}

function SelectionCheckbox({
  checked,
  indeterminate = false,
  disabled = false,
  label,
  onChange,
}: {
  checked: boolean;
  indeterminate?: boolean;
  disabled?: boolean;
  label: string;
  onChange: () => void;
}) {
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (ref.current) {
      ref.current.indeterminate = indeterminate;
    }
  }, [indeterminate]);

  return (
    <input
      ref={ref}
      type="checkbox"
      aria-label={label}
      checked={checked}
      disabled={disabled}
      onChange={(event) => {
        event.stopPropagation();
        onChange();
      }}
      onClick={(event) => event.stopPropagation()}
      className="h-3.5 w-3.5 cursor-pointer rounded border-slate-600 bg-slate-800 text-sky-500 focus:ring-sky-500/30 disabled:cursor-not-allowed disabled:opacity-40"
    />
  );
}

// ─────────────────────────────────────────────
// DataTable
// ─────────────────────────────────────────────

export function DataTable<T>({
  columns,
  data,
  keyExtractor,
  selection,
  isLoading = false,
  pagination,
  onRowClick,
  emptyTitle = 'Kayıt bulunamadı',
  emptyDescription,
  className,
}: DataTableProps<T>) {
  const columnCount = columns.length + (selection ? 1 : 0);

  return (
    <div className={cn(
      'overflow-hidden rounded-2xl border border-slate-800/80 bg-slate-950/45 shadow-xl shadow-black/10',
      'ring-1 ring-white/[0.03] backdrop-blur-sm',
      className,
    )}>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 z-10">
            <tr className="border-b border-slate-800/80 bg-slate-900/95">
              {selection && (
                <th className="w-10 px-4 py-3.5 text-center">
                  <SelectionCheckbox
                    label="Sayfadaki kayitlari sec"
                    checked={selection.isPageSelected}
                    indeterminate={selection.isPagePartiallySelected}
                    disabled={isLoading || data.length === 0}
                    onChange={selection.onTogglePage}
                  />
                </th>
              )}
              {columns.map((col) => (
                <th
                  key={col.key}
                  style={col.width ? { width: col.width } : undefined}
                  className={cn(
                    'px-5 py-3.5 text-[11px] font-semibold uppercase text-slate-400 whitespace-nowrap',
                    col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : 'text-left',
                  )}
                >
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => <SkeletonRow key={i} cols={columnCount} />)
            ) : data.length === 0 ? (
              <tr>
                <td colSpan={columnCount}>
                  <EmptyState title={emptyTitle} description={emptyDescription} compact />
                </td>
              </tr>
            ) : (
              data.map((row, idx) => (
                <tr
                  key={keyExtractor(row)}
                  onClick={() => onRowClick?.(row)}
                  className={cn(
                    'group border-b border-slate-800/35 transition-colors duration-150 last:border-b-0',
                    onRowClick && 'cursor-pointer',
                    idx % 2 === 1 ? 'bg-slate-900/18' : 'bg-slate-950/10',
                    'hover:bg-sky-500/[0.045]',
                  )}
                >
                  {selection && (
                    <td className="px-4 py-4 text-center align-middle">
                      <SelectionCheckbox
                        label="Satiri sec"
                        checked={selection.selectedIds.has(keyExtractor(row))}
                        onChange={() => selection.onToggleRow(keyExtractor(row))}
                      />
                    </td>
                  )}
                  {columns.map((col) => (
                    <td
                      key={col.key}
                      className={cn(
                        'px-5 py-4 text-slate-300 align-middle',
                        col.align === 'right' ? 'text-right' : col.align === 'center' ? 'text-center' : 'text-left',
                      )}
                    >
                      {col.render(row)}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {pagination && !isLoading && data.length > 0 && (
        <div className="border-t border-slate-800/70 bg-slate-900/45 px-5 py-3.5">
          <Pagination {...pagination} />
        </div>
      )}
    </div>
  );
}
