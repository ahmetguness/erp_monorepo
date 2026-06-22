import { AsyncLocalStorage } from 'async_hooks';
import { DomainEventOutboxStatus, PrismaClient, SyncJobStatus } from '@prisma/client';

const SLOW_ENDPOINT_THRESHOLD_MS = 1_000;
const SLOW_QUERY_THRESHOLD_MS = 500;
const MAX_RECENT_SLOW_ENDPOINTS = 30;
const MAX_RECENT_ERRORS = 30;
const MAX_RECENT_SLOW_QUERIES = 30;
const MAX_LATENCY_SAMPLES_PER_ENDPOINT = 200;
const TREND_BUCKET_COUNT = 12;
const TREND_BUCKET_MS = 60_000;
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

export interface SlowQueryMetricInput {
  model: string | null;
  action: string;
  durationMs: number;
  requestId?: string | null;
  correlationId?: string | null;
  occurredAt?: Date;
}

interface ObservabilityRequestContext {
  requestId: string;
  correlationId: string;
}

const requestContext = new AsyncLocalStorage<ObservabilityRequestContext>();

export async function runWithObservabilityContext<T>(context: ObservabilityRequestContext, callback: () => Promise<T>): Promise<T> {
  return requestContext.run(context, callback);
}

export function getCurrentObservabilityContext(): ObservabilityRequestContext | null {
  return requestContext.getStore() ?? null;
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
  samples: number[];
}

export interface EndpointLatencySnapshot {
  key: string;
  method: string;
  path: string;
  count: number;
  errorCount: number;
  avgMs: number;
  p95Ms: number;
  p99Ms: number;
  errorRatePct: number;
  maxMs: number;
  histogram: {
    le100ms: number;
    le300ms: number;
    le1000ms: number;
    gt1000ms: number;
  };
}

export interface ErrorRateTrendSnapshot {
  bucketStart: string;
  requestCount: number;
  errorCount: number;
  errorRatePct: number;
}

export interface SlowQuerySnapshot {
  model: string | null;
  action: string;
  durationMs: number;
  requestId: string | null;
  correlationId: string | null;
  occurredAt: string;
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
    errorRatePct: number;
    slowThresholdMs: number;
    p95Ms: number;
    p99Ms: number;
    endpoints: EndpointLatencySnapshot[];
    errorRateTrend: ErrorRateTrendSnapshot[];
    recentSlowEndpoints: SlowEndpointSnapshot[];
    recentErrors: RecentErrorSnapshot[];
  };
  slowQueries: {
    thresholdMs: number;
    recent: SlowQuerySnapshot[];
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
  telemetry: {
    persistence: {
      mode: 'in-memory' | 'persistent';
      durable: boolean;
      detail: string;
    };
    sentry: { enabled: boolean };
    openTelemetry: { enabled: boolean; exporter: string | null };
  };
}

const endpointMetrics = new Map<string, EndpointLatencyMetric>();
const recentSlowEndpoints: SlowEndpointSnapshot[] = [];
const recentErrors: RecentErrorSnapshot[] = [];
const recentSlowQueries: SlowQuerySnapshot[] = [];
const requestTrendBuckets = new Map<number, { requestCount: number; errorCount: number }>();

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
    samples: [],
  };
  endpointMetrics.set(key, created);
  return created;
}

function percentile(values: readonly number[], pct: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(sorted.length - 1, Math.ceil((pct / 100) * sorted.length) - 1);
  return Math.round(sorted[index]);
}

function recordTrend(occurredAt: Date, isError: boolean): void {
  const bucket = Math.floor(occurredAt.getTime() / TREND_BUCKET_MS) * TREND_BUCKET_MS;
  const current = requestTrendBuckets.get(bucket) ?? { requestCount: 0, errorCount: 0 };
  current.requestCount += 1;
  if (isError) current.errorCount += 1;
  requestTrendBuckets.set(bucket, current);

  const oldestAllowed = bucket - ((TREND_BUCKET_COUNT - 1) * TREND_BUCKET_MS);
  Array.from(requestTrendBuckets.keys()).forEach((key) => {
    if (key < oldestAllowed) requestTrendBuckets.delete(key);
  });
}

function trendSnapshot(now: Date): ErrorRateTrendSnapshot[] {
  const currentBucket = Math.floor(now.getTime() / TREND_BUCKET_MS) * TREND_BUCKET_MS;
  return Array.from({ length: TREND_BUCKET_COUNT }, (_, index): ErrorRateTrendSnapshot => {
    const bucket = currentBucket - ((TREND_BUCKET_COUNT - 1 - index) * TREND_BUCKET_MS);
    const row = requestTrendBuckets.get(bucket) ?? { requestCount: 0, errorCount: 0 };
    return {
      bucketStart: new Date(bucket).toISOString(),
      requestCount: row.requestCount,
      errorCount: row.errorCount,
      errorRatePct: row.requestCount > 0 ? Math.round((row.errorCount / row.requestCount) * 10_000) / 100 : 0,
    };
  });
}

