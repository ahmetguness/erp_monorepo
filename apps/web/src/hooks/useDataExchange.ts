'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createDataQualityTask,
  downloadTemplate,
  exportData,
  getEdiB2BHub,
  getDataQualitySummary,
  getImportBatches,
  previewImport,
  rollbackImportBatch,
  type DataExchangeEntity,
  type ImportPreviewInput,
} from '@/services/data-exchange.service';

export function useImportPreview() {
  return useMutation({
    mutationFn: (input: ImportPreviewInput) => previewImport(input),
  });
}

export function useTemplateDownload() {
  return useMutation({
    mutationFn: (entity: DataExchangeEntity) => downloadTemplate(entity),
  });
}

export function useDataExport() {
  return useMutation({
    mutationFn: (entity: DataExchangeEntity) => exportData(entity),
  });
}

export function useDataQualitySummary() {
  return useQuery({
    queryKey: ['data-exchange', 'quality'],
    queryFn: getDataQualitySummary,
  });
}

export function useEdiB2BHub() {
  return useQuery({
    queryKey: ['data-exchange', 'b2b'],
    queryFn: getEdiB2BHub,
  });
}

export function useImportBatches() {
  return useQuery({
    queryKey: ['data-exchange', 'import-batches'],
    queryFn: getImportBatches,
  });
}

export function useRollbackImportBatch() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (batchId: string) => rollbackImportBatch(batchId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['data-exchange', 'import-batches'] }),
  });
}

export function useCreateDataQualityTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (issueKey: string) => createDataQualityTask(issueKey),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['data-exchange', 'quality'] });
      qc.invalidateQueries({ queryKey: ['tasks'] });
    },
  });
}
