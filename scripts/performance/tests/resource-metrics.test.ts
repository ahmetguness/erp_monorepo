import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resourceMetricResponses, resourceMetricsHistory } from '../resource-metrics.js';
import { telemetryHealthy } from '../telemetry-health.js';

test('resource history keeps real health/failure/cost counters without duplicating histogram bodies', () => {
  const health = 'axon_operational_probe_up 1\naxon_telemetry_export_failures_total 0\naxon_telemetry_dropped_spans_total 0\naxon_log_export_failures_total 0\naxon_log_export_dropped_total 0\naxon_database_pool_timeouts_total 0\naxon_process_heap_used_bytes 12345\n';
  const histogram = Array.from({ length: 10000 }, (_, i) => `axon_database_operation_duration_seconds_bucket{le="${i}"} 4`).join('\n');
  const parsed = resourceMetricResponses.parse([{ status: 200, text: health + histogram }]);
  const compact = resourceMetricsHistory(parsed);
  assert.ok(compact[0].text.length < 1000);
  assert.match(compact[0].text, /axon_process_heap_used_bytes 12345/);
  assert.doesNotMatch(compact[0].text, /_bucket/);
  assert.equal(telemetryHealthy([{ phase: 'soak-probe75', api: compact }], 'soak-probe75', 1), true);
  const failed = resourceMetricsHistory([{ status: 200, text: health.replace('export_failures_total 0', 'export_failures_total 1') }]);
  assert.equal(telemetryHealthy([{ phase: 'soak-probe75', api: failed }], 'soak-probe75', 1), false);
  assert.equal(telemetryHealthy([{ phase: 'soak-probe75', api: resourceMetricsHistory([{ status: 503, text: '' }]) }], 'soak-probe75', 1), false);
});

test('resource metrics reject oversized or malformed transport responses', () => {
  assert.equal(resourceMetricResponses.safeParse([{ status: '200', text: '' }]).success, false);
  assert.equal(resourceMetricResponses.safeParse([{ status: 200, text: 'x'.repeat(2_000_001) }]).success, false);
  assert.equal(resourceMetricResponses.safeParse(Array.from({ length: 6 }, () => ({ status: 200, text: '' }))).success, false);
});
