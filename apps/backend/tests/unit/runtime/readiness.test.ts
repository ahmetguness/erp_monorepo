import { describe, expect, it, vi } from 'vitest';
import { ReadinessMonitor } from '../../../src/bootstrap/operations/readiness.js';
import { ProcessLifecycle } from '../../../src/bootstrap/operations/lifecycle.js';

describe('runtime readiness and drain', () => {
  it('bounds an uncooperative transport and never starts more probes behind it', async () => {
    vi.useFakeTimers();
    let release: () => void = () => undefined; let calls = 0;
    const blocked = new Promise<void>(resolve => { release = resolve; });
    const monitor = new ReadinessMonitor([{ name: 'database', check: () => { calls++; return blocked; } }], 0);
    try {
      const result = monitor.read(); await vi.advanceTimersByTimeAsync(3001);
      expect(await result).toEqual({ status: 'not_ready', checks: { database: 'down' } });
      expect((await monitor.read()).status).toBe('not_ready'); expect(calls).toBe(1);
      release(); await Promise.resolve(); await Promise.resolve();
      expect((await monitor.read()).status).toBe('ready'); expect(calls).toBe(2);
    } finally { release(); vi.useRealTimers(); }
  });
  it('reports dependency failures without exposing credentials or exception text', async () => {
    const monitor = new ReadinessMonitor([
      { name: 'database', check: async () => {} },
      { name: 'storage', check: async () => { throw new Error('secret-token@private-host'); } },
    ]);
    expect(await monitor.read()).toEqual({ status: 'not_ready', checks: { database: 'up', storage: 'down' } });
    expect(JSON.stringify(await monitor.read())).not.toContain('secret');
  });
  it('shares concurrent probes and caches completed results', async () => {
    let count = 0;
    const monitor = new ReadinessMonitor([{ name: 'database', check: async () => { count++; } }]);
    await Promise.all([monitor.read(), monitor.read(), monitor.read()]);
    await monitor.read();
    expect(count).toBe(1);
  });
  it('cannot become ready again if draining starts during a probe', async () => {
    let finish: () => void = () => {};
    const pending = new Promise<void>((resolve) => { finish = resolve; });
    const monitor = new ReadinessMonitor([{ name: 'database', check: () => pending }]);
    const request = monitor.read();
    monitor.beginDrain(); finish();
    expect((await request).status).toBe('not_ready');
    expect((await monitor.read()).checks).toEqual({ lifecycle: 'down' });
  });
  it('drains HTTP and jobs before disconnecting, with idempotent repeated signals', async () => {
    const order: string[] = [];
    let finishJob: () => void = () => {};
    const pendingJob = new Promise<void>((resolve) => { finishJob = resolve; });
    const lifecycle = new ProcessLifecycle({
      drain: () => { order.push('drain'); },
      stopAccepting: async () => { order.push('http'); },
      stopWorkers: async () => { await pendingJob; order.push('jobs'); },
      disconnect: async () => { order.push('disconnect'); },
      forceClose: () => { throw new Error('Unexpected forced shutdown.'); },
    });
    const first = lifecycle.shutdown();
    expect(lifecycle.shutdown()).toBe(first);
    await Promise.resolve();
    expect(order).toEqual(['drain', 'http']);
    finishJob(); await first;
    expect(order).toEqual(['drain', 'http', 'jobs', 'disconnect']);
  });
});
