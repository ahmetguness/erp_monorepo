import { integer } from './validation.js';

function cpu(value: string | undefined, fallback: number): number {
  const parsed = value === undefined ? fallback : Number(value);
  if (!Number.isFinite(parsed) || parsed < 0.25 || parsed > 8) throw new Error('CPU budget must be 0.25..8 cores.');
  return parsed;
}

export function performanceBudget(env: NodeJS.ProcessEnv) {
  return {
    apiCpu: 2, apiMemoryMiB: 1024, apiPool: integer(env.PERF_API_POOL, 5, 2, 15),
    workerCpu: cpu(env.PERF_WORKER_CPU, 2), workerMemoryMiB: 1024, workerPool: 5,
    workerIntervalMs: integer(env.PERF_WORKER_INTERVAL_MS, 250, 100, 10_000),
    proxyCpu: cpu(env.PERF_PROXY_CPU, 0.5), proxyMemoryMiB: integer(env.PERF_PROXY_MEMORY_MIB, 256, 128, 2048),
    generatorCpu: cpu(env.PERF_GENERATOR_CPU, 2), generatorMemoryMiB: integer(env.PERF_GENERATOR_MEMORY_MIB, 1536, 512, 4096),
  };
}
