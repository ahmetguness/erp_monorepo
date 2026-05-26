import { DomainEventOutboxStatus, PrismaClient, SyncJobStatus } from '@prisma/client';

const SLOW_ENDPOINT_THRESHOLD_MS = 1_000;
const MAX_RECENT_SLOW_ENDPOINTS = 30;
const MAX_RECENT_ERRORS = 30;
const DYNAMIC_SEGMENT_PATTERN = /^([a-z0-9]{16,}|[0-9]+)$/i;

export interface HttpRequestMetricInput {
  method: string;
  path: string;
  status: number;
  durationMs: number;
  requestId: string;
  correlationId: string;
  occurredAt?: Date;
}

export interface ErrorMetricInput {
  method: string;
  path: string;
  message: string;
  requestId: string;
  correlationId: string;
  occurredAt?: Date;
}

interface EndpointLatencyMetric {
  key: string;
  method: string;
  path: string;
  count: number;
  errorCount: number;
  totalMs: number;
  maxMs: number;
  le100ms: number;
  le300ms: number;
  le1000ms: number;
  gt1000ms: number;
}

export interface EndpointLatencySnapshot {
  key: string;
  method: string;
  path: string;
  count: number;
  errorCount: number;
  avgMs: number;
  maxMs: number;
  histogram: {
    le100ms: number;
    le300ms: number;
    le1000ms: number;
    gt1000ms: number;
  };
}

export interface SlowEndpointSnapshot {
  method: string;
  path: string;
  status: number;
  durationMs: number;
  requestId: string;
  correlationId: string;
  occurredAt: string;
}

export interface RecentErrorSnapshot {
  method: string;
  path: string;
  message: string;
  requestId: string;
  correlationId: string;
  occurredAt: string;
}

export interface DomainEventFailureSnapshot {
  id: string;
  tenantId: string;
  tenantName: string | null;
  name: string;
  source: string;
  status: DomainEventOutboxStatus;
  attempts: number;
  lastError: string | null;
  updatedAt: string;
}

export interface WorkerJobMetricSnapshot {
  status: SyncJobStatus;
  count: number;
}

export interface RecentWorkerJobSnapshot {
  id: string;
  tenantId: string;
  tenantName: string | null;
  integrationId: string;
  jobType: string;
  status: SyncJobStatus;
  processedCount: number;
  errorCount: number;
  errorMessage: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  updatedAt: string;
}

export interface ObservabilitySnapshot {
  runtime: {
    appRole: string;
    marketplaceWorkerEnabled: boolean;
    uptimeSeconds: number;
    generatedAt: string;
  };
  http: {
    totalRequests: number;
    totalErrors: number;
    slowThresholdMs: number;
    endpoints: EndpointLatencySnapshot[];
    recentSlowEndpoints: SlowEndpointSnapshot[];
    recentErrors: RecentErrorSnapshot[];
  };
  domainEvents: {
    failedCount: number;
    deadLetterCount: number;
    recentFailures: DomainEventFailureSnapshot[];
  };
  workerJobs: {
    byStatus: WorkerJobMetricSnapshot[];
    recentProblemJobs: RecentWorkerJobSnapshot[];
  };
}

const endpointMetrics = new Map<string, EndpointLatencyMetric>();
const recentSlowEndpoints: SlowEndpointSnapshot[] = [];
const recentErrors: RecentErrorSnapshot[] = [];

function endpointKey(method: string, path: string): string {
  return `${method.toUpperCase()} ${path}`;
}

function normalizeMetricPath(path: string): string {
  return path
    .split('/')
    .map((segment) => (DYNAMIC_SEGMENT_PATTERN.test(segment) ? ':id' : segment))
    .join('/');
}

function pushLimited<T>(target: T[], item: T, limit: number): void {
  target.unshift(item);
  if (target.length > limit) target.length = limit;
}

function getEndpointMetric(method: string, path: string): EndpointLatencyMetric {
  const key = endpointKey(method, path);
  const existing = endpointMetrics.get(key);
  if (existing) return existing;

  const created: EndpointLatencyMetric = {
    key,
    method: method.toUpperCase(),
    path,
    count: 0,
    errorCount: 0,
    totalMs: 0,
    maxMs: 0,
    le100ms: 0,
    le300ms: 0,
    le1000ms: 0,
    gt1000ms: 0,
  };
  endpointMetrics.set(key, created);
  return created;
}

export function recordHttpRequest(input: HttpRequestMetricInput): void {
  const occurredAt = input.occurredAt ?? new Date();
  const path = normalizeMetricPath(input.path);
  const metric = getEndpointMetric(input.method, path);
  metric.count += 1;
  metric.totalMs += input.durationMs;
  metric.maxMs = Math.max(metric.maxMs, input.durationMs);
  if (input.status >= 500) metric.errorCount += 1;

  if (input.durationMs <= 100) metric.le100ms += 1;
  else if (input.durationMs <= 300) metric.le300ms += 1;
  else if (input.durationMs <= 1_000) metric.le1000ms += 1;
  else metric.gt1000ms += 1;

  if (input.durationMs >= SLOW_ENDPOINT_THRESHOLD_MS) {
    pushLimited(recentSlowEndpoints, {
      method: input.method.toUpperCase(),
      path,
      status: input.status,
      durationMs: input.durationMs,
      requestId: input.requestId,
      correlationId: input.correlationId,
      occurredAt: occurredAt.toISOString(),
    }, MAX_RECENT_SLOW_ENDPOINTS);
  }
}

