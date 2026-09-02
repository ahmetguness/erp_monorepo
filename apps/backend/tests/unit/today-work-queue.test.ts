import { describe, expect, it } from 'vitest';
import { TodayWorkQueueQueries } from '../../src/modules/platform/application/today-work-queue/today-work-queue.queries.js';
import type { TodayWorkQueueRepository } from '../../src/modules/platform/application/today-work-queue/today-work-queue.repository.js';

const now = new Date('2026-09-02T09:00:00.000Z');

describe('TodayWorkQueueQueries', () => {
  it('risk, SLA ve finansal etkiyle işleri açıklanabilir biçimde sıralar', async () => {
    const repository: TodayWorkQueueRepository = { findCandidates: async () => [
      { id: 'task:1', sourceId: '1', kind: 'TASK', title: 'Normal görev', detail: null, risk: 'LOW', dueAt: null, occurredAt: now, monetaryImpact: null, assignee: null, reason: 'Atandı', action: { kind: 'COMPLETE', label: 'Tamamla', href: '/dashboard' } },
      { id: 'invoice:1', sourceId: '1', kind: 'ANOMALY', title: 'Gecikmiş fatura', detail: null, risk: 'HIGH', dueAt: new Date('2026-09-01T09:00:00.000Z'), occurredAt: now, monetaryImpact: 100_000, assignee: null, reason: 'Vade geçti', action: { kind: 'OPEN', label: 'Aç', href: '/dashboard/invoices/1' } },
    ] };
    const queue = await new TodayWorkQueueQueries(repository).getToday('tenant-1', 'user-1', now);
    expect(queue.items[0]?.id).toBe('invoice:1');
    expect(queue.items[0]?.sla.state).toBe('BREACHED');
    expect(queue.summary.monetaryImpact).toBe(100_000);
  });

  it('kuyruğu kırk iş ile sınırlar', async () => {
    const repository: TodayWorkQueueRepository = { findCandidates: async () => Array.from({ length: 45 }, (_, index) => ({
      id: `task:${index}`, sourceId: String(index), kind: 'TASK' as const, title: `Görev ${index}`, detail: null,
      risk: 'MEDIUM' as const, dueAt: null, occurredAt: now, monetaryImpact: null, assignee: null, reason: 'Atandı',
      action: { kind: 'COMPLETE' as const, label: 'Tamamla', href: '/dashboard' },
    })) };
    expect((await new TodayWorkQueueQueries(repository).getToday('tenant-1', 'user-1', now)).items).toHaveLength(40);
  });
});
