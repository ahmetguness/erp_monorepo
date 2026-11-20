import { monitorEventLoopDelay, performance } from "node:perf_hooks";
import { withSpan } from './telemetry/tracing.js';
import { observeTelemetry, countTelemetry } from './telemetry/metrics.js';

const loopDelay = monitorEventLoopDelay({ resolution: 20 });
loopDelay.enable();
let databaseOperations = 0;
let activeDatabaseOperations = 0;
let databaseMilliseconds = 0;
let poolTimeouts = 0;
let realtimeConnections = 0;

export function recordDatabaseOperation(
  milliseconds: number,
  error?: unknown,
): void {
  databaseOperations++;
  databaseMilliseconds += milliseconds;
  if (
    error &&
    typeof error === "object" &&
    "code" in error &&
    error.code === "P2024"
  )
    poolTimeouts++;
}
export async function observeDatabaseOperation<T>(
  operation: () => Promise<T>,
  model = 'raw', action = 'query',
): Promise<T> {
  const started = Date.now();
  activeDatabaseOperations++;
  try {
    const result = await withSpan('database.operation', 3, { 'db.system.name': 'postgresql', 'db.collection.name': model, 'db.operation.name': action }, operation);
    recordDatabaseOperation(Date.now() - started);
    return result;
  } catch (error) {
    countTelemetry('axon_database_failures_total');
    recordDatabaseOperation(Date.now() - started, error);
    throw error;
  } finally {
    activeDatabaseOperations--;
    observeTelemetry('axon_database_operation_duration_seconds', (Date.now() - started) / 1000, { model, action });
  }
}
export function trackRealtimeConnection(): () => void {
  realtimeConnections++;
  let closed = false;
  return () => {
    if (!closed) {
      closed = true;
      realtimeConnections--;
    }
  };
}
export function runtimePerformanceMetrics(): Readonly<Record<string, number>> {
  const memory = process.memoryUsage();
  const cpu = process.cpuUsage();
  return {
    axon_process_resident_bytes: memory.rss,
    axon_process_heap_used_bytes: memory.heapUsed,
    axon_process_cpu_seconds_total: (cpu.user + cpu.system) / 1_000_000,
    axon_event_loop_utilization_ratio:
      performance.eventLoopUtilization().utilization,
    axon_event_loop_delay_p99_milliseconds:
      loopDelay.percentile(99) / 1_000_000,
    axon_database_operations_total: databaseOperations,
    axon_database_operations_inflight: activeDatabaseOperations,
    axon_database_operation_milliseconds_total: databaseMilliseconds,
    axon_database_pool_timeouts_total: poolTimeouts,
    axon_realtime_connections: realtimeConnections,
  };
}
