import type { TodayWorkQueueRepository } from './today-work-queue.repository.js';
import type { TodayWorkCandidate, TodayWorkItem, TodayWorkQueue, TodayWorkRisk, TodayWorkSlaState } from './today-work-queue.types.js';

const RISK_SCORE: Record<TodayWorkRisk, number> = { LOW: 10, MEDIUM: 30, HIGH: 60, CRITICAL: 90 };

function slaFor(candidate: TodayWorkCandidate, now: Date): TodayWorkItem['sla'] {
  if (!candidate.dueAt) return { state: 'NO_DEADLINE', remainingMinutes: null };
  const remainingMinutes = Math.round((candidate.dueAt.getTime() - now.getTime()) / 60_000);
  const state: TodayWorkSlaState = remainingMinutes < 0 ? 'BREACHED' : remainingMinutes <= 24 * 60 ? 'DUE_SOON' : 'ON_TRACK';
  return { state, remainingMinutes };
}

function rank(candidate: TodayWorkCandidate, now: Date): TodayWorkItem {
  const sla = slaFor(candidate, now);
  const slaScore = sla.state === 'BREACHED' ? 50 : sla.state === 'DUE_SOON' ? 25 : 0;
  const monetaryScore = candidate.monetaryImpact === null ? 0 : Math.min(30, Math.round(Math.log10(Math.max(1, candidate.monetaryImpact)) * 6));
  return {
    ...candidate,
    dueAt: candidate.dueAt?.toISOString() ?? null,
    occurredAt: candidate.occurredAt.toISOString(),
    score: RISK_SCORE[candidate.risk] + slaScore + monetaryScore,
    sla,
  };
}

export class TodayWorkQueueQueries {
  constructor(private readonly repository: TodayWorkQueueRepository) {}

  async getToday(tenantId: string, userId: string, now = new Date()): Promise<TodayWorkQueue> {
    const items = (await this.repository.findCandidates(tenantId, userId, now))
      .map((candidate) => rank(candidate, now))
      .sort((left, right) => right.score - left.score || (left.dueAt ?? left.occurredAt).localeCompare(right.dueAt ?? right.occurredAt))
      .slice(0, 40);
    return {
      generatedAt: now.toISOString(),
      items,
      summary: {
        total: items.length,
        critical: items.filter((item) => item.risk === 'CRITICAL').length,
        breached: items.filter((item) => item.sla.state === 'BREACHED').length,
        monetaryImpact: items.reduce((sum, item) => sum + (item.monetaryImpact ?? 0), 0),
      },
    };
  }
}
