import { test } from 'node:test';
import assert from 'node:assert/strict';
import { actualTelemetryExportObserved, telemetryHealthy } from '../telemetry-health.js';

const text = 'axon_operational_probe_up 1\naxon_telemetry_export_failures_total 0\naxon_telemetry_dropped_spans_total 0\naxon_log_export_failures_total 0\naxon_log_export_dropped_total 0\n';
const healthy = { phase: 'soak-probe75', api: Array.from({ length: 5 }, () => ({ status: 200, text })) };

test('telemetry measurement requires complete healthy API and worker samples', () => {
  assert.equal(telemetryHealthy([healthy], 'soak-probe75', 5), true);
  assert.equal(telemetryHealthy([], 'soak-probe75', 5), false);
  assert.equal(telemetryHealthy([healthy], 'mixed-smoke', 5), false);
  assert.equal(telemetryHealthy([healthy], 'soak-probe75', 4), false);
  assert.equal(telemetryHealthy([healthy, { phase: 'soak-probe75', unavailable: true }], 'soak-probe75', 5), false);
  for (const modified of [text.replace('probe_up 1', 'probe_up 0'), text.replace('dropped_spans_total 0', 'dropped_spans_total 1'), text.replace('log_export_failures_total 0', 'log_export_failures_total 1'), '']) {
    assert.equal(telemetryHealthy([{ ...healthy, api: [...healthy.api.slice(0, 4), { status: 200, text: modified }] }], 'soak-probe75', 5), false);
  }
  assert.equal(telemetryHealthy([{ ...healthy, api: [{ status: 503, text }] }], 'soak-probe75', 1), false);
});

test('telemetry evidence requires actual successful trace and log delivery', () => {
  const points = ['axon_telemetry_exported_spans_total', 'axon_log_exported_total'].map(name => ({ metric: { __name__: name }, value: [1234, '12'] }));
  assert.equal(actualTelemetryExportObserved(points), true);
  assert.equal(actualTelemetryExportObserved([]), false);
  assert.equal(actualTelemetryExportObserved(points.slice(0, 1)), false);
  assert.equal(actualTelemetryExportObserved(points.map(point => ({ ...point, value: [1234, '0'] }))), false);
  assert.equal(actualTelemetryExportObserved([{ metric: { __name__: 'axon_log_exported_total' }, value: [1234, 'NaN'] }]), false);
});
