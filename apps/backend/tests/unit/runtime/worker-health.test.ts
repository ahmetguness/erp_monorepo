import { describe, expect, it, vi } from 'vitest';

async function registry() {
  vi.resetModules();
  return import('../../../src/modules/shared/infrastructure/worker-health.js');
}
describe('worker heartbeat eligibility', () => {
  it('does not report an empty or partially stopped worker group as healthy', async () => {
    const health = await registry();
    expect(health.areWorkersHealthy()).toBe(false);
    health.recordWorkerStarted('outbox', 10_000); health.recordWorkerStarted('marketplace', 5_000);
    expect(health.areWorkersHealthy()).toBe(true);
    health.recordWorkerTick('outbox', 'stopped');
    expect(health.areWorkersHealthy()).toBe(false);
    health.recordWorkerStarted('outbox', 10_000);
    expect(health.areWorkersHealthy()).toBe(true);
  });
  it('expires stalled jobs and worker loops that never complete a successful tick', async () => {
    const health = await registry();
    health.recordWorkerStarted('outbox', 10_000);
    expect(health.areWorkersHealthy(Date.now() + 90_000)).toBe(false);
    health.recordWorkerTick('outbox', 'started');
    expect(health.areWorkersHealthy()).toBe(true);
    expect(health.areWorkersHealthy(Date.now() + 400_000)).toBe(false);
    health.recordWorkerTick('outbox', 'succeeded'); health.recordWorkerTick('outbox', 'finished');
    expect(health.areWorkersHealthy()).toBe(true);
  });
});
