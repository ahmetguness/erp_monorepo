'use client';

import { useQuery } from '@tanstack/react-query';
import { getAuditLogs, getAuditLogById, type AuditLogParams } from '@/services/audit-log.service';

export function useAuditLogs(params: AuditLogParams) {
  return useQuery({ queryKey: ['audit-logs', params], queryFn: () => getAuditLogs(params) });
}

export function useAuditLog(id: string) {
  return useQuery({ queryKey: ['audit-logs', id], queryFn: () => getAuditLogById(id), enabled: !!id });
}
