import { number, object } from './validation.js';

function memoryBytes(value: string): number {
  const match = /^([\d.]+)\s*(B|KiB|MiB|GiB)/.exec(value);
  if (!match) return 0;
  return Number(match[1]) * ({ B: 1, KiB: 1024, MiB: 1024 ** 2, GiB: 1024 ** 3 }[match[2]] ?? 0);
}
export function analyzeResources(samples: readonly unknown[]): string {
  const roles = new Map<string, { maxCpu: number; maxMemory: number }>();
  let connections = 0; let waits = 0; let deadlocks = 0; let oldest = 0; let poolTimeouts = 0; let processed = 0;
  for (const sample of samples) {
    const row = object(sample); if (row.unavailable) continue;
    const db = object(row.database); const database = object(db.database); const queue = object(db.queue);
    connections = Math.max(connections, number(database.connections)); waits = Math.max(waits, number(database.lockWaiters)); deadlocks = Math.max(deadlocks, number(database.deadlocks));
    oldest = Math.max(oldest, number(queue.oldestSeconds)); processed = Math.max(processed, number(queue.processed));
    if (Array.isArray(row.containers)) for (const value of row.containers) {
      const container = object(value); if (typeof container.Name !== 'string' || typeof container.CPUPerc !== 'string' || typeof container.MemUsage !== 'string') continue;
      const role = /-api-\d+$/.test(container.Name) ? 'api (per replica peak)' : /-load-/.test(container.Name) ? 'load generator' : container.Name.split('-').at(-1) ?? 'unknown';
      const previous = roles.get(role) ?? { maxCpu: 0, maxMemory: 0 };
      previous.maxCpu = Math.max(previous.maxCpu, Number(container.CPUPerc.replace('%', '')) || 0); previous.maxMemory = Math.max(previous.maxMemory, memoryBytes(container.MemUsage)); roles.set(role, previous);
    }
    if (Array.isArray(row.api)) for (const value of row.api) {
      const metric = object(value); if (typeof metric.text !== 'string') continue;
      const match = /^axon_database_pool_timeouts_total\s+(\d+)$/m.exec(metric.text);
      if (match) poolTimeouts = Math.max(poolTimeouts, Number(match[1]));
    }
  }
  const rows = [...roles].map(([role, values]) => `| ${role} | ${values.maxCpu.toFixed(1)} | ${(values.maxMemory / 2 ** 20).toFixed(1)} |`).join('\n');
  return `# Resource and queue observations\n\nDocker CPU 100% represents one logical core. These are sampled peaks; short spikes can be missed.\n\n| Role | Peak CPU % | Peak resident/container MiB |\n|---|---:|---:|\n${rows}\n\nObserved DB connections: ${connections}; simultaneous lock waiters: ${waits}; deadlocks: ${deadlocks}; API pool timeouts (maximum process counter): ${poolTimeouts}. Maximum observed oldest queue age: ${oldest.toFixed(2)}s. Processed durable events: ${processed}. Resource JSON includes SQL query IDs and timings, queue completion p95, per-process heap/event loop metrics and timestamps for further comparison. PostgreSQL provides per-statement execution timings. Client operation counters were model-only in older builds; optimized builds also include parameterized raw operations.\n`;
}
