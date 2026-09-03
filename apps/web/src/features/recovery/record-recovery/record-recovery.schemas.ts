import { z } from 'zod';

const RecoveryValueSchema = z.union([z.string(), z.number(), z.boolean(), z.null()]);
export const RecoveryItemSchema = z.object({
  auditLogId: z.string(), mode: z.enum(['UNDO', 'COMPENSATE', 'UNAVAILABLE']), title: z.string(), explanation: z.string(), canExecute: z.boolean(), expiresAt: z.string().nullable(), occurredAt: z.string(),
  changes: z.array(z.object({ field: z.string(), label: z.string(), before: RecoveryValueSchema, after: RecoveryValueSchema })),
  impacts: z.array(z.object({ label: z.string(), count: z.number().int().nonnegative() })),
});
export const RecoveryItemsSchema = z.array(RecoveryItemSchema);
export type RecoveryItem = z.infer<typeof RecoveryItemSchema>;
