'use client';

import { useQuery } from '@tanstack/react-query';
import { exportAuditLogs, getAuditLogs, getAuditLogById, type AuditLogExportParams, type AuditLogParams } from '@/services/audit-log.service';

export function useAuditLogs(params: AuditLogParams) {
  return useQuery({ queryKey: ['audit-logs', params], queryFn: () => getAuditLogs(params) });
}

export function useAuditLog(id: string) {
  return useQuery({ queryKey: ['audit-logs', id], queryFn: () => getAuditLogById(id), enabled: !!id });
}

export function useAuditLogExport(params?: AuditLogExportParams) {
  return useQuery({
    queryKey: ['audit-logs', 'export', params],
    queryFn: () => exportAuditLogs(params),
    enabled: false,
  });
}