export function recordUnhandledError(input: ErrorMetricInput): void {
  const occurredAt = input.occurredAt ?? new Date();
  const path = normalizeMetricPath(input.path);
  pushLimited(recentErrors, {
    method: input.method.toUpperCase(),
    path,
    message: input.message,
    requestId: input.requestId,
    correlationId: input.correlationId,
    occurredAt: occurredAt.toISOString(),
  }, MAX_RECENT_ERRORS);
}

function resolveMarketplaceWorkerEnabled(): boolean {
  if (process.env.MARKETPLACE_WORKER_ENABLED === 'true') return true;
  if (process.env.MARKETPLACE_WORKER_ENABLED === 'false') return false;
  const appRole = process.env.APP_ROLE ?? 'api';
  return appRole === 'worker' || appRole === 'all';
}

export async function getObservabilitySnapshot(prisma: PrismaClient): Promise<ObservabilitySnapshot> {
  const [failedCount, deadLetterCount, recentFailures, pendingJobs, runningJobs, doneJobs, failedJobs, recentProblemJobs] = await prisma.$transaction([
    prisma.domainEventOutbox.count({ where: { tenantId: { not: '' }, status: DomainEventOutboxStatus.FAILED } }),
    prisma.domainEventOutbox.count({ where: { tenantId: { not: '' }, status: DomainEventOutboxStatus.DEAD_LETTER } }),
    prisma.domainEventOutbox.findMany({
      where: { tenantId: { not: '' }, status: { in: [DomainEventOutboxStatus.FAILED, DomainEventOutboxStatus.DEAD_LETTER] } },
      select: {
        id: true,
        tenantId: true,
        name: true,
        source: true,
        status: true,
        attempts: true,
        lastError: true,
        updatedAt: true,
        tenant: { select: { companyName: true } },
      },
      orderBy: { updatedAt: 'desc' },
      take: 10,
    }),
    prisma.marketplaceSyncJob.count({ where: { tenantId: { not: '' }, status: SyncJobStatus.PENDING } }),
    prisma.marketplaceSyncJob.count({ where: { tenantId: { not: '' }, status: SyncJobStatus.RUNNING } }),
    prisma.marketplaceSyncJob.count({ where: { tenantId: { not: '' }, status: SyncJobStatus.DONE } }),
    prisma.marketplaceSyncJob.count({ where: { tenantId: { not: '' }, status: SyncJobStatus.FAILED } }),
    prisma.marketplaceSyncJob.findMany({
      where: { tenantId: { not: '' }, status: { in: [SyncJobStatus.PENDING, SyncJobStatus.RUNNING, SyncJobStatus.FAILED] } },
      select: {
        id: true,
        tenantId: true,
        integrationId: true,
        jobType: true,
        status: true,
        processedCount: true,
        errorCount: true,
        errorMessage: true,
        startedAt: true,
        finishedAt: true,
        updatedAt: true,
        tenant: { select: { companyName: true } },
      },
      orderBy: { updatedAt: 'desc' },
      take: 10,
    }),
  ]);

  const allEndpointMetrics = Array.from(endpointMetrics.values());
  const endpoints = allEndpointMetrics
    .map((metric): EndpointLatencySnapshot => ({
      key: metric.key,
      method: metric.method,
      path: metric.path,
      count: metric.count,
      errorCount: metric.errorCount,
      avgMs: metric.count > 0 ? Math.round(metric.totalMs / metric.count) : 0,
      maxMs: metric.maxMs,
      histogram: {
        le100ms: metric.le100ms,
        le300ms: metric.le300ms,
        le1000ms: metric.le1000ms,
        gt1000ms: metric.gt1000ms,
      },
    }))
    .sort((a, b) => b.avgMs - a.avgMs)
    .slice(0, 20);

  const totalRequests = allEndpointMetrics.reduce((sum, endpoint) => sum + endpoint.count, 0);
  const totalErrors = allEndpointMetrics.reduce((sum, endpoint) => sum + endpoint.errorCount, 0);

  return {
    runtime: {
      appRole: process.env.APP_ROLE ?? 'api',
      marketplaceWorkerEnabled: resolveMarketplaceWorkerEnabled(),
      uptimeSeconds: Math.round(process.uptime()),
      generatedAt: new Date().toISOString(),
    },
    http: {
      totalRequests,
      totalErrors,
      slowThresholdMs: SLOW_ENDPOINT_THRESHOLD_MS,
      endpoints,
      recentSlowEndpoints: [...recentSlowEndpoints],
      recentErrors: [...recentErrors],
    },
    domainEvents: {
      failedCount,
      deadLetterCount,
      recentFailures: recentFailures.map((event): DomainEventFailureSnapshot => ({
        id: event.id,
        tenantId: event.tenantId,
        tenantName: event.tenant?.companyName ?? null,
        name: event.name,
        source: event.source,
        status: event.status,
        attempts: event.attempts,
        lastError: event.lastError,
        updatedAt: event.updatedAt.toISOString(),
      })),
    },
    workerJobs: {
      byStatus: [
        { status: SyncJobStatus.PENDING, count: pendingJobs },
        { status: SyncJobStatus.RUNNING, count: runningJobs },
        { status: SyncJobStatus.DONE, count: doneJobs },
        { status: SyncJobStatus.FAILED, count: failedJobs },
      ],
      recentProblemJobs: recentProblemJobs.map((job): RecentWorkerJobSnapshot => ({
        id: job.id,
        tenantId: job.tenantId,
        tenantName: job.tenant?.companyName ?? null,
        integrationId: job.integrationId,
        jobType: job.jobType,
        status: job.status,
        processedCount: job.processedCount,
        errorCount: job.errorCount,
        errorMessage: job.errorMessage,
        startedAt: job.startedAt?.toISOString() ?? null,
        finishedAt: job.finishedAt?.toISOString() ?? null,
        updatedAt: job.updatedAt.toISOString(),
      })),
    },
  };
}
