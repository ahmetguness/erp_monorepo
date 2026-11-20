import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
export interface OperationalAlert {
  name: string;
  expression: string;
  severity: "critical" | "warning";
  duration: string;
  service: string;
  summary: string;
  runbook: string;
}
export const operationalAlerts: readonly OperationalAlert[] = [
  { name: "CriticalPaymentWebhookFailure", expression: "increase(axon_payment_webhook_failures_total[5m]) > 0", severity: "critical", duration: "0s", service: "payments", summary: "Payment or webhook returned a server error; reconcile before retry", runbook: "payments" },
  { name: "EDocumentBacklog", expression: "axon_edocument_oldest_seconds > 300", severity: "warning", duration: "1m", service: "edocument", summary: "Unfinished electronic document exceeds 5min operational target", runbook: "edocument" },
  { name: "RealtimeUnconfirmedDelivery", expression: "increase(axon_realtime_unconfirmed_deliveries_total[5m]) > 0 or increase(axon_realtime_ack_tracking_overflow_total[5m]) > 0", severity: "warning", duration: "30s", service: "chat", summary: "Opted-in client did not confirm delivery or bounded receipt tracking overflowed", runbook: "websocket" },
  { name: "StorageMetadataMismatch", expression: "axon_storage_metadata_mismatches > 0", severity: "critical", duration: "30s", service: "storage", summary: "Committed object metadata and tenant storage accounting disagree", runbook: "storage" },
  {
    name: "ApiReplicaDown",
    expression: 'up{job="axon-api"} == 0',
    severity: "critical",
    duration: "30s",
    service: "api",
    summary: "API replica scrape is unavailable",
    runbook: "api-replica",
  },
  {
    name: "PostgresProbeFailure",
    expression: "axon_operational_probe_up == 0",
    severity: "critical",
    duration: "30s",
    service: "postgres",
    summary: "Independent database probe failed or exceeded its budget",
    runbook: "postgres",
  },
  {
    name: "ApiErrorBudget",
    expression: 'sum(rate(axon_http_request_duration_seconds_count{status=~"5.."}[5m])) / clamp_min(sum(rate(axon_http_request_duration_seconds_count[5m])), 0.001) > 0.005',
    severity: "critical",
    duration: "2m",
    service: "api",
    summary: "API 5xx ratio exceeds 0.5%",
    runbook: "api-errors",
  },
  {
    name: "ApiReadLatency",
    expression: 'histogram_quantile(0.95,sum by(le)(rate(axon_http_request_duration_seconds_bucket{method="GET",route!="/metrics"}[5m]))) > 0.3',
    severity: "warning",
    duration: "5m",
    service: "api",
    summary: "Read p95 exceeds Phase 8.2 300ms",
    runbook: "api-errors",
  },
  {
    name: "ApiWriteLatency",
    expression: 'histogram_quantile(0.95,sum by(le)(rate(axon_http_request_duration_seconds_bucket{method=~"POST|PUT|PATCH|DELETE"}[5m]))) > 0.8',
    severity: "warning",
    duration: "5m",
    service: "api",
    summary: "Write p95 exceeds Phase 8.2 800ms",
    runbook: "api-errors",
  },
  {
    name: "PostgresContention",
    expression: "axon_postgres_lock_waiters > 0 or increase(axon_postgres_deadlocks_total[5m]) > 0 or increase(axon_database_pool_timeouts_total[5m]) > 0",
    severity: "warning",
    duration: "1m",
    service: "postgres",
    summary: "Database contention or exhausted pool",
    runbook: "postgres",
  },
  {
    name: "RedisUnavailable",
    expression: 'axon_dependency_up{dependency="redis"} == 0',
    severity: "critical",
    duration: "30s",
    service: "redis",
    summary: "Redis readiness probe failed",
    runbook: "redis",
  },
  {
    name: "WorkerUnavailable",
    expression: 'axon_dependency_up{dependency="worker"} == 0',
    severity: "critical",
    duration: "30s",
    service: "worker",
    summary: "Worker heartbeat is unavailable",
    runbook: "worker",
  },
  {
    name: "OutboxBacklog",
    expression: "axon_outbox_oldest_seconds > 30",
    severity: "warning",
    duration: "1m",
    service: "worker",
    summary: "Oldest queued event exceeds Phase 8.2 30s",
    runbook: "worker",
  },
  {
    name: "OutboxDeadLetter",
    expression: "axon_outbox_dead_letter > 0 or axon_worker_dead_letter > 0",
    severity: "critical",
    duration: "30s",
    service: "worker",
    summary: "Dead-letter work requires operator intervention",
    runbook: "dead-letter",
  },
  {
    name: "OutboxExpiredLease",
    expression: "axon_outbox_expired_leases > 0",
    severity: "warning",
    duration: "1m",
    service: "worker",
    summary: "Expired outbox processing lease",
    runbook: "worker",
  },
  {
    name: "ProviderFailure",
    expression: "increase(axon_provider_connection_failures_total[5m]) > 0 or increase(axon_provider_rate_limits_total[5m]) > 0 or increase(axon_provider_server_errors_total[5m]) > 0",
    severity: "warning",
    duration: "30s",
    service: "provider",
    summary: "Provider timeout, connection, 429 or 5xx failure",
    runbook: "provider",
  },
  {
    name: "WebSocketFailure",
    expression: "increase(axon_realtime_failures_total[5m]) > 0",
    severity: "warning",
    duration: "30s",
    service: "chat",
    summary: "Realtime transport failure; verify receipt completeness",
    runbook: "websocket",
  },
  {
    name: "StorageUnavailable",
    expression: 'axon_dependency_up{dependency="storage"} == 0',
    severity: "critical",
    duration: "30s",
    service: "storage",
    summary: "Storage readiness probe failed",
    runbook: "storage",
  },
  {
    name: "StorageCleanupExhausted",
    expression: "axon_storage_cleanup_exhausted > 0",
    severity: "critical",
    duration: "30s",
    service: "storage",
    summary: "Bounded object cleanup exhausted its attempts",
    runbook: "storage",
  },
  {
    name: "BusinessInvariantViolation",
    expression: "axon_business_invariant_violations > 0",
    severity: "critical",
    duration: "0s",
    service: "integrity",
    summary: "Independent SQL business invariant violation",
    runbook: "business-invariants",
  },
  {
    name: "AuditIntegrityFailure",
    expression: "axon_audit_integrity_valid == 0",
    severity: "critical",
    duration: "0s",
    service: "security",
    summary: "Audit chain verification failed",
    runbook: "audit-integrity",
  },
  {
    name: "BackupFailure",
    expression: "axon_dr_repository_up == 0 or axon_dr_backup_failure == 1 or time() - axon_dr_backup_last_success_seconds > 93600",
    severity: "critical",
    duration: "1m",
    service: "dr",
    summary: "Backup failed, repository inaccessible or full backup older than 26h",
    runbook: "backup",
  },
  {
    name: "WalArchiveStale",
    expression: "axon_dr_wal_age_seconds > 900 or axon_dr_archive_failure == 1",
    severity: "critical",
    duration: "1m",
    service: "dr",
    summary: "WAL archive freshness exceeds 15min or archive failed",
    runbook: "wal-archive",
  },
  {
    name: "DrFeedMissing",
    expression: "absent(axon_dr_probe_up) or axon_dr_probe_up == 0 or time() - axon_dr_probe_timestamp_seconds > 120",
    severity: "critical",
    duration: "2m",
    service: "dr",
    summary: "Independent DR telemetry is missing, failing or stale",
    runbook: "backup",
  },
  {
    name: "AuthenticationAnomaly",
    expression: "increase(axon_authentication_failures_total[5m]) > 20",
    severity: "warning",
    duration: "1m",
    service: "security",
    summary: "Elevated authentication/MFA failures",
    runbook: "authentication",
  },
  {
    name: "TelemetryLoss",
    expression: "increase(axon_telemetry_dropped_spans_total[5m]) > 0 or increase(axon_log_export_dropped_total[5m]) > 0 or axon_telemetry_configuration_valid == 0",
    severity: "warning",
    duration: "30s",
    service: "monitoring",
    summary: "Diagnostic export is unavailable or dropping bounded buffers",
    runbook: "monitoring",
  },
  {
    name: "ClockSkew",
    expression: "axon_database_clock_offset_seconds > 5",
    severity: "warning",
    duration: "2m",
    service: "security",
    summary: "Database and application clocks differ by more than 5s",
    runbook: "clock",
  },
];
interface DashboardSpec {
  uid: string;
  title: string;
  panels: ReadonlyArray<readonly [
    string,
    string,
    string
  ]>;
}
export const dashboards: readonly DashboardSpec[] = [
  {
    uid: "axon-platform",
    title: "Platform Overview",
    panels: [
      ["API replicas", 'sum(up{job="axon-api"})', "short"],
      [
        "HTTP throughput",
        "sum(rate(axon_http_request_duration_seconds_count[5m]))",
        "reqps",
      ],
      ["Resident memory", "sum(axon_process_resident_bytes)", "bytes"],
      [
        "Process CPU",
        "sum(rate(axon_process_cpu_seconds_total[5m]))",
        "percentunit",
      ],
      [
        "Telemetry drops",
        "sum(increase(axon_telemetry_dropped_spans_total[5m]))",
        "short",
      ],
    ],
  },
  {
    uid: "axon-api",
    title: "API Performance",
    panels: [
      [
        "Endpoint p50",
        "histogram_quantile(0.50,sum by(le,route)(rate(axon_http_request_duration_seconds_bucket[5m])))",
        "s",
      ],
      [
        "Endpoint p95",
        "histogram_quantile(0.95,sum by(le,route)(rate(axon_http_request_duration_seconds_bucket[5m])))",
        "s",
      ],
      [
        "Endpoint p99",
        "histogram_quantile(0.99,sum by(le,route)(rate(axon_http_request_duration_seconds_bucket[5m])))",
        "s",
      ],
      [
        "4xx / 5xx",
        'sum by(status)(rate(axon_http_request_duration_seconds_count{status=~"4..|5.."}[5m]))',
        "reqps",
      ],
      ["Active requests", "sum(axon_http_active_requests)", "short"],
      ["Event loop p99", "axon_event_loop_delay_p99_milliseconds", "ms"],
    ],
  },
  {
    uid: "axon-postgres",
    title: "PostgreSQL / Prisma",
    panels: [
      ["Connections", "max(axon_postgres_connections)", "short"],
      ["Active / idle", '{__name__=~"axon_postgres_active_connections|axon_postgres_idle_connections"}', "short"],
      ["Prisma operations in flight including pool wait", 'sum(axon_database_operations_inflight)', "short"],
      ["Slow operations >=500ms", 'sum(rate(axon_database_slow_operations_total[5m]))', "ops"],
      ["Temporary disk writes", 'max(rate(axon_postgres_temporary_bytes_total[5m]))', "Bps"],
      ["Lock waiters", "max(axon_postgres_lock_waiters)", "short"],
      [
        "Operation p95 including pool wait",
        "histogram_quantile(0.95,sum by(le,model)(rate(axon_database_operation_duration_seconds_bucket[5m])))",
        "s",
      ],
      [
        "Transaction retries",
        "sum(rate(axon_transaction_retries_total[5m]))",
        "ops",
      ],
      ["Deadlocks", "max(axon_postgres_deadlocks_total)", "short"],
      [
        "Pool timeouts",
        "sum(increase(axon_database_pool_timeouts_total[5m]))",
        "short",
      ],
    ],
  },
  {
    uid: "axon-outbox",
    title: "Worker / Outbox",
    panels: [
      [
        "Queued states",
        '{__name__=~"axon_outbox_pending|axon_outbox_processing|axon_outbox_failed|axon_outbox_dead_letter"}',
        "short",
      ],
      ["Oldest work", "max(axon_outbox_oldest_seconds)", "s"],
      [
        "Delivery throughput",
        "sum(rate(axon_worker_deliveries_total[5m]))",
        "ops",
      ],
      [
        "Delivery p95",
        "histogram_quantile(0.95,sum by(le)(rate(axon_worker_delivery_duration_seconds_bucket[5m])))",
        "s",
      ],
      ["Expired leases", "max(axon_outbox_expired_leases)", "short"],
    ],
  },
  {
    uid: "axon-chat",
    title: "WebSocket / Chat",
    panels: [
      ["Active sockets", "sum(axon_realtime_connections)", "short"],
      ["Client-reported reconnects", "sum(increase(axon_realtime_client_reported_reconnects_total[5m]))", "short"],
      ["Heartbeat expiry closures", "sum(increase(axon_realtime_heartbeat_failures_total[5m]))", "short"],
      [
        "Transport failures",
        "sum(increase(axon_realtime_failures_total[5m]))",
        "short",
      ],
      ["Event loop delay", "max(axon_event_loop_delay_p99_milliseconds)", "ms"],
      ["Receipt latency p95 (server creation to ACK)", "histogram_quantile(0.95,sum by(le)(rate(axon_realtime_ack_latency_seconds_bucket[5m])))", "s"],
      ["Confirmed receipts", "sum(rate(axon_realtime_confirmed_deliveries_total[5m]))", "ops"],
      ["Unconfirmed receipts", "sum(increase(axon_realtime_unconfirmed_deliveries_total[5m]))", "short"],
      ["Receipt-enabled sockets", "sum(axon_realtime_ack_enabled_connections)", "short"],
    ],
  },
  {
    uid: "axon-storage",
    title: "Storage / Quota",
    panels: [
      ["Used by plan", "max by(plan)(axon_storage_used_bytes)", "bytes"],
      [
        "Reserved by plan",
        "max by(plan)(axon_storage_reserved_bytes)",
        "bytes",
      ],
      ["Cleanup pending", "max(axon_storage_cleanup_pending)", "short"],
      ["Cleanup exhausted", "max(axon_storage_cleanup_exhausted)", "short"],
      ["Metadata mismatches", "max(axon_storage_metadata_mismatches)", "short"],
      ["Provider p95", 'histogram_quantile(0.95,sum by(le)(rate(axon_provider_request_duration_seconds_bucket{provider="storage"}[5m])))', "s"],
      [
        "Accounting violations",
        'max(axon_business_invariant_violations{invariant="invalidStorageAccounting"})',
        "short",
      ],
    ],
  },
  {
    uid: "axon-dr",
    title: "Backup / Disaster Recovery",
    panels: [
      ["Full backup age", "time() - axon_dr_backup_last_success_seconds", "s"],
      ["WAL age", "axon_dr_wal_age_seconds", "s"],
      ["Repository health", "axon_dr_repository_up", "short"],
      ["Archive failure", "axon_dr_archive_failure", "short"],
      ["Feed age", "time() - axon_dr_probe_timestamp_seconds", "s"],
    ],
  },
  {
    uid: "axon-security",
    title: "Security / Critical Business Invariants",
    panels: [
      [
        "Invariant violations",
        "max by(invariant)(axon_business_invariant_violations)",
        "short",
      ],
      ["Audit integrity", "min(axon_audit_integrity_valid)", "short"],
      ["Probe health", "min(axon_operational_probe_up)", "short"],
      [
        "Authentication failures",
        "sum(increase(axon_authentication_failures_total[5m]))",
        "short",
      ],
      ["Clock skew", "axon_database_clock_offset_seconds", "s"],
    ],
  },
];
export async function writeOperationalConfiguration(root = resolve("deploy/observability/generated")): Promise<void> {
  await mkdir(resolve(root, "dashboards"), { recursive: true });
  const rules = operationalAlerts.map((alert) => ({
    alert: alert.name,
    expr: alert.expression,
    for: alert.duration,
    labels: { severity: alert.severity, service: alert.service },
    annotations: {
      summary: alert.summary,
      runbook_url: `https://github.com/ahmetguness/erp_monorepo/blob/main/docs/operations-runbooks.md#${alert.runbook}`,
    },
  }));
  await writeFile(resolve(root, "alerts.json"), JSON.stringify({ groups: [{ name: "axon-operational", interval: "15s", rules }] }, null, 2) + "\n");
  for (const dashboard of dashboards) {
    const panels = dashboard.panels.map(([title, expr, unit], index) => ({
      id: index + 1,
      title,
      type: "timeseries",
      datasource: { type: "prometheus", uid: "prometheus" },
      gridPos: {
        x: (index % 2) * 12,
        y: Math.floor(index / 2) * 8,
        w: 12,
        h: 8,
      },
      targets: [
        {
          refId: "A",
          expr,
          legendFormat: "{{instance}} {{route}} {{plan}} {{invariant}}",
        },
      ],
      fieldConfig: { defaults: { unit }, overrides: [] },
    }));
    panels.push({
      id: 99,
      title: "Correlated structured logs",
      type: "logs",
      datasource: { type: "loki", uid: "loki" },
      gridPos: { x: 0, y: Math.ceil(panels.length / 2) * 8, w: 24, h: 8 },
      targets: [
        {
          refId: "A",
          expr: '{service=~"axon-api|axon-worker"} | json',
          legendFormat: "",
        },
      ],
      fieldConfig: { defaults: { unit: "short" }, overrides: [] },
    });
    await writeFile(resolve(root, "dashboards", dashboard.uid + ".json"), JSON.stringify({
      uid: dashboard.uid,
      title: dashboard.title,
      schemaVersion: 39,
      version: 1,
      editable: false,
      timezone: "utc",
      refresh: "30s",
      time: { from: "now-1h", to: "now" },
      tags: ["axon", "operations"],
      panels,
      links: [
        {
          title: "Search distributed traces",
          type: "link",
          url: "/explore?left=%7B%22datasource%22%3A%22tempo%22%7D",
        },
      ],
    }, null, 2) + "\n");
  }
}
