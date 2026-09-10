import { z } from 'zod';
import { MODULE_KEY, PLAN } from '@repo/types/plans';
import type { ModuleKey } from '@repo/types/plans';

const optionalDate = z.string().datetime().nullable().optional();
const moduleValues = Object.values(MODULE_KEY) as [ModuleKey, ...ModuleKey[]];
export const tenantProvisioningInputSchema = z.object({
  companyName: z.string().trim().min(2).max(160),
  email: z.string().trim().email().max(254),
  ownerName: z.string().trim().min(2).max(120),
  slug: z.string().trim().min(2).max(80).optional(),
  phone: z.string().trim().max(40).optional(),
  city: z.string().trim().max(100).optional(),
  sector: z.string().trim().max(120).optional(),
  plan: z.enum([PLAN.STARTER, PLAN.PROFESSIONAL, PLAN.ENTERPRISE]),
  status: z.enum(['TRIAL', 'ACTIVE']),
  maxUsers: z.number().int().positive().nullable().optional(),
  modules: z.array(z.enum(moduleValues)).min(1).refine(modules => new Set(modules).size === modules.length, 'Modüller tekrarlanamaz.'),
  notes: z.string().trim().max(2000).optional(),
  isCustomPricing: z.boolean().optional(),
  trialEndsAt: optionalDate,
  subscriptionStart: optionalDate,
  subscriptionEnd: optionalDate,
}).strict();

export const idempotencyKeySchema = z.string().trim().min(8).max(120).regex(/^[A-Za-z0-9._:-]+$/);
