import { EntityType, Priority, Prisma, TaskStatus, TaskType } from '@prisma/client';
import { prisma } from '../lib/prisma';

export interface TaskInput {
  title: string;
  detail?: string | null;
  type?: TaskType;
  priority?: Priority;
  module?: string | null;
  entityType?: EntityType | null;
  entityId?: string | null;
  href?: string | null;
  source?: string | null;
  assignedToId?: string | null;
  createdById?: string | null;
  dueAt?: Date | null;
}

export async function createTask(tenantId: string, input: TaskInput, tx: Prisma.TransactionClient | typeof prisma = prisma) {
  const data = {
    tenantId,
    title: input.title,
    detail: input.detail ?? null,
    type: input.type ?? TaskType.GENERAL,
    priority: input.priority ?? Priority.MEDIUM,
    status: TaskStatus.TODO,
    module: input.module ?? null,
    entityType: input.entityType ?? null,
    entityId: input.entityId ?? null,
    href: input.href ?? null,
    source: input.source ?? null,
    assignedToId: input.assignedToId ?? null,
    createdById: input.createdById ?? null,
    dueAt: input.dueAt ?? null,
  };

  if (input.source) {
    return tx.task.upsert({
      where: { tenantId_source: { tenantId, source: input.source } },
      create: data,
      update: {
        title: input.title,
        detail: input.detail ?? null,
        priority: input.priority ?? Priority.MEDIUM,
        module: input.module ?? null,
        entityType: input.entityType ?? null,
        entityId: input.entityId ?? null,
        href: input.href ?? null,
        assignedToId: input.assignedToId ?? null,
        dueAt: input.dueAt ?? null,
        status: TaskStatus.TODO,
        completedAt: null,
      },
    });
  }

  return tx.task.create({ data });
}
