import { z } from 'zod';
import { apiClient } from '@/lib/api-client';
import { safeParse } from '@/lib/safe-parse';
import { SingleResponseSchema } from '@/types/api.types';

export const CollectionReminderSchema = z.object({
  id: z.string(),
  tenantId: z.string(),
  invoiceId: z.string().nullable(),
  contactId: z.string(),
  dueDate: z.string(),
  amount: z.coerce.number(),
  remindAt: z.string().optional(),
  status: z.enum(['PENDING', 'SENT', 'FAILED', 'CANCELLED']),
  emailSent: z.boolean().optional(),
  smsSent: z.boolean().optional(),
  notes: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
  invoice: z.object({ id: z.string(), number: z.string() }).optional().nullable(),
  contact: z.object({ id: z.string(), name: z.string() }).optional().nullable(),
});

export type CollectionReminder = z.infer<typeof CollectionReminderSchema>;

export const CollectionAutomationItemSchema = z.object({
  invoiceId: z.string(),
  invoiceNumber: z.string(),
  contactId: z.string(),
  stage: z.enum(['PRE_DUE', 'DUE_DATE', 'EMAIL_DRAFT', 'FOLLOW_UP_TASK', 'ESCALATION', 'CLOSE_PAID']),
  status: z.enum(['CREATED', 'SKIPPED', 'CLOSED']),
  reminderId: z.string().nullable(),
  taskId: z.string().nullable(),
  message: z.string(),
});

export const CollectionAutomationSnapshotSchema = z.object({
  generatedAt: z.string(),
  scanned: z.coerce.number(),
  createdReminders: z.coerce.number(),
  createdTasks: z.coerce.number(),
  closedReminders: z.coerce.number(),
  items: z.array(CollectionAutomationItemSchema),
});

export type CollectionAutomationSnapshot = z.infer<typeof CollectionAutomationSnapshotSchema>;

export interface CreateCollectionReminderDTO {
  invoiceId: string;
  contactId: string;
  dueDate: string;
  amount: number;
  remindAt: string;
  notes?: string;
}

export async function getCollectionReminders(): Promise<CollectionReminder[]> {
  const res = await apiClient.get('/api/collection-reminders');
  return safeParse(SingleResponseSchema(z.array(CollectionReminderSchema)), res.data, 'getCollectionReminders').data;
}

export async function createCollectionReminder(data: CreateCollectionReminderDTO): Promise<CollectionReminder> {
  const res = await apiClient.post('/api/collection-reminders', data);
  return safeParse(SingleResponseSchema(CollectionReminderSchema), res.data, 'createCollectionReminder').data;
}

export async function runCollectionAutomation(): Promise<CollectionAutomationSnapshot> {
  const res = await apiClient.post('/api/collection-reminders/automation/run');
  return safeParse(SingleResponseSchema(CollectionAutomationSnapshotSchema), res.data, 'runCollectionAutomation').data;
}

export async function updateCollectionReminderStatus(id: string, status: 'PENDING' | 'SENT' | 'FAILED'): Promise<CollectionReminder> {
  const res = await apiClient.patch(`/api/collection-reminders/${id}/status`, { status });
  return safeParse(SingleResponseSchema(CollectionReminderSchema), res.data, 'updateCollectionReminderStatus').data;
}

export async function deleteCollectionReminder(id: string): Promise<void> {
  await apiClient.delete(`/api/collection-reminders/${id}`);
}
