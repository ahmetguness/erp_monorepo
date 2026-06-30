import { z } from 'zod';
import { apiClient } from '@/lib/api-client';
import { safeParse } from '@/lib/safe-parse';
import { SingleResponseSchema } from '@/types/api.types';

export const CollectionReminderSchema = z.object({
  id: z.string(),
  tenantId: z.string(),
  invoiceId: z.string(),
  contactId: z.string(),
  dueDate: z.string(),
  amount: z.coerce.number(),
  remindAt: z.string(),
  status: z.enum(['PENDING', 'SENT', 'FAILED']),
  emailSent: z.boolean(),
  smsSent: z.boolean(),
  notes: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
  invoice: z.object({ id: z.string(), number: z.string() }).optional().nullable(),
  contact: z.object({ id: z.string(), name: z.string() }).optional().nullable(),
});

export type CollectionReminder = z.infer<typeof CollectionReminderSchema>;

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

export async function updateCollectionReminderStatus(id: string, status: 'PENDING' | 'SENT' | 'FAILED'): Promise<CollectionReminder> {
  const res = await apiClient.patch(`/api/collection-reminders/${id}/status`, { status });
  return safeParse(SingleResponseSchema(CollectionReminderSchema), res.data, 'updateCollectionReminderStatus').data;
}

export async function deleteCollectionReminder(id: string): Promise<void> {
  await apiClient.delete(`/api/collection-reminders/${id}`);
}
