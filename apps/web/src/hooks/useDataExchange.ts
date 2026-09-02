'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createEdiB2BRetryTask,
  createDataQualityTask,
  downloadTemplate,
  exportData,
  getEdiB2BHub,
  getDataQualitySummary,
  getImportBatches,
  previewImport,
  rollbackImportBatch,
  scanDuplicates,
  previewContactMerge,
  mergeContacts,
  rollbackContactMerge,
  type ContactMergeInput,
  type DedupEntity,
  type DataExchangeEntity,
  type ImportPreviewInput,
} from '@/services/data-exchange.service';

export function useImportPreview() {
  return useMutation({
    mutationFn: (input: ImportPreviewInput) => previewImport(input),
  });
}

export function useDuplicateCandidates(entity: DedupEntity, enabled = true) {
  return useQuery({ queryKey: ['data-exchange', 'duplicates', entity], queryFn: () => scanDuplicates(entity), enabled });
}

export function usePreviewContactMerge() {
  return useMutation({ mutationFn: (input: ContactMergeInput) => previewContactMerge(input) });
}

export function useMergeContacts() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: (input: ContactMergeInput) => mergeContacts(input), onSuccess: () => { qc.invalidateQueries({ queryKey: ['data-exchange', 'duplicates'] }); qc.invalidateQueries({ queryKey: ['contacts'] }); qc.invalidateQueries({ queryKey: ['data-exchange', 'quality'] }); } });
}

export function useRollbackContactMerge() {
  const qc = useQueryClient();
  return useMutation({ mutationFn: rollbackContactMerge, onSuccess: () => { qc.invalidateQueries({ queryKey: ['data-exchange', 'duplicates'] }); qc.invalidateQueries({ queryKey: ['contacts'] }); } });
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

export function useCreateEdiB2BRetryTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (itemKey: string) => createEdiB2BRetryTask(itemKey),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['data-exchange', 'b2b'] });
      qc.invalidateQueries({ queryKey: ['tasks'] });
    },
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
