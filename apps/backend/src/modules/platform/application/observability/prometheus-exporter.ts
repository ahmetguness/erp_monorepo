import { runtimePerformanceMetrics } from '../../../../lib/runtime-performance.js';
import { storageTransactionTelemetry } from '../../../storage-accounting/application/index.js';
import { telemetryMetricsText } from '../../../../lib/telemetry/metrics.js';
import { traceExporterMetrics } from '../../../../lib/telemetry/exporter.js';

/** Process metrics remain available when PostgreSQL is unavailable. */
export function renderProcessMetrics(): string {
  const values = { ...runtimePerformanceMetrics(), ...storageTransactionTelemetry().counters, ...traceExporterMetrics() };
  const lines = Object.entries(values).flatMap(([name, value]) => [`# TYPE ${name} ${name.endsWith('_total') ? 'counter' : 'gauge'}`, `${name} ${value}`]);
  return lines.join('\n') + '\n' + telemetryMetricsText();
}
