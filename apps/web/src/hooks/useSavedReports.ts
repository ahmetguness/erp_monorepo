'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useUIStore } from '@/store/ui.store';
import { getErrorMessage } from '@/types/api.types';
import {
  getSavedReports, createSavedReport, updateSavedReport, deleteSavedReport,
  type CreateSavedReportDTO,
} from '@/services/saved-report.service';

export function useSavedReports(module?: string) {
  return useQuery({ queryKey: ['saved-reports', module], queryFn: () => getSavedReports(module) });
}

export function useCreateSavedReport() {
  const qc = useQueryClient();
  const { toast } = useUIStore();
  return useMutation({
    mutationFn: (data: CreateSavedReportDTO) => createSavedReport(data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['saved-reports'] }); toast.success('Rapor kaydedildi.'); },
    onError: (e: unknown) => toast.error(getErrorMessage(e)),
  });
}

export function useUpdateSavedReport() {
  const qc = useQueryClient();
  const { toast } = useUIStore();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<CreateSavedReportDTO> }) => updateSavedReport(id, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['saved-reports'] }); toast.success('Rapor güncellendi.'); },
    onError: (e: unknown) => toast.error(getErrorMessage(e)),
  });
}

export function useDeleteSavedReport() {
  const qc = useQueryClient();
  const { toast } = useUIStore();
  return useMutation({
    mutationFn: (id: string) => deleteSavedReport(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['saved-reports'] }); toast.success('Rapor silindi.'); },
    onError: (e: unknown) => toast.error(getErrorMessage(e)),
  });
}