export function recordHttpRequest(input: HttpRequestMetricInput): void {
  const occurredAt = input.occurredAt ?? new Date();
  const path = normalizeMetricPath(input.path);
  const metric = getEndpointMetric(input.method, path);
  const isError = input.status >= 500;
  metric.count += 1;
  metric.totalMs += input.durationMs;
  metric.maxMs = Math.max(metric.maxMs, input.durationMs);
  if (isError) metric.errorCount += 1;
  metric.samples.push(input.durationMs);
  if (metric.samples.length > MAX_LATENCY_SAMPLES_PER_ENDPOINT) metric.samples.shift();
  recordTrend(occurredAt, isError);

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
  recordTrend(occurredAt, true);
  pushLimited(recentErrors, {
    method: input.method.toUpperCase(),
    path,
    message: input.message,
    requestId: input.requestId,
    correlationId: input.correlationId,
    occurredAt: occurredAt.toISOString(),
  }, MAX_RECENT_ERRORS);
}

export function recordSlowQuery(input: SlowQueryMetricInput): void {
  if (input.durationMs < SLOW_QUERY_THRESHOLD_MS) return;
  const occurredAt = input.occurredAt ?? new Date();
  const context = getCurrentObservabilityContext();
  pushLimited(recentSlowQueries, {
    model: input.model,
    action: input.action,
    durationMs: input.durationMs,
    requestId: input.requestId ?? context?.requestId ?? null,
    correlationId: input.correlationId ?? context?.correlationId ?? null,
    occurredAt: occurredAt.toISOString(),
  }, MAX_RECENT_SLOW_QUERIES);
}

function resolveMarketplaceWorkerEnabled(): boolean {
  if (process.env.MARKETPLACE_WORKER_ENABLED === 'true') return true;
  if (process.env.MARKETPLACE_WORKER_ENABLED === 'false') return false;
  const appRole = process.env.APP_ROLE ?? 'api';
  return appRole === 'worker' || appRole === 'all';
}

function resolveTelemetry() {
  const otelExporter = process.env.OTEL_EXPORTER_OTLP_ENDPOINT ?? process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT ?? null;
  return {
    persistence: {
      mode: 'in-memory' as const,
      durable: false,
      detail: 'Runtime metrikleri process belleğinde tutulur; restart sonrası kalıcı geçmiş için database/OTLP metric store adaptörü bağlanmalıdır.',
    },
    sentry: { enabled: Boolean(process.env.SENTRY_DSN) },
    openTelemetry: { enabled: Boolean(otelExporter), exporter: otelExporter },
  };
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
  const allSamples = allEndpointMetrics.flatMap((metric) => metric.samples);
  const endpoints = allEndpointMetrics
    .map((metric): EndpointLatencySnapshot => ({
      key: metric.key,
      method: metric.method,
      path: metric.path,
      count: metric.count,
      errorCount: metric.errorCount,
      avgMs: metric.count > 0 ? Math.round(metric.totalMs / metric.count) : 0,
      p95Ms: percentile(metric.samples, 95),
      p99Ms: percentile(metric.samples, 99),
      errorRatePct: metric.count > 0 ? Math.round((metric.errorCount / metric.count) * 10_000) / 100 : 0,
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
  const generatedAt = new Date();

  return {
    runtime: {
      appRole: process.env.APP_ROLE ?? 'api',
      marketplaceWorkerEnabled: resolveMarketplaceWorkerEnabled(),
      uptimeSeconds: Math.round(process.uptime()),
      generatedAt: generatedAt.toISOString(),
    },
    http: {
      totalRequests,
      totalErrors,
      errorRatePct: totalRequests > 0 ? Math.round((totalErrors / totalRequests) * 10_000) / 100 : 0,
      slowThresholdMs: SLOW_ENDPOINT_THRESHOLD_MS,
      p95Ms: percentile(allSamples, 95),
      p99Ms: percentile(allSamples, 99),
      endpoints,
      errorRateTrend: trendSnapshot(generatedAt),
      recentSlowEndpoints: [...recentSlowEndpoints],
      recentErrors: [...recentErrors],
    },
    slowQueries: {
      thresholdMs: SLOW_QUERY_THRESHOLD_MS,
      recent: [...recentSlowQueries],
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
    telemetry: resolveTelemetry(),
  };
}
