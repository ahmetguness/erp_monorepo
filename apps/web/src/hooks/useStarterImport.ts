'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useUIStore } from '@/store/ui.store';
import { getErrorMessage } from '@/types/api.types';
import {
  commitStarterCsvImport,
  downloadStarterCsvImportTemplate,
  previewStarterCsvImport,
  type StarterCsvImportEntity,
  type StarterCsvImportInput,
} from '@/services/starter-import.service';

function invalidateEntityQueries(qc: ReturnType<typeof useQueryClient>, entity: StarterCsvImportEntity) {
  if (entity === 'products') {
    qc.invalidateQueries({ queryKey: ['products'] });
    qc.invalidateQueries({ queryKey: ['stock'] });
  } else {
    qc.invalidateQueries({ queryKey: ['contacts'] });
  }
  qc.invalidateQueries({ queryKey: ['settings', 'setup-checklist'] });
  qc.invalidateQueries({ queryKey: ['starter-health'] });
}

export function useStarterCsvImportTemplate() {
  return useMutation({
    mutationFn: (entity: StarterCsvImportEntity) => downloadStarterCsvImportTemplate(entity),
  });
}

export function useStarterCsvImportPreview() {
  return useMutation({
    mutationFn: (input: StarterCsvImportInput) => previewStarterCsvImport(input),
  });
}

export function useCommitStarterCsvImport() {
  const qc = useQueryClient();
  const { toast } = useUIStore();
  return useMutation({
    mutationFn: (input: StarterCsvImportInput) => commitStarterCsvImport(input),
    onSuccess: (result) => {
      invalidateEntityQueries(qc, result.entity);
      toast.success(`${result.createdCount} kayit ice aktarildi.`);
    },
    onError: (e: unknown) => toast.error(getErrorMessage(e)),
  });
}
