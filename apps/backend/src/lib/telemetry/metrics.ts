const bounds = [0.005, 0.01, 0.025, 0.05, 0.1, 0.2, 0.3, 0.5, 0.8, 1, 2, 5, 15, 30];
interface Histogram {
  count: number;
  sum: number;
  buckets: number[];
  labels: Readonly<Record<string, string>>;
}
const histograms = new Map<string, Map<string, Histogram>>();
const counters = new Map<string, number>([
  'axon_http_requests_total', 'axon_http_errors_total', 'axon_http_client_errors_total', 'axon_http_server_errors_total',
  'axon_database_failures_total', 'axon_transaction_failures_total', 'axon_transaction_retries_total',
  'axon_database_slow_operations_total', 'axon_realtime_client_reported_reconnects_total', 'axon_realtime_heartbeat_failures_total',
  'axon_provider_connection_failures_total', 'axon_provider_rate_limits_total', 'axon_provider_server_errors_total', 'axon_provider_client_errors_total',
  'axon_provider_timeouts_total',
  'axon_worker_deliveries_total', 'axon_worker_delivery_failures_total', 'axon_realtime_failures_total',
  'axon_outbox_recovered_leases_total', 'axon_outbox_duplicate_consumer_skips_total',
  'axon_realtime_confirmed_deliveries_total', 'axon_realtime_unconfirmed_deliveries_total', 'axon_realtime_ack_tracking_overflow_total', 'axon_realtime_unknown_acknowledgements_total', 'axon_realtime_control_frame_overflow_total',
  'axon_payment_webhook_failures_total',
  'axon_authentication_failures_total', 'axon_log_exported_total', 'axon_log_export_failures_total', 'axon_log_export_dropped_total',
].map(name => [name, 0]));
const gauges = new Map<string, {
  name: string;
  value: number;
  labels: Readonly<Record<string, string>>;
}>();
export function setTelemetryGauge(name: 'axon_dependency_up' | 'axon_http_active_requests' | 'axon_realtime_pending_acknowledgements' | 'axon_realtime_ack_enabled_connections', value: number, labels: Readonly<Record<string, string>> = {}): void {
  const key = name + JSON.stringify(labels);
  if (!Number.isFinite(value) || (!gauges.has(key) && gauges.size >= 32))
    return;
  gauges.set(key, { name, value, labels });
}
let activeRequests = 0;
export function trackHttpRequest(): () => void {
  setTelemetryGauge('axon_http_active_requests', ++activeRequests);
  let closed = false;
  return () => {
    if (!closed) {
      closed = true;
      setTelemetryGauge('axon_http_active_requests', --activeRequests);
    }
  };
}
export function countTelemetry(name: string, amount = 1): void {
  if (!/^[a-z][a-z0-9_]{1,100}$/.test(name) || !Number.isFinite(amount) || amount < 0 || (!counters.has(name) && counters.size >= 128))
    return;
  counters.set(name, (counters.get(name) ?? 0) + amount);
}
export function observeTelemetry(name: 'axon_http_request_duration_seconds' | 'axon_database_operation_duration_seconds' | 'axon_provider_request_duration_seconds' | 'axon_worker_delivery_duration_seconds' | 'axon_realtime_ack_latency_seconds', seconds: number, labels: Readonly<Record<string, string>>): void {
  if (!Number.isFinite(seconds) || seconds < 0)
    return;
  let rows = histograms.get(name);
  if (!rows) {
    rows = new Map();
    histograms.set(name, rows);
  }
  let encoded = JSON.stringify(labels);
  if (!rows.has(encoded) && rows.size >= 256) {
    labels = { overflow: 'true' };
    encoded = JSON.stringify(labels);
  }
  let row = rows.get(encoded);
  if (!row) {
    row = { count: 0, sum: 0, buckets: bounds.map(() => 0), labels };
    rows.set(encoded, row);
  }
  row.count++;
  row.sum += seconds;
  bounds.forEach((bound, index) => {
    if (seconds <= bound)
      row.buckets[index]++;
  });
}
const encode = (labels: Readonly<Record<string, string>>) => Object.entries(labels).map(([key, value]) => `${key}="${value.replaceAll('\\', '\\\\').replaceAll('"', '\\"').replaceAll('\n', '\\n')}"`).join(',');
export function telemetryMetricsText(): string {
  const lines: string[] = [];
  const declarations = new Set<string>();
  for (const row of gauges.values()) {
    if (!declarations.has(row.name)) {
      lines.push(`# TYPE ${row.name} gauge`);
      declarations.add(row.name);
    }
    lines.push(`${row.name}{${encode(row.labels)}} ${row.value}`);
  }
  for (const [name, rows] of histograms) {
    lines.push(`# TYPE ${name} histogram`);
    for (const row of rows.values()) {
      for (const [index, bound] of bounds.entries())
        lines.push(`${name}_bucket{${encode({ ...row.labels, le: String(bound) })}} ${row.buckets[index]}`);
      lines.push(`${name}_bucket{${encode({ ...row.labels, le: '+Inf' })}} ${row.count}`, `${name}_count{${encode(row.labels)}} ${row.count}`, `${name}_sum{${encode(row.labels)}} ${row.sum}`);
    }
  }
  for (const [name, value] of counters)
    lines.push(`# TYPE ${name} counter`, `${name} ${value}`);
  return lines.join('\n') + '\n';
}
