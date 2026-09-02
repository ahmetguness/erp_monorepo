import type { TodayWorkCandidate } from './today-work-queue.types.js';

export interface TodayWorkQueueRepository {
  findCandidates(tenantId: string, userId: string, now: Date): Promise<readonly TodayWorkCandidate[]>;
}
