'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getTcmbRates } from '@/services/currency-rates.service';
import { getRecommendations } from '@/services/intelligence.service';
import {
  getDashboardApprovalRequests,
  getDashboardInvoices,
  getDashboardNotifications,
  getDashboardTasks,
} from '@/services/dashboard.service';
import { updateTaskStatus } from '@/services/task.service';
import { QUERY_INVALIDATION_KEYS } from '@/lib/query-invalidation';

interface QueryOptions {
  enabled?: boolean;
}

export const DASHBOARD_QUERY_KEYS = {
  rates: ['d', 'tcmb'] as const,
  invoices: ['d', 'invs'] as const,
  notifications: ['d', 'notifs'] as const,
  approvals: ['d', 'appr'] as const,
  tasks: QUERY_INVALIDATION_KEYS.dashboardTasks,
  recommendations: ['d', 'recommendations'] as const,
};

export function useDashboardRates() {
  return useQuery({
    queryKey: DASHBOARD_QUERY_KEYS.rates,
    queryFn: getTcmbRates,
    staleTime: 300_000,
  });
}

export function useDashboardInvoices(limit: number, options?: QueryOptions) {
  return useQuery({
    queryKey: [...DASHBOARD_QUERY_KEYS.invoices, limit] as const,
    queryFn: () => getDashboardInvoices(limit),
    enabled: options?.enabled ?? true,
  });
}

export function useDashboardNotifications(limit: number, options?: QueryOptions) {
  return useQuery({
    queryKey: [...DASHBOARD_QUERY_KEYS.notifications, limit] as const,
    queryFn: async () => {
      try {
        return await getDashboardNotifications(limit);
      } catch {
        return [];
      }
    },
    enabled: options?.enabled ?? true,
  });
}

export function useDashboardApprovals(limit: number, options?: QueryOptions) {
  return useQuery({
    queryKey: [...DASHBOARD_QUERY_KEYS.approvals, limit] as const,
    queryFn: async () => {
      try {
        return await getDashboardApprovalRequests(limit);
      } catch {
        return [];
      }
    },
    enabled: options?.enabled ?? true,
  });
}

export function useDashboardTasks(options?: QueryOptions) {
  return useQuery({
    queryKey: DASHBOARD_QUERY_KEYS.tasks,
    queryFn: async () => {
      try {
        return await getDashboardTasks();
      } catch {
        return [];
      }
    },
    enabled: options?.enabled ?? true,
  });
}

export function useDashboardRecommendations() {
  return useQuery({
    queryKey: DASHBOARD_QUERY_KEYS.recommendations,
    queryFn: async () => {
      try {
        return await getRecommendations();
      } catch {
        return [];
      }
    },
  });
}

export function useCompleteDashboardTask() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (taskId: string) => updateTaskStatus(taskId, 'DONE'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_INVALIDATION_KEYS.dashboardTasks });
      queryClient.invalidateQueries({ queryKey: QUERY_INVALIDATION_KEYS.workflowTasks });
    },
  });
}
