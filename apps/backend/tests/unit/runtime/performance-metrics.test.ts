import { expect, it } from 'vitest';
import { observeDatabaseOperation, recordDatabaseOperation, runtimePerformanceMetrics, trackRealtimeConnection } from '../../../src/lib/runtime-performance.js';

it('counts pool exhaustion and closed sockets without a negative connection count', () => {
  const before = runtimePerformanceMetrics();
  recordDatabaseOperation(12); recordDatabaseOperation(23, { code: 'P2024' });
  const close = trackRealtimeConnection();
  expect(runtimePerformanceMetrics().axon_realtime_connections).toBe(before.axon_realtime_connections + 1);
  close(); close();
  const after = runtimePerformanceMetrics();
  expect(after.axon_realtime_connections).toBe(before.axon_realtime_connections);
  expect(after.axon_database_pool_timeouts_total).toBe(before.axon_database_pool_timeouts_total + 1);
  expect(after.axon_database_operations_total).toBe(before.axon_database_operations_total + 2);
  expect(after.axon_database_operation_milliseconds_total).toBe(before.axon_database_operation_milliseconds_total + 35);
  expect(Object.values(after).every(Number.isFinite)).toBe(true);
});

it('observed raw operations retain values, count pool timeouts and rethrow the original error', async () => {
  const before = runtimePerformanceMetrics();
  expect(await observeDatabaseOperation(async () => 17)).toBe(17);
  const error = Object.assign(new Error('Exhausted pool'), { code: 'P2024' });
  await expect(observeDatabaseOperation(async () => { throw error; })).rejects.toBe(error);
  const after = runtimePerformanceMetrics();
  expect(after.axon_database_operations_total).toBe(before.axon_database_operations_total + 2);
  expect(after.axon_database_pool_timeouts_total).toBe(before.axon_database_pool_timeouts_total + 1);
});
