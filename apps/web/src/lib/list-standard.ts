import type { ColumnDef } from '@/components/shared/DataTable';
import type { SavedViewState } from '@/services/saved-view.service';

export type ListSortDirection = 'asc' | 'desc';

export interface ListSortState {
  key: string;
  direction: ListSortDirection;
}

export interface ListStandardStateInput {
  filters: Record<string, unknown>;
  columns: readonly string[];
  pageSize: number;
  sort?: ListSortState | null;
}

const CSV_MIME_TYPE = 'text/csv;charset=utf-8';

export function getDefaultColumnKeys<T>(columns: ReadonlyArray<ColumnDef<T>>): string[] {
  return columns.map((column) => column.key);
}

export function getVisibleColumns<T>(
  columns: ReadonlyArray<ColumnDef<T>>,
  visibleColumnKeys: readonly string[],
): ColumnDef<T>[] {
  const visible = new Set(visibleColumnKeys);
  return columns.filter((column) => visible.has(column.key));
}

export function normalizeColumnKeys<T>(
  columns: ReadonlyArray<ColumnDef<T>>,
  requestedKeys: readonly string[] | undefined,
): string[] {
  const available = new Set(columns.map((column) => column.key));
  const next = (requestedKeys ?? [])
    .filter((key) => available.has(key));
  return next.length > 0 ? next : getDefaultColumnKeys(columns);
}

export function createListSavedViewState(input: ListStandardStateInput): SavedViewState {
  return {
    filters: input.filters,
    columns: [...input.columns],
    pageSize: input.pageSize,
    sort: input.sort ?? null,
  };
}

export function getSavedViewPageSize(state: SavedViewState, fallback: number): number {
  return typeof state.pageSize === 'number' && Number.isInteger(state.pageSize) && state.pageSize > 0
    ? state.pageSize
    : fallback;
}

function csvCell(value: string | number | boolean | null | undefined): string {
  const text = value === null || value === undefined ? '' : String(value);
  return `"${text.replace(/"/g, '""')}"`;
}

export function buildCsv<T>(
  rows: readonly T[],
  columns: ReadonlyArray<ColumnDef<T>>,
): string {
  const exportableColumns = columns.filter((column) => column.exportValue);
  const header = exportableColumns.map((column) => csvCell(column.header)).join(',');
  const body = rows.map((row) =>
    exportableColumns
      .map((column) => csvCell(column.exportValue?.(row)))
      .join(','),
  );
  return [header, ...body].join('\n');
}

export function downloadCsv(filename: string, content: string): void {
  const blob = new Blob([content], { type: CSV_MIME_TYPE });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

