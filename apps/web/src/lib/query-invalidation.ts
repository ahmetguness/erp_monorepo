export const QUERY_INVALIDATION_KEYS = {
  dashboard: ['d'] as const,
  dashboardTasks: ['d', 'tasks'] as const,
  workflowTasks: ['workflow-tasks'] as const,
  reports: ['reports'] as const,
  invoices: ['invoices'] as const,
  notifications: ['notifications'] as const,
  approvalRequests: ['approval-requests'] as const,
  fiscalPeriods: ['accounting', 'fiscal-periods'] as const,
} as const;

export type QueryInvalidationKey = keyof typeof QUERY_INVALIDATION_KEYS;
