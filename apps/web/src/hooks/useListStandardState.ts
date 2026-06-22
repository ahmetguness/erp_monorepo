'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ColumnDef } from '@/components/shared/DataTable';
import {
  createListQueryString,
  createListSavedViewState,
  getListShareHref,
  getSavedViewPageSize,
  getVisibleColumns,
  loadPersistedColumnKeys,
  normalizeColumnKeys,
  parseListQueryString,
  persistColumnKeys,
} from '@/lib/list-standard';
import type { SavedViewState } from '@/services/saved-view.service';

type ListFilterValue = string | number | boolean | null | undefined;
export type ListFilterState = Record<string, ListFilterValue>;

export interface UseListStandardStateOptions<TRow, TFilters extends ListFilterState> {
  listKey: string;
  columns: ReadonlyArray<ColumnDef<TRow>>;
  defaultFilters: TFilters;
  defaultPageSize: number;
  defaultColumnKeys?: readonly string[];
  parseFilters: (state: SavedViewState) => TFilters;
}

function areColumnKeysEqual(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((key, index) => key === right[index]);
}

interface ListStandardRuntimeState<TFilters extends ListFilterState> {
  filters: TFilters;
  page: number;
  pageSize: number;
  visibleColumnKeys: string[];
}

function getInitialRuntimeState<TRow, TFilters extends ListFilterState>({
  listKey,
  columns,
  defaultFilters,
  defaultPageSize,
  defaultColumnKeys,
  parseFilters,
}: UseListStandardStateOptions<TRow, TFilters>): ListStandardRuntimeState<TFilters> {
  if (typeof window === 'undefined') {
    return {
      filters: defaultFilters,
      page: 1,
      pageSize: defaultPageSize,
      visibleColumnKeys: normalizeColumnKeys(columns, defaultColumnKeys),
    };
  }

  const queryState = parseListQueryString(window.location.search);
  if (queryState) {
    return {
      filters: parseFilters(queryState),
      page: 1,
      pageSize: getSavedViewPageSize(queryState, defaultPageSize),
      visibleColumnKeys: normalizeColumnKeys(columns, queryState.columns),
    };
  }

  return {
    filters: defaultFilters,
    page: 1,
    pageSize: defaultPageSize,
    visibleColumnKeys: loadPersistedColumnKeys(listKey, columns, defaultColumnKeys),
  };
}

export function useListStandardState<TRow, TFilters extends ListFilterState>({
  listKey,
  columns,
  defaultFilters,
  defaultPageSize,
  defaultColumnKeys,
  parseFilters,
}: UseListStandardStateOptions<TRow, TFilters>) {
  const [state, setState] = useState<ListStandardRuntimeState<TFilters>>(() =>
    getInitialRuntimeState({ listKey, columns, defaultFilters, defaultPageSize, defaultColumnKeys, parseFilters }),
  );

  const normalizedVisibleColumnKeys = useMemo(
    () => normalizeColumnKeys(columns, state.visibleColumnKeys),
    [columns, state.visibleColumnKeys],
  );

  useEffect(() => {
    persistColumnKeys(listKey, normalizedVisibleColumnKeys);
  }, [listKey, normalizedVisibleColumnKeys]);

  const setPageSize = useCallback((nextPageSize: number) => {
    setState((current) => ({ ...current, page: 1, pageSize: nextPageSize }));
  }, []);

  const setVisibleColumnKeys = useCallback((keys: string[]) => {
    setState((current) => {
      const normalized = normalizeColumnKeys(columns, keys);
      return areColumnKeysEqual(current.visibleColumnKeys, normalized)
        ? current
        : { ...current, visibleColumnKeys: normalized };
    });
  }, [columns]);

  const setFilters = useCallback((filters: TFilters) => {
    setState((current) => ({ ...current, filters }));
  }, []);

  const patchFilters = useCallback((patch: Partial<TFilters>) => {
    setState((current) => ({
      ...current,
      filters: { ...current.filters, ...patch },
      page: 1,
    }));
  }, []);

  const setPage = useCallback((page: number) => {
    setState((current) => ({ ...current, page }));
  }, []);

  const visibleColumns = useMemo(
    () => getVisibleColumns(columns, normalizedVisibleColumnKeys),
    [columns, normalizedVisibleColumnKeys],
  );

  const currentState = useMemo<SavedViewState>(() => createListSavedViewState({
    filters: state.filters,
    columns: normalizedVisibleColumnKeys,
    pageSize: state.pageSize,
  }), [normalizedVisibleColumnKeys, state.filters, state.pageSize]);

  const applyView = useCallback((state: SavedViewState) => {
    setState({
      filters: parseFilters(state),
      page: 1,
      pageSize: getSavedViewPageSize(state, defaultPageSize),
      visibleColumnKeys: normalizeColumnKeys(columns, state.columns),
    });
  }, [columns, defaultPageSize, parseFilters]);

  const queryString = useMemo(() => createListQueryString({
    filters: state.filters,
    columns: normalizedVisibleColumnKeys,
    pageSize: state.pageSize,
    sort: currentState.sort ?? null,
  }), [currentState.sort, normalizedVisibleColumnKeys, state.filters, state.pageSize]);

  const shareHref = useMemo(() => getListShareHref(queryString), [queryString]);

  return {
    filters: state.filters,
    setFilters,
    patchFilters,
    page: state.page,
    setPage,
    pageSize: state.pageSize,
    setPageSize,
    visibleColumnKeys: normalizedVisibleColumnKeys,
    setVisibleColumnKeys,
    visibleColumns,
    currentState,
    applyView,
    queryString,
    shareHref,
  };
}
