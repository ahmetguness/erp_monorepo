import { monitorEventLoopDelay, performance } from "node:perf_hooks";

const loopDelay = monitorEventLoopDelay({ resolution: 20 });
loopDelay.enable();
let databaseOperations = 0;
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
): Promise<T> {
  const started = Date.now();
  try {
    const result = await operation();
    recordDatabaseOperation(Date.now() - started);
    return result;
  } catch (error) {
    recordDatabaseOperation(Date.now() - started, error);
    throw error;
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
    axon_database_operation_milliseconds_total: databaseMilliseconds,
    axon_database_pool_timeouts_total: poolTimeouts,
    axon_realtime_connections: realtimeConnections,
  };
}
