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
const UTF8_BOM = '\uFEFF';
const LIST_STANDARD_STORAGE_PREFIX = 'axon:list-standard';

type QueryValue = string | number | boolean | null | undefined;

export interface ListQueryStateInput {
  filters: Record<string, QueryValue>;
  columns: readonly string[];
  pageSize: number;
  sort?: ListSortState | null;
}

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

export function getListColumnStorageKey(listKey: string): string {
  return `${LIST_STANDARD_STORAGE_PREFIX}:${listKey}:columns`;
}

function parseStoredColumnKeys(value: string | null): string[] | null {
  if (!value) return null;
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) return null;
    const keys = parsed.filter((item): item is string => typeof item === 'string' && item.length > 0);
    return keys.length > 0 ? keys : null;
  } catch {
    return null;
  }
}

export function loadPersistedColumnKeys<T>(
  listKey: string,
  columns: ReadonlyArray<ColumnDef<T>>,
  fallbackKeys?: readonly string[],
): string[] {
  if (typeof window === 'undefined') return normalizeColumnKeys(columns, fallbackKeys);

  const storedKeys = parseStoredColumnKeys(window.localStorage.getItem(getListColumnStorageKey(listKey)));
  return normalizeColumnKeys(columns, storedKeys ?? fallbackKeys);
}

export function persistColumnKeys(listKey: string, columnKeys: readonly string[]): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(getListColumnStorageKey(listKey), JSON.stringify([...columnKeys]));
}

export function createListQueryString(input: ListQueryStateInput): string {
  const params = new URLSearchParams();

  Object.entries(input.filters).forEach(([key, value]) => {
    if (value === null || value === undefined || value === '') return;
    params.set(`f.${key}`, String(value));
  });

  if (input.columns.length > 0) params.set('columns', input.columns.join(','));
  params.set('pageSize', String(input.pageSize));

  if (input.sort) {
    params.set('sort', `${input.sort.key}:${input.sort.direction}`);
  }

  return params.toString();
}

export function parseListQueryString(search: string | URLSearchParams): SavedViewState | null {
  const params = typeof search === 'string' ? new URLSearchParams(search) : search;
  const filters: Record<string, string> = {};

  params.forEach((value, key) => {
    if (key.startsWith('f.') && key.length > 2) {
      filters[key.slice(2)] = value;
    }
  });

  const columns = params.get('columns')?.split(',').filter((key) => key.length > 0);
  const rawPageSize = params.get('pageSize');
  const pageSize = rawPageSize ? Number(rawPageSize) : undefined;
  const normalizedPageSize = pageSize !== undefined && Number.isInteger(pageSize) && pageSize > 0
    ? pageSize
    : undefined;
  const rawSort = params.get('sort');
  const sortParts = rawSort?.split(':');
  const sortDirection: ListSortDirection | null = sortParts?.[1] === 'asc' || sortParts?.[1] === 'desc'
    ? sortParts[1]
    : null;
  const sort = sortParts?.length === 2 && sortDirection
    ? { key: sortParts[0] ?? '', direction: sortDirection }
    : null;

  if (Object.keys(filters).length === 0 && !columns && !pageSize && !sort) return null;

  return {
    filters,
    columns,
    pageSize: normalizedPageSize,
    sort,
  };
}

export function getListShareHref(queryString: string): string {
  if (!queryString) return typeof window === 'undefined' ? '' : window.location.pathname;
  if (typeof window === 'undefined') return `?${queryString}`;
  return `${window.location.origin}${window.location.pathname}?${queryString}`;
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
  const csvContent = content.startsWith(UTF8_BOM) ? content : `${UTF8_BOM}${content}`;
  const blob = new Blob([csvContent], { type: CSV_MIME_TYPE });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
