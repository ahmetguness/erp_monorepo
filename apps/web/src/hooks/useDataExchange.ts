'use client';

import { useMutation, useQuery } from '@tanstack/react-query';
import { downloadTemplate, exportData, getDataQualitySummary, previewImport, type DataExchangeEntity, type ImportPreviewInput } from '@/services/data-exchange.service';

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
