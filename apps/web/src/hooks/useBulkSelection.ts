'use client';

import { useMemo, useState } from 'react';

export interface BulkSelectionState {
  selectedIds: ReadonlySet<string>;
  selectedIdList: readonly string[];
  selectedCount: number;
  isSelected: (id: string) => boolean;
  isPageSelected: boolean;
  isPagePartiallySelected: boolean;
  toggleOne: (id: string) => void;
  togglePage: () => void;
  clearSelection: () => void;
}

export function useBulkSelection(pageIds: readonly string[]): BulkSelectionState {
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<string>>(() => new Set());

  const selectedIdList = useMemo(() => Array.from(selectedIds), [selectedIds]);
  const selectedPageCount = pageIds.filter((id) => selectedIds.has(id)).length;
  const isPageSelected = pageIds.length > 0 && selectedPageCount === pageIds.length;
  const isPagePartiallySelected = selectedPageCount > 0 && selectedPageCount < pageIds.length;

  const toggleOne = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const togglePage = () => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (isPageSelected) {
        pageIds.forEach((id) => next.delete(id));
      } else {
        pageIds.forEach((id) => next.add(id));
      }
      return next;
    });
  };

  const clearSelection = () => setSelectedIds(new Set());

  return {
    selectedIds,
    selectedIdList,
    selectedCount: selectedIds.size,
    isSelected: (id) => selectedIds.has(id),
    isPageSelected,
    isPagePartiallySelected,
    toggleOne,
    togglePage,
    clearSelection,
  };
}
