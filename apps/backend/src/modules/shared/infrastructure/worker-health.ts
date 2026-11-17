interface WorkerHealth {
  running: boolean;
  intervalMs: number;
  startedAt: number;
  activeAt: number | null;
  succeededAt: number | null;
}
const workers = new Map<string, WorkerHealth>();

export function recordWorkerStarted(name: string, intervalMs: number): void {
  workers.set(name, { running: true, intervalMs, startedAt: Date.now(), activeAt: null, succeededAt: null });
}
export function recordWorkerTick(name: string, phase: 'started' | 'succeeded' | 'finished' | 'stopped'): void {
  const state = workers.get(name);
  if (!state) return;
  if (phase === 'started') state.activeAt = Date.now();
  if (phase === 'succeeded') state.succeededAt = Date.now();
  if (phase === 'finished') state.activeAt = null;
  if (phase === 'stopped') state.running = false;
}
export function areWorkersHealthy(now = Date.now()): boolean {
  const active = [...workers.values()];
  return active.length > 0 && active.every((worker) => worker.running && (worker.activeAt !== null
    ? now - worker.activeAt < 330_000
    : now - (worker.succeededAt ?? worker.startedAt) < Math.max(60_000, worker.intervalMs * 3)));
}
