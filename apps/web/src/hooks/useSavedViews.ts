'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useUIStore } from '@/store/ui.store';
import { getErrorMessage } from '@/types/api.types';
import {
  createSavedView,
  deleteSavedView,
  getSavedViews,
  updateSavedView,
  type CreateSavedViewDTO,
  type UpdateSavedViewDTO,
} from '@/services/saved-view.service';

const SAVED_VIEW_KEYS = {
  all: ['saved-views'] as const,
  list: (listKey?: string) => ['saved-views', listKey] as const,
};

export function useSavedViews(listKey?: string) {
  return useQuery({
    queryKey: SAVED_VIEW_KEYS.list(listKey),
    queryFn: () => getSavedViews(listKey),
  });
}

export function useCreateSavedView() {
  const qc = useQueryClient();
  const { toast } = useUIStore();
  return useMutation({
    mutationFn: (data: CreateSavedViewDTO) => createSavedView(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: SAVED_VIEW_KEYS.all });
      toast.success('Görünüm kaydedildi.');
    },
    onError: (e: unknown) => toast.error(getErrorMessage(e)),
  });
}

export function useUpdateSavedView() {
  const qc = useQueryClient();
  const { toast } = useUIStore();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateSavedViewDTO }) => updateSavedView(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: SAVED_VIEW_KEYS.all });
      toast.success('Görünüm güncellendi.');
    },
    onError: (e: unknown) => toast.error(getErrorMessage(e)),
  });
}

export function useDeleteSavedView() {
  const qc = useQueryClient();
  const { toast } = useUIStore();
  return useMutation({
    mutationFn: (id: string) => deleteSavedView(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: SAVED_VIEW_KEYS.all });
      toast.success('Görünüm silindi.');
    },
    onError: (e: unknown) => toast.error(getErrorMessage(e)),
  });
}
