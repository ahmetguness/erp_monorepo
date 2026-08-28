import type { ObservabilitySnapshot } from '../../../../services/observability.service.js';

type PrometheusMetricType = 'counter' | 'gauge';

function metric(name: string, help: string, value: number, labels?: Readonly<Record<string, string>>, type: PrometheusMetricType = 'gauge'): string {
  const encodedLabels = labels
    ? `{${Object.entries(labels).map(([key, label]) => `${key}="${label.replaceAll('\\', '\\\\').replaceAll('"', '\\"').replaceAll('\n', '\\n')}"`).join(',')}}`
    : '';
  return `# HELP ${name} ${help}\n# TYPE ${name} ${type}\n${name}${encodedLabels} ${value}`;
}

export function renderPrometheusMetrics(snapshot: ObservabilitySnapshot): string {
  const lines = [
    metric('axon_process_uptime_seconds', 'Backend process uptime.', snapshot.runtime.uptimeSeconds),
    metric('axon_http_requests_total', 'Observed HTTP requests.', snapshot.http.totalRequests, undefined, 'counter'),
    metric('axon_http_errors_total', 'Observed HTTP server errors.', snapshot.http.totalErrors, undefined, 'counter'),
    metric('axon_http_error_rate_percent', 'HTTP server error rate.', snapshot.http.errorRatePct),
    metric('axon_http_latency_p95_milliseconds', 'HTTP request p95 latency.', snapshot.http.p95Ms),
    metric('axon_http_latency_p99_milliseconds', 'HTTP request p99 latency.', snapshot.http.p99Ms),
    metric('axon_outbox_pending', 'Pending durable outbox events.', snapshot.domainEvents.pendingCount),
    metric('axon_outbox_processing', 'Claimed durable outbox events.', snapshot.domainEvents.processingCount),
    metric('axon_outbox_failed', 'Outbox events waiting for retry.', snapshot.domainEvents.failedCount),
    metric('axon_outbox_dead_letter', 'Outbox dead-letter events.', snapshot.domainEvents.deadLetterCount),
    metric('axon_worker_retry_scheduled', 'Marketplace jobs waiting for retry.', snapshot.workerJobs.retryScheduledCount),
    metric('axon_worker_dead_letter', 'Marketplace dead-letter jobs.', snapshot.workerJobs.deadLetterCount),
    metric('axon_authorization_resolution_milliseconds', 'Average authorization resolution latency.', snapshot.authorization.avgDurationMs),
  ];

  for (const row of snapshot.workerJobs.byStatus) {
    lines.push(metric('axon_worker_jobs', 'Marketplace worker jobs by status.', row.count, { status: row.status }));
  }
  for (const external of snapshot.externalServices) {
    lines.push(metric('axon_external_requests', 'External HTTP requests by service.', external.requestCount, { service: external.service }));
    lines.push(metric('axon_external_request_errors', 'External HTTP errors by service.', external.errorCount, { service: external.service }));
    lines.push(metric('axon_external_request_duration_milliseconds', 'Average external HTTP latency by service.', external.avgDurationMs, { service: external.service }));
  }
  for (const alert of snapshot.alerts) {
    lines.push(metric('axon_observability_alert_active', 'Whether an observability alert is active.', alert.active ? 1 : 0, {
      alert: alert.key,
      severity: alert.severity,
    }));
  }
  return `${lines.join('\n')}\n`;
}
