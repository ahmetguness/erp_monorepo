import { z } from 'zod';
import { apiClient } from '@/lib/api-client';
import { safeParse } from '@/lib/safe-parse';
import { SingleResponseSchema } from '@/types/api.types';

export const TaskSchema = z.object({
  id: z.string(),
  tenantId: z.string(),
  title: z.string(),
  detail: z.string().nullable(),
  type: z.string(),
  priority: z.string(),
  status: z.string(),
  module: z.string().nullable(),
  entityType: z.string().nullable(),
  entityId: z.string().nullable(),
  href: z.string().nullable(),
  source: z.string().nullable(),
  assignedToId: z.string().nullable(),
  createdById: z.string().nullable(),
  dueAt: z.string().nullable(),
  completedAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type Task = z.infer<typeof TaskSchema>;
export type TaskStatus = 'TODO' | 'IN_PROGRESS' | 'DONE' | 'CANCELLED';

export async function updateTaskStatus(id: string, status: TaskStatus): Promise<Task> {
  const res = await apiClient.patch(`/api/tasks/${id}`, { status });
  return safeParse(SingleResponseSchema(TaskSchema), res.data, 'updateTaskStatus').data;
}
