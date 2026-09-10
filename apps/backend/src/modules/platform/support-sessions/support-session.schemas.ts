import { z } from 'zod';
import { SUPPORT_SCOPES } from '@repo/types';

export const createSupportSessionSchema = z.object({
  tenantId: z.string().min(1).max(100),
  targetUserId: z.string().min(1).max(100),
  reason: z.string().trim().min(10).max(2000),
  ticketId: z.string().trim().min(1).max(120),
  scopes: z.array(z.enum(SUPPORT_SCOPES)).min(1).max(2),
  durationMinutes: z.number().int().min(5).max(60),
  writeRequested: z.boolean().default(false),
}).strict().refine(input => !input.writeRequested || input.scopes.includes('CONTACTS'), 'Yazma talebi cari kapsamını gerektirir.');

export const supportDecisionSchema = z.object({
  action: z.enum(['approve', 'approve-write', 'revoke']),
}).strict();

export const supportContactNoteSchema = z.object({ notes: z.string().max(4000) }).strict();
