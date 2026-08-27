import type { Priority, ServiceStatus } from '@prisma/client';

export interface ServiceRequestSla {
  limitHours: number;
  targetDate: string;
  isBreached: boolean;
  remainingMinutes: number;
}

const SLA_LIMIT_HOURS: Readonly<Record<Priority, number>> = {
  CRITICAL: 2,
  HIGH: 4,
  MEDIUM: 24,
  LOW: 72,
};

export function calculateServiceRequestSla(
  createdAt: Date,
  priority: Priority,
  status: ServiceStatus,
  closedAt: Date | null,
  now: Date = new Date(),
): ServiceRequestSla {
  const limitHours = SLA_LIMIT_HOURS[priority];
  const targetDate = new Date(createdAt.getTime() + limitHours * 60 * 60 * 1000);
  const resolvedAt = closedAt ?? (status === 'COMPLETED' || status === 'CANCELLED' ? now : null);
  const comparisonDate = resolvedAt ?? now;
  const remainingMs = targetDate.getTime() - comparisonDate.getTime();
  return {
    limitHours,
    targetDate: targetDate.toISOString(),
    isBreached: remainingMs < 0,
    remainingMinutes: Math.round(remainingMs / (60 * 1000)),
  };
}
