import { z } from 'zod';
import { apiClient } from '@/lib/api-client';
import { safeParse } from '@/lib/safe-parse';
import { SingleResponseSchema } from '@/types/api.types';

export const TaskStatusSchema = z.enum(['TODO', 'IN_PROGRESS', 'DONE', 'CANCELLED']);
export const TaskPrioritySchema = z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']);
export const TaskTypeSchema = z.enum(['APPROVAL', 'COLLECTION', 'SERVICE', 'NOTIFICATION', 'CHECK', 'AUTOMATION', 'GENERAL']);

export const TaskSchema = z.object({
  id: z.string(),
  tenantId: z.string(),
  title: z.string(),
  detail: z.string().nullable(),
  type: TaskTypeSchema,
  priority: TaskPrioritySchema,
  status: TaskStatusSchema,
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
export type TaskStatus = z.infer<typeof TaskStatusSchema>;
export type TaskPriority = z.infer<typeof TaskPrioritySchema>;
export type TaskType = z.infer<typeof TaskTypeSchema>;

export interface CreateTaskDTO {
  title: string;
  detail?: string | null;
  type?: TaskType;
  priority?: TaskPriority;
  module?: string | null;
  entityType?: string | null;
  entityId?: string | null;
  href?: string | null;
  source?: string | null;
  assignedToId?: string | null;
  dueAt?: string | null;
}

export const WorkflowTaskSchema = z.object({
  id: z.string(),
  type: z.enum(['APPROVAL', 'COLLECTION', 'SERVICE', 'NOTIFICATION', 'CHECK', 'AUTOMATION', 'STOCK', 'FISCAL', 'GENERAL']),
  title: z.string(),
  detail: z.string().nullable(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']),
  status: z.enum(['TODO', 'IN_PROGRESS', 'DONE', 'CANCELLED']).optional(),
  dueAt: z.string().nullable(),
  href: z.string(),
  sourceId: z.string(),
});

export const WorkflowCountsSchema = z.object({
  APPROVAL: z.coerce.number(),
  COLLECTION: z.coerce.number(),
  SERVICE: z.coerce.number(),
  NOTIFICATION: z.coerce.number(),
  CHECK: z.coerce.number(),
  AUTOMATION: z.coerce.number(),
  STOCK: z.coerce.number(),
  FISCAL: z.coerce.number(),
  GENERAL: z.coerce.number(),
});

const WorkflowResponseSchema = z.object({
  data: z.array(WorkflowTaskSchema),
  meta: z.object({
    total: z.coerce.number(),
    counts: WorkflowCountsSchema,
  }),
});

export type WorkflowTask = z.infer<typeof WorkflowTaskSchema>;
export type WorkflowCounts = z.infer<typeof WorkflowCountsSchema>;

export async function getWorkflowTasks(): Promise<{ data: WorkflowTask[]; meta: { total: number; counts: WorkflowCounts } }> {
  const res = await apiClient.get('/api/tasks');
  return safeParse(WorkflowResponseSchema, res.data, 'getWorkflowTasks');
}

export async function updateTaskStatus(id: string, status: TaskStatus): Promise<Task> {
  const res = await apiClient.patch(`/api/tasks/${id}`, { status });
  return safeParse(SingleResponseSchema(TaskSchema), res.data, 'updateTaskStatus').data;
}

export async function createTask(data: CreateTaskDTO): Promise<Task> {
  const res = await apiClient.post('/api/tasks', data);
  return safeParse(SingleResponseSchema(TaskSchema), res.data, 'createTask').data;
}
