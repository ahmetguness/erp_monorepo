import { PrismaClient } from '@prisma/client';
import { expect, it, vi } from 'vitest';
import { operationalMetrics } from '../../../src/modules/platform/application/observability/operational-probe.js';
it('returns explicit unknown health while the database transport is stalled, with one outstanding scan', async () => {
  const db = new PrismaClient({ datasources: { db: { url: 'postgresql://synthetic@127.0.0.1:1/phase3_deadline_ci' } } });
  const blocked = new Promise<never>(() => undefined);
  const transaction = vi.spyOn(db, '$transaction').mockReturnValue(blocked);
  vi.useFakeTimers();
  try {
    const first = operationalMetrics(db);
    await vi.advanceTimersByTimeAsync(3001);
    expect(await first).toContain('axon_operational_probe_up 0');
    const second = operationalMetrics(db);
    await vi.advanceTimersByTimeAsync(3001);
    expect(await second).toContain('axon_operational_probe_up 0');
    expect(transaction).toHaveBeenCalledOnce();
  }
  finally {
    transaction.mockRestore();
    vi.useRealTimers();
    await db.$disconnect();
  }
});
