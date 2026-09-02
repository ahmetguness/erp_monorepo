import { prisma } from '../../lib/prisma.js';
import { TodayWorkQueueQueries } from './application/today-work-queue/index.js';
import { PrismaTodayWorkQueueRepository } from './infrastructure/persistence/prisma-today-work-queue.repository.js';

const todayWorkQueueRepository = new PrismaTodayWorkQueueRepository(prisma);

export const platformApplication = {
  todayWorkQueueQueries: new TodayWorkQueueQueries(todayWorkQueueRepository),
} as const;
