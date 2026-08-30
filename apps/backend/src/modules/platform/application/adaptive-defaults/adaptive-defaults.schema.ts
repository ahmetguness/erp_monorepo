import { z } from 'zod';
import { ADAPTIVE_DEFAULT_FIELDS, ADAPTIVE_FORM_KINDS, ADAPTIVE_TRANSACTION_TYPES } from './adaptive-defaults.types.js';

export const adaptiveDefaultsQuerySchema = z.object({
  formKind: z.enum(ADAPTIVE_FORM_KINDS).default('invoice'),
  transactionType: z.enum(ADAPTIVE_TRANSACTION_TYPES),
  contactId: z.string().trim().min(1).optional(),
});

export const dismissAdaptiveDefaultSchema = z.object({
  formKind: z.enum(ADAPTIVE_FORM_KINDS),
  field: z.enum(ADAPTIVE_DEFAULT_FIELDS),
}).strict();
